"""Execution layer for approved recommendations."""
from __future__ import annotations

from datetime import datetime, timezone

from utils.firestore_helpers import get_db

MAX_BUDGET_DELTA_PCT = 30.0
MIN_CONFIDENCE_TO_EXECUTE = 0.65
DEFAULT_POLICY = {
    "allowExecute": True,
    "allowRollback": True,
    "minConfidenceToExecute": MIN_CONFIDENCE_TO_EXECUTE,
    "maxBudgetDeltaPct": MAX_BUDGET_DELTA_PCT,
}


def execute_recommendation(user_id: str, account_id: str, recommendation: dict, policy: dict | None = None) -> dict:
    """Execute a single approved recommendation against Meta API."""
    from services.meta_api import MetaAPIService
    from services.meta_auth import get_decrypted_token

    effective_policy = _merge_policy(policy)
    if not effective_policy["allowExecute"]:
        raise ValueError("Execution disabled by policy")

    confidence = float(recommendation.get("confidence", 0) or 0)
    if confidence < effective_policy["minConfidenceToExecute"]:
        raise ValueError(f"Recommendation confidence too low for execution ({confidence:.2f})")

    execution_plan = recommendation.get("executionPlan") or {}
    action = str(execution_plan.get("action") or "").strip().lower()
    target_level = str(execution_plan.get("targetLevel") or recommendation.get("entityLevel") or "").strip().lower()
    target_id = str(execution_plan.get("targetId") or recommendation.get("entityId") or "").strip()

    if not action:
        raise ValueError("Recommendation has no execution plan")
    if not target_id:
        raise ValueError("Execution targetId is required")
    if target_level not in {"campaign", "adset"}:
        raise ValueError("Only campaign/adset execution is supported in this phase")

    token, _ = get_decrypted_token(user_id, account_id)
    api = MetaAPIService(access_token=token, account_id=account_id)

    if action == "set_status":
        desired_status = str(execution_plan.get("desiredStatus") or "").strip().lower()
        if desired_status not in {"active", "paused"}:
            raise ValueError("set_status requires desiredStatus=active|paused")
        old_status = _get_current_status(user_id, account_id, target_level, target_id)
        _execute_status_change(api, target_level, target_id, desired_status)
        _sync_status_firestore(user_id, account_id, target_level, target_id, desired_status)
        return {
            "action": action,
            "targetLevel": target_level,
            "targetId": target_id,
            "oldStatus": old_status,
            "desiredStatus": desired_status,
            "executedAt": datetime.now(timezone.utc),
        }

    if action == "adjust_budget":
        delta_pct = float(execution_plan.get("deltaPct", 0))
        if delta_pct == 0:
            raise ValueError("adjust_budget requires non-zero deltaPct")
        if abs(delta_pct) > effective_policy["maxBudgetDeltaPct"]:
            raise ValueError(
                f"adjust_budget deltaPct exceeds safety cap ({effective_policy['maxBudgetDeltaPct']}%)"
            )
        old_budget = _get_current_daily_budget(user_id, account_id, target_level, target_id)
        if old_budget <= 0:
            raise ValueError("Cannot adjust budget when current budget is unavailable")
        new_budget = max(1, int(round(old_budget * (1 + (delta_pct / 100.0)))))
        _execute_budget_change(api, target_level, target_id, new_budget)
        _sync_budget_firestore(user_id, account_id, target_level, target_id, new_budget)
        return {
            "action": action,
            "targetLevel": target_level,
            "targetId": target_id,
            "deltaPct": delta_pct,
            "oldBudget": old_budget,
            "newBudget": new_budget,
            "executedAt": datetime.now(timezone.utc),
        }

    if action == "clone_adset_ab_test":
        if target_level != "adset":
            raise ValueError("clone_adset_ab_test requires targetLevel=adset")
        variant_settings = execution_plan.get("variantSettings") or {}
        if not isinstance(variant_settings, dict):
            variant_settings = {}
        recommended_budget = int(execution_plan.get("recommendedTestBudget", 50) or 50)
        if recommended_budget <= 0:
            raise ValueError("clone_adset_ab_test requires recommendedTestBudget > 0")

        clone_result = api.clone_adset_for_ab_test(
            control_adset_id=target_id,
            variant_settings=variant_settings,
            recommended_test_budget=recommended_budget,
            status="ACTIVE",
        )
        variant_adset_id = str(clone_result.get("variantAdsetId") or "")
        if variant_adset_id:
            _sync_ab_test_variant_firestore(
                user_id=user_id,
                account_id=account_id,
                control_adset_id=target_id,
                variant_adset_id=variant_adset_id,
                variant_settings=variant_settings,
                recommended_budget=recommended_budget,
            )
        return {
            "action": action,
            "targetLevel": target_level,
            "targetId": target_id,
            "controlAdsetId": target_id,
            "variantAdsetId": variant_adset_id,
            "recommendedTestBudget": recommended_budget,
            "variableToChange": str(execution_plan.get("variableToChange") or "targeting"),
            "variantSettings": variant_settings,
            "executedAt": datetime.now(timezone.utc),
        }

    raise ValueError(f"Unsupported execution action: {action}")


def execute_preview(user_id: str, account_id: str, recommendation: dict, policy: dict | None = None) -> dict:
    """Return a non-mutating preview of execute impact."""
    effective_policy = _merge_policy(policy)
    if not effective_policy["allowExecute"]:
        return {"canExecute": False, "reason": "Execution disabled by policy"}

    confidence = float(recommendation.get("confidence", 0) or 0)
    execution_plan = recommendation.get("executionPlan") or {}
    action = str(execution_plan.get("action") or "").strip().lower()
    target_level = str(execution_plan.get("targetLevel") or recommendation.get("entityLevel") or "").strip().lower()
    target_id = str(execution_plan.get("targetId") or recommendation.get("entityId") or "").strip()

    if confidence < effective_policy["minConfidenceToExecute"]:
        return {"canExecute": False, "reason": f"Confidence too low ({confidence:.2f})"}
    if not action or action == "none":
        return {"canExecute": False, "reason": "Recommendation has no executable action"}
    if not target_id:
        return {"canExecute": False, "reason": "Execution targetId is required"}
    if target_level not in {"campaign", "adset"}:
        return {"canExecute": False, "reason": "Only campaign/adset execution is supported"}

    if action == "set_status":
        desired_status = str(execution_plan.get("desiredStatus") or "").strip().lower()
        if desired_status not in {"active", "paused"}:
            return {"canExecute": False, "reason": "set_status requires desiredStatus=active|paused"}
        current_status = _get_current_status(user_id, account_id, target_level, target_id)
        return {
            "canExecute": True,
            "action": "set_status",
            "targetLevel": target_level,
            "targetId": target_id,
            "currentStatus": current_status or "unknown",
            "desiredStatus": desired_status,
            "isNoop": current_status == desired_status and current_status != "",
        }

    if action == "adjust_budget":
        delta_pct = float(execution_plan.get("deltaPct", 0))
        if delta_pct == 0:
            return {"canExecute": False, "reason": "adjust_budget requires non-zero deltaPct"}
        if abs(delta_pct) > effective_policy["maxBudgetDeltaPct"]:
            return {"canExecute": False, "reason": f"deltaPct exceeds cap ({effective_policy['maxBudgetDeltaPct']}%)"}
        current_budget = _get_current_daily_budget(user_id, account_id, target_level, target_id)
        if current_budget <= 0:
            return {"canExecute": False, "reason": "Current budget is unavailable"}
        new_budget = max(1, int(round(current_budget * (1 + (delta_pct / 100.0)))))
        return {
            "canExecute": True,
            "action": "adjust_budget",
            "targetLevel": target_level,
            "targetId": target_id,
            "deltaPct": delta_pct,
            "currentBudget": int(current_budget),
            "newBudget": int(new_budget),
            "diffBudget": int(new_budget - current_budget),
        }

    if action == "clone_adset_ab_test":
        variant_settings = execution_plan.get("variantSettings") or {}
        if not isinstance(variant_settings, dict):
            return {"canExecute": False, "reason": "variantSettings must be an object"}
        recommended_budget = int(execution_plan.get("recommendedTestBudget", 50) or 50)
        if recommended_budget <= 0:
            return {"canExecute": False, "reason": "recommendedTestBudget must be > 0"}
        return {
            "canExecute": True,
            "action": "clone_adset_ab_test",
            "targetLevel": target_level,
            "targetId": target_id,
            "controlAdsetId": target_id,
            "recommendedTestBudget": recommended_budget,
            "variableToChange": str(execution_plan.get("variableToChange") or "targeting"),
            "variantSettings": variant_settings,
        }

    return {"canExecute": False, "reason": f"Unsupported execution action: {action}"}


def rollback_recommendation(user_id: str, account_id: str, recommendation: dict, policy: dict | None = None) -> dict:
    """Rollback a previously executed recommendation."""
    from services.meta_api import MetaAPIService
    from services.meta_auth import get_decrypted_token

    effective_policy = _merge_policy(policy)
    if not effective_policy["allowRollback"]:
        raise ValueError("Rollback disabled by policy")

    execution = recommendation.get("execution", {})
    result = execution.get("result", {}) if isinstance(execution, dict) else {}
    if not isinstance(result, dict):
        raise ValueError("Recommendation has no execution result for rollback")

    action = str(result.get("action") or "").strip().lower()
    target_level = str(result.get("targetLevel") or "").strip().lower()
    target_id = str(result.get("targetId") or "").strip()
    if not action or not target_level or not target_id:
        raise ValueError("Missing execution metadata for rollback")

    token, _ = get_decrypted_token(user_id, account_id)
    api = MetaAPIService(access_token=token, account_id=account_id)

    if action == "adjust_budget":
        old_budget = int(result.get("oldBudget", 0) or 0)
        if old_budget <= 0:
            raise ValueError("Rollback requires oldBudget")
        _execute_budget_change(api, target_level, target_id, old_budget)
        _sync_budget_firestore(user_id, account_id, target_level, target_id, old_budget)
        return {
            "action": "rollback_budget",
            "targetLevel": target_level,
            "targetId": target_id,
            "restoredBudget": old_budget,
            "rolledBackAt": datetime.now(timezone.utc),
        }

    if action == "set_status":
        old_status = str(result.get("oldStatus") or "").strip().lower()
        if old_status not in {"active", "paused"}:
            raise ValueError("Rollback requires oldStatus=active|paused")
        _execute_status_change(api, target_level, target_id, old_status)
        _sync_status_firestore(user_id, account_id, target_level, target_id, old_status)
        return {
            "action": "rollback_status",
            "targetLevel": target_level,
            "targetId": target_id,
            "restoredStatus": old_status,
            "rolledBackAt": datetime.now(timezone.utc),
        }

    if action == "clone_adset_ab_test":
        variant_adset_id = str(result.get("variantAdsetId") or "").strip()
        if not variant_adset_id:
            raise ValueError("Rollback requires variantAdsetId")
        api.pause_adset(variant_adset_id)
        _sync_status_firestore(user_id, account_id, "adset", variant_adset_id, "paused")
        return {
            "action": "rollback_status",
            "targetLevel": "adset",
            "targetId": variant_adset_id,
            "restoredStatus": "paused",
            "rolledBackAt": datetime.now(timezone.utc),
        }

    raise ValueError(f"Rollback not supported for action: {action}")


def rollback_preview(user_id: str, account_id: str, recommendation: dict, policy: dict | None = None) -> dict:
    """Return a non-mutating preview of rollback impact."""
    effective_policy = _merge_policy(policy)
    if not effective_policy["allowRollback"]:
        return {"canRollback": False, "reason": "Rollback disabled by policy"}

    execution = recommendation.get("execution", {})
    result = execution.get("result", {}) if isinstance(execution, dict) else {}
    if not isinstance(result, dict):
        raise ValueError("Recommendation has no execution result for rollback")

    action = str(result.get("action") or "").strip().lower()
    target_level = str(result.get("targetLevel") or "").strip().lower()
    target_id = str(result.get("targetId") or "").strip()
    if not action or not target_level or not target_id:
        raise ValueError("Missing execution metadata for rollback preview")

    if action == "adjust_budget":
        old_budget = int(result.get("oldBudget", 0) or 0)
        current_budget = int(_get_current_daily_budget(user_id, account_id, target_level, target_id) or 0)
        if old_budget <= 0 or current_budget <= 0:
            raise ValueError("Rollback preview requires old and current budget")
        return {
            "canRollback": True,
            "action": "rollback_budget",
            "targetLevel": target_level,
            "targetId": target_id,
            "currentBudget": current_budget,
            "restoredBudget": old_budget,
            "diffBudget": old_budget - current_budget,
        }

    if action == "set_status":
        old_status = str(result.get("oldStatus") or "").strip().lower()
        current_status = _get_current_status(user_id, account_id, target_level, target_id)
        if old_status not in {"active", "paused"}:
            raise ValueError("Rollback preview requires oldStatus=active|paused")
        return {
            "canRollback": True,
            "action": "rollback_status",
            "targetLevel": target_level,
            "targetId": target_id,
            "currentStatus": current_status or "unknown",
            "restoredStatus": old_status,
        }

    if action == "clone_adset_ab_test":
        variant_adset_id = str(result.get("variantAdsetId") or "").strip()
        if not variant_adset_id:
            raise ValueError("Rollback preview requires variantAdsetId")
        current_status = _get_current_status(user_id, account_id, "adset", variant_adset_id)
        return {
            "canRollback": True,
            "action": "rollback_status",
            "targetLevel": "adset",
            "targetId": variant_adset_id,
            "currentStatus": current_status or "unknown",
            "restoredStatus": "paused",
        }

    raise ValueError(f"Rollback preview not supported for action: {action}")


def _merge_policy(policy: dict | None) -> dict:
    merged = dict(DEFAULT_POLICY)
    if not isinstance(policy, dict):
        return merged
    merged["allowExecute"] = bool(policy.get("allowExecute", merged["allowExecute"]))
    merged["allowRollback"] = bool(policy.get("allowRollback", merged["allowRollback"]))
    merged["minConfidenceToExecute"] = float(
        policy.get("minConfidenceToExecute", merged["minConfidenceToExecute"])
    )
    merged["maxBudgetDeltaPct"] = float(policy.get("maxBudgetDeltaPct", merged["maxBudgetDeltaPct"]))
    return merged


def _execute_status_change(api: MetaAPIService, target_level: str, target_id: str, desired_status: str) -> None:
    if target_level == "campaign":
        if desired_status == "paused":
            api.pause_campaign(target_id)
        else:
            api.resume_campaign(target_id)
        return
    if desired_status == "paused":
        api.pause_adset(target_id)
    else:
        api.resume_adset(target_id)


def _execute_budget_change(api: MetaAPIService, target_level: str, target_id: str, new_budget: int) -> None:
    if target_level == "campaign":
        api.update_campaign_daily_budget(target_id, new_budget)
    else:
        api.update_adset_daily_budget(target_id, new_budget)


def _doc_ref(user_id: str, account_id: str, target_level: str, target_id: str):
    db = get_db()
    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaigns")
    )
    if target_level == "campaign":
        return base_ref.document(target_id)

    for campaign_doc in base_ref.stream():
        adset_ref = campaign_doc.reference.collection("adsets").document(target_id)
        if adset_ref.get().exists:
            return adset_ref
    return None


def _get_current_daily_budget(user_id: str, account_id: str, target_level: str, target_id: str) -> float:
    ref = _doc_ref(user_id, account_id, target_level, target_id)
    if not ref:
        return 0.0
    doc = ref.get()
    if not doc.exists:
        return 0.0
    data = doc.to_dict() or {}
    return float(data.get("dailyBudget", 0) or 0)


def _get_current_status(user_id: str, account_id: str, target_level: str, target_id: str) -> str:
    ref = _doc_ref(user_id, account_id, target_level, target_id)
    if not ref:
        return ""
    doc = ref.get()
    if not doc.exists:
        return ""
    data = doc.to_dict() or {}
    status = str(data.get("status", "")).strip().upper()
    if status == "ACTIVE":
        return "active"
    if status == "PAUSED":
        return "paused"
    return ""


def _sync_budget_firestore(user_id: str, account_id: str, target_level: str, target_id: str, budget: int) -> None:
    ref = _doc_ref(user_id, account_id, target_level, target_id)
    if not ref:
        return
    ref.update({"dailyBudget": budget, "lastSynced": datetime.now(timezone.utc)})


def _sync_status_firestore(user_id: str, account_id: str, target_level: str, target_id: str, desired_status: str) -> None:
    ref = _doc_ref(user_id, account_id, target_level, target_id)
    if not ref:
        return
    ref.update(
        {
            "status": "ACTIVE" if desired_status == "active" else "PAUSED",
            "lastSynced": datetime.now(timezone.utc),
        }
    )


def _sync_ab_test_variant_firestore(
    *,
    user_id: str,
    account_id: str,
    control_adset_id: str,
    variant_adset_id: str,
    variant_settings: dict,
    recommended_budget: int,
) -> None:
    control_ref = _doc_ref(user_id, account_id, "adset", control_adset_id)
    if not control_ref:
        return
    parent = control_ref.parent
    variant_ref = parent.document(variant_adset_id)
    control_doc = control_ref.get()
    control_data = control_doc.to_dict() if control_doc.exists else {}
    variant_ref.set(
        {
            **(control_data or {}),
            "metaAdsetId": variant_adset_id,
            "name": f"{(control_data or {}).get('name', 'AdSet')} | AB Variant",
            "status": "ACTIVE",
            "dailyBudget": int(recommended_budget),
            "abTestSourceAdsetId": control_adset_id,
            "abTestVariantSettings": variant_settings,
            "lastSynced": datetime.now(timezone.utc),
        },
        merge=True,
    )
