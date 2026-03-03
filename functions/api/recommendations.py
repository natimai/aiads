"""API endpoints for AI recommendations lifecycle."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from api.accounts import _cors_response, verify_auth
from services.recommendation_executor import (
    execute_preview,
    execute_recommendation,
    rollback_preview,
    rollback_recommendation,
)
from services.recommendation_engine import RecommendationEngine
from utils.firestore_helpers import get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)
DEFAULT_POLICY = {
    "allowExecute": True,
    "allowRollback": True,
    "minConfidenceToExecute": 0.65,
    "maxBudgetDeltaPct": 30.0,
}


def _field_filter(field: str, op: str, value):
    from google.cloud.firestore_v1.base_query import FieldFilter

    return FieldFilter(field, op, value)


def handle_recommendations(request):
    """Route handler for /api/recommendations endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/recommendations/generate" and request.method == "POST":
            return _generate_recommendations(request, user_id)

        if path.startswith("/api/recommendations/policy/") and request.method == "GET":
            account_id = path.split("/api/recommendations/policy/")[1]
            return _get_policy(user_id, account_id)

        if path.startswith("/api/recommendations/policy/") and request.method == "POST":
            account_id = path.split("/api/recommendations/policy/")[1]
            return _save_policy(request, user_id, account_id)

        if path.startswith("/api/recommendations/") and path.endswith("/approve") and request.method == "POST":
            recommendation_id = path.split("/api/recommendations/")[1].split("/approve")[0]
            return _review_recommendation(request, user_id, recommendation_id, "approved")

        if path.startswith("/api/recommendations/") and path.endswith("/reject") and request.method == "POST":
            recommendation_id = path.split("/api/recommendations/")[1].split("/reject")[0]
            return _review_recommendation(request, user_id, recommendation_id, "rejected")

        if path.startswith("/api/recommendations/") and path.endswith("/execute") and request.method == "POST":
            recommendation_id = path.split("/api/recommendations/")[1].split("/execute")[0]
            return _execute_recommendation(request, user_id, recommendation_id)

        if path.startswith("/api/recommendations/") and path.endswith("/execute-preview") and request.method == "GET":
            recommendation_id = path.split("/api/recommendations/")[1].split("/execute-preview")[0]
            return _execute_preview(request, user_id, recommendation_id)

        if path.startswith("/api/recommendations/") and path.endswith("/rollback") and request.method == "POST":
            recommendation_id = path.split("/api/recommendations/")[1].split("/rollback")[0]
            return _rollback_recommendation(request, user_id, recommendation_id)

        if path.startswith("/api/recommendations/") and path.endswith("/rollback-preview") and request.method == "GET":
            recommendation_id = path.split("/api/recommendations/")[1].split("/rollback-preview")[0]
            return _rollback_preview(request, user_id, recommendation_id)

        if path.startswith("/api/recommendations/") and path.endswith("/executions") and request.method == "GET":
            recommendation_id = path.split("/api/recommendations/")[1].split("/executions")[0]
            return _list_executions(request, user_id, recommendation_id)

        if path.startswith("/api/recommendations/") and request.method == "GET":
            account_id = path.split("/api/recommendations/")[1]
            return _list_recommendations(request, user_id, account_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)
    except PermissionError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 401)
    except Exception as exc:
        logger.error("Recommendations API error: %s", exc, exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _list_recommendations(request, user_id: str, account_id: str):
    db = get_db()
    status = request.args.get("status")
    rec_type = request.args.get("type")
    priority = request.args.get("priority")
    limit = int(request.args.get("limit", 50))
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
    )
    query = base_ref
    if status:
        query = query.where(filter=_field_filter("status", "==", status))
    if rec_type:
        query = query.where(filter=_field_filter("type", "==", rec_type))
    if priority:
        query = query.where(filter=_field_filter("priority", "==", priority))
    if date_from:
        query = query.where(filter=_field_filter("createdAt", ">=", _to_dt(date_from)))
    if date_to:
        query = query.where(filter=_field_filter("createdAt", "<=", _to_dt(date_to, end_of_day=True)))

    docs = query.order_by("createdAt", direction="DESCENDING").limit(max(1, min(limit, 200))).stream()
    recommendations = [{"id": doc.id, **_serialize(doc.to_dict() or {})} for doc in docs]
    return _cors_response(json.dumps({"recommendations": recommendations, "count": len(recommendations)}))


def _generate_recommendations(request, user_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    date_from = payload.get("dateFrom")
    date_to = payload.get("dateTo")
    max_items = int(payload.get("maxItems", 12))

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")

    db = get_db()
    engine = RecommendationEngine(db)
    output = engine.generate(user_id, account_id, date_from, date_to, max_items=max_items)
    recommendations = output.get("recommendations", [])
    meta = output.get("meta", {})
    if meta.get("guardrailBlocked"):
        return _cors_response(json.dumps({"recommendations": [], "meta": meta}))

    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
    )

    added_ids: list[str] = []
    for rec in recommendations:
        if _is_recent_duplicate(rec_ref, rec):
            continue
        doc_ref = rec_ref.document()
        doc_ref.set(rec)
        added_ids.append(doc_ref.id)

    log_event(
        "recommendations_generated",
        user_id=user_id,
        account_id=account_id,
        generated=len(added_ids),
        campaigns_analyzed=meta.get("campaignsAnalyzed", 0),
    )
    return _cors_response(
        json.dumps(
            {
                "recommendationIds": added_ids,
                "generated": len(added_ids),
                "meta": meta,
            }
        )
    )


def _review_recommendation(request, user_id: str, recommendation_id: str, status: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    reason = payload.get("reason", "")
    modifications = payload.get("modifications")

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)

    now = datetime.now(timezone.utc)
    review_data: dict = {
        "status": status,
        "review": {
            "reviewedBy": user_id,
            "reviewedAt": now,
            "reason": reason,
        },
        "updatedAt": now,
    }

    if status == "approved" and isinstance(modifications, dict) and modifications:
        rec_data = rec_doc.to_dict() or {}
        original_plan = rec_data.get("executionPlan", {})
        original_content = rec_data.get("suggestedContent", {})
        review_data["originalPlan"] = original_plan
        review_data["originalSuggestedContent"] = original_content
        review_data["wasModified"] = True

        new_plan = dict(original_plan)
        if "deltaPct" in modifications:
            delta = float(modifications["deltaPct"])
            delta = min(delta, 20.0) if delta > 0 else max(delta, -50.0)
            new_plan["deltaPct"] = round(delta, 2)
        if "desiredStatus" in modifications and modifications["desiredStatus"] in ("active", "paused"):
            new_plan["desiredStatus"] = modifications["desiredStatus"]
        if "recommendedTestBudget" in modifications:
            try:
                new_plan["recommendedTestBudget"] = max(1, int(float(modifications["recommendedTestBudget"])))
            except (TypeError, ValueError):
                pass
        if "variantSettings" in modifications and isinstance(modifications["variantSettings"], dict):
            new_plan["variantSettings"] = modifications["variantSettings"]
        review_data["executionPlan"] = new_plan

        new_content = dict(original_content)
        if "creativeCopy" in modifications:
            new_content["creativeCopy"] = str(modifications["creativeCopy"])[:2000]
        if "audienceSuggestions" in modifications and isinstance(modifications["audienceSuggestions"], list):
            new_content["audienceSuggestions"] = [str(s)[:200] for s in modifications["audienceSuggestions"][:10]]
        if "testSetup" in modifications and isinstance(modifications["testSetup"], dict):
            new_content["testSetup"] = modifications["testSetup"]
        review_data["suggestedContent"] = new_content

    rec_ref.update(review_data)

    log_event(
        "recommendation_reviewed",
        user_id=user_id,
        account_id=account_id,
        recommendation_id=recommendation_id,
        status=status,
        was_modified=bool(modifications),
    )
    return _cors_response(json.dumps({"success": True, "status": status, "wasModified": bool(modifications)}))


def _execute_recommendation(request, user_id: str, recommendation_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)

    recommendation = rec_doc.to_dict() or {}
    if recommendation.get("status") != "approved":
        return _cors_response(json.dumps({"error": "Only approved recommendations can be executed"}), 400)
    if recommendation.get("executionPlan", {}).get("action") == "none":
        return _cors_response(json.dumps({"error": "Recommendation is not executable"}), 400)
    if _is_expired(recommendation.get("expiresAt")):
        return _cors_response(json.dumps({"error": "Recommendation is expired"}), 400)
    if not _is_account_data_fresh(db, user_id, account_id):
        return _cors_response(json.dumps({"error": "Account data is stale. Run sync before execution"}), 400)
    policy = _get_effective_policy(db, user_id, account_id)

    execution_log_ref = rec_ref.collection("executions").document()
    execution_log_ref.set(
        {
            "requestedBy": user_id,
            "requestedAt": datetime.now(timezone.utc),
            "status": "running",
            "action": recommendation.get("executionPlan", {}).get("action"),
            "targetId": recommendation.get("executionPlan", {}).get("targetId") or recommendation.get("entityId"),
        }
    )

    try:
        execution_result = execute_recommendation(user_id, account_id, recommendation, policy=policy)
        rec_ref.update(
            {
                "status": "executed",
                "execution": {
                    "executedBy": user_id,
                    "executedAt": datetime.now(timezone.utc),
                    "result": execution_result,
                },
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        execution_log_ref.update(
            {
                "status": "executed",
                "finishedAt": datetime.now(timezone.utc),
                "result": execution_result,
            }
        )
        log_event(
            "recommendation_executed",
            user_id=user_id,
            account_id=account_id,
            recommendation_id=recommendation_id,
            action=execution_result.get("action"),
            target_id=execution_result.get("targetId"),
        )
        return _cors_response(json.dumps({"success": True, "status": "executed", "result": _serialize(execution_result)}))
    except Exception as exc:
        rec_ref.update(
            {
                "status": "failed",
                "execution": {
                    "executedBy": user_id,
                    "executedAt": datetime.now(timezone.utc),
                    "error": str(exc),
                },
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        execution_log_ref.update(
            {
                "status": "failed",
                "finishedAt": datetime.now(timezone.utc),
                "error": str(exc),
            }
        )
        log_event(
            "recommendation_execution_failed",
            user_id=user_id,
            account_id=account_id,
            recommendation_id=recommendation_id,
            error=str(exc),
        )
        return _cors_response(json.dumps({"error": f"Execution failed: {str(exc)}"}), 500)


def _list_executions(request, user_id: str, recommendation_id: str):
    account_id = request.args.get("accountId")
    limit = int(request.args.get("limit", 20))
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)

    docs = (
        rec_ref.collection("executions")
        .order_by("requestedAt", direction="DESCENDING")
        .limit(max(1, min(limit, 100)))
        .stream()
    )
    executions = [{"id": doc.id, **_serialize(doc.to_dict() or {})} for doc in docs]
    return _cors_response(json.dumps({"executions": executions, "count": len(executions)}))


def _rollback_recommendation(request, user_id: str, recommendation_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)
    recommendation = rec_doc.to_dict() or {}
    if recommendation.get("status") != "executed":
        return _cors_response(json.dumps({"error": "Only executed recommendations can be rolled back"}), 400)
    policy = _get_effective_policy(db, user_id, account_id)

    execution_log_ref = rec_ref.collection("executions").document()
    execution_log_ref.set(
        {
            "requestedBy": user_id,
            "requestedAt": datetime.now(timezone.utc),
            "status": "running",
            "action": "rollback",
            "targetId": recommendation.get("entityId"),
        }
    )

    try:
        rollback_result = rollback_recommendation(user_id, account_id, recommendation, policy=policy)
        rec_ref.update(
            {
                "status": "approved",
                "rollback": {
                    "rolledBackBy": user_id,
                    "rolledBackAt": datetime.now(timezone.utc),
                    "result": rollback_result,
                },
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        execution_log_ref.update(
            {
                "status": "executed",
                "finishedAt": datetime.now(timezone.utc),
                "result": rollback_result,
            }
        )
        log_event(
            "recommendation_rolled_back",
            user_id=user_id,
            account_id=account_id,
            recommendation_id=recommendation_id,
            target_id=rollback_result.get("targetId"),
        )
        return _cors_response(json.dumps({"success": True, "status": "approved", "result": _serialize(rollback_result)}))
    except Exception as exc:
        execution_log_ref.update(
            {
                "status": "failed",
                "finishedAt": datetime.now(timezone.utc),
                "error": str(exc),
            }
        )
        log_event(
            "recommendation_rollback_failed",
            user_id=user_id,
            account_id=account_id,
            recommendation_id=recommendation_id,
            error=str(exc),
        )
        return _cors_response(json.dumps({"error": f"Rollback failed: {str(exc)}"}), 500)


def _rollback_preview(request, user_id: str, recommendation_id: str):
    account_id = request.args.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)
    recommendation = rec_doc.to_dict() or {}
    if recommendation.get("status") != "executed":
        return _cors_response(json.dumps({"error": "Only executed recommendations can be previewed"}), 400)
    policy = _get_effective_policy(db, user_id, account_id)

    try:
        preview = rollback_preview(user_id, account_id, recommendation, policy=policy)
        return _cors_response(json.dumps({"preview": _serialize(preview)}))
    except Exception as exc:
        return _cors_response(json.dumps({"error": f"Rollback preview failed: {str(exc)}"}), 400)


def _execute_preview(request, user_id: str, recommendation_id: str):
    account_id = request.args.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    db = get_db()
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
        .document(recommendation_id)
    )
    rec_doc = rec_ref.get()
    if not rec_doc.exists:
        return _cors_response(json.dumps({"error": "Recommendation not found"}), 404)
    recommendation = rec_doc.to_dict() or {}
    if recommendation.get("status") != "approved":
        return _cors_response(json.dumps({"error": "Only approved recommendations can be previewed"}), 400)
    if _is_expired(recommendation.get("expiresAt")):
        return _cors_response(json.dumps({"error": "Recommendation is expired"}), 400)
    if not _is_account_data_fresh(db, user_id, account_id):
        return _cors_response(json.dumps({"error": "Account data is stale. Run sync before execution"}), 400)
    policy = _get_effective_policy(db, user_id, account_id)

    try:
        preview = execute_preview(user_id, account_id, recommendation, policy=policy)
        return _cors_response(json.dumps({"preview": _serialize(preview)}))
    except Exception as exc:
        return _cors_response(json.dumps({"error": f"Execute preview failed: {str(exc)}"}), 400)


def _get_policy(user_id: str, account_id: str):
    db = get_db()
    policy = _get_effective_policy(db, user_id, account_id)
    return _cors_response(json.dumps({"policy": policy}))


def _save_policy(request, user_id: str, account_id: str):
    payload = request.get_json(silent=True) or {}
    db = get_db()
    policy = _sanitize_policy(payload)
    account_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    account_ref.set({"recommendationPolicy": policy, "policyUpdatedAt": datetime.now(timezone.utc)}, merge=True)
    return _cors_response(json.dumps({"success": True, "policy": policy}))


def _is_recent_duplicate(rec_ref, candidate: dict) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=6)
    docs = (
        rec_ref.where(filter=_field_filter("type", "==", candidate.get("type")))
        .where(filter=_field_filter("entityId", "==", candidate.get("entityId")))
        .where(filter=_field_filter("status", "==", "pending"))
        .where(filter=_field_filter("createdAt", ">=", since))
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)


def _to_dt(date_str: str, *, end_of_day: bool = False) -> datetime:
    suffix = "T23:59:59+00:00" if end_of_day else "T00:00:00+00:00"
    return datetime.fromisoformat(f"{date_str}{suffix}")


def _coerce_datetime(value):
    if hasattr(value, "tzinfo"):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _is_expired(expires_at) -> bool:
    dt = _coerce_datetime(expires_at)
    if not dt:
        return False
    return dt < datetime.now(timezone.utc)


def _is_account_data_fresh(db, user_id: str, account_id: str) -> bool:
    account_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    account_doc = account_ref.get()
    if not account_doc.exists:
        return False
    data = account_doc.to_dict() or {}
    kpi_updated = _coerce_datetime(data.get("kpiUpdatedAt"))
    if not kpi_updated:
        return False
    return (datetime.now(timezone.utc) - kpi_updated) <= timedelta(hours=8)


def _serialize(data: dict) -> dict:
    serialized = {}
    for key, value in data.items():
        if hasattr(value, "isoformat"):
            serialized[key] = value.isoformat()
        elif isinstance(value, dict):
            serialized[key] = _serialize(value)
        elif isinstance(value, list):
            serialized[key] = [_serialize(v) if isinstance(v, dict) else v for v in value]
        else:
            serialized[key] = value
    return serialized


def _get_effective_policy(db, user_id: str, account_id: str) -> dict:
    account_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    account_doc = account_ref.get()
    account_data = account_doc.to_dict() if account_doc.exists else {}
    raw = (account_data or {}).get("recommendationPolicy", {})
    return _sanitize_policy(raw)


def _sanitize_policy(payload: dict) -> dict:
    policy = dict(DEFAULT_POLICY)
    if not isinstance(payload, dict):
        return policy
    policy["allowExecute"] = bool(payload.get("allowExecute", policy["allowExecute"]))
    policy["allowRollback"] = bool(payload.get("allowRollback", policy["allowRollback"]))
    min_conf = float(payload.get("minConfidenceToExecute", policy["minConfidenceToExecute"]))
    max_delta = float(payload.get("maxBudgetDeltaPct", policy["maxBudgetDeltaPct"]))
    policy["minConfidenceToExecute"] = max(0.0, min(1.0, min_conf))
    policy["maxBudgetDeltaPct"] = max(1.0, min(100.0, max_delta))
    return policy
