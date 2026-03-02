"""Recommendation generation orchestration (features + scoring + Gemini)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from services.ai_analyzer import AIAnalyzer
from services.feature_builder import FeatureBuilder
from services.performance_scoring import PerformanceScoring

logger = logging.getLogger(__name__)

RECOMMENDATION_TYPES = {
    "budget_optimization",
    "audience_optimization",
    "creative_optimization",
    "ab_test",
    "campaign_build",
    "audience_build",
    "creative_copy",
}
ENTITY_LEVELS = {"account", "campaign", "adset", "ad"}
PRIORITIES = {"high", "medium", "low"}
STATUSES = {"pending", "approved", "rejected", "executed", "failed"}

AI_TYPE_MAP: dict[str, str] = {
    "BUDGET_OPTIMIZATION": "budget_optimization",
    "CREATIVE_GENERATION": "creative_optimization",
    "AUDIENCE_TWEAK": "audience_optimization",
    "ANOMALY": "budget_optimization",
}

AI_ACTION_TO_EXECUTION: dict[str, dict[str, str]] = {
    "PAUSE_AD_SET": {"action": "set_status", "desiredStatus": "paused"},
    "INCREASE_BUDGET": {"action": "adjust_budget"},
    "DECREASE_BUDGET": {"action": "adjust_budget"},
    "CREATE_NEW_AD": {"action": "none"},
    "UPDATE_AUDIENCE": {"action": "none"},
    "MANUAL_REVIEW": {"action": "none"},
}

MAX_BUDGET_INCREASE_PCT = 20.0
MAX_BUDGET_DECREASE_PCT = 50.0


class RecommendationEngine:
    def __init__(self, db):
        self.db = db
        self.feature_builder = FeatureBuilder(db)
        self.scoring = PerformanceScoring()
        self.ai = AIAnalyzer()

    def generate(
        self,
        user_id: str,
        account_id: str,
        date_from: str,
        date_to: str,
        *,
        max_items: int = 12,
    ) -> dict[str, Any]:
        features = self.feature_builder.build(user_id, account_id, date_from, date_to)
        guardrail_error = self._validate_data_readiness(features)
        if guardrail_error:
            return {"recommendations": [], "meta": {"guardrailBlocked": True, "reason": guardrail_error}}

        scored_campaigns = self.scoring.score_campaigns(features.get("campaigns", []))
        recommendations = self.ai.generate_recommendations(
            {
                "account": {
                    "id": features.get("accountId"),
                    "name": features.get("accountName"),
                    "currency": features.get("currency"),
                    "kpiSummary": features.get("kpiSummary", {}),
                    "dateRange": features.get("dateRange", {}),
                },
                "campaigns": features.get("campaigns", []),
                "breakdowns": features.get("breakdowns", []),
                "scores": scored_campaigns,
            },
            max_items=max_items,
        )

        now = datetime.now(timezone.utc)
        normalized = [self._normalize_recommendation(rec, now) for rec in recommendations]
        deduped = self._dedup(normalized)
        return {
            "recommendations": deduped,
            "meta": {
                "guardrailBlocked": False,
                "generatedAt": now.isoformat(),
                "campaignsAnalyzed": len(features.get("campaigns", [])),
            },
        }

    def _validate_data_readiness(self, features: dict[str, Any]) -> str | None:
        campaigns = features.get("campaigns", [])
        if not campaigns:
            return "No campaign data available for this account."

        campaigns_with_insights = sum(1 for c in campaigns if c.get("insights"))
        if campaigns_with_insights < 1:
            return "No campaign insights found in selected date range."

        kpi_updated_at = features.get("kpiUpdatedAt")
        if kpi_updated_at:
            try:
                ts = datetime.fromisoformat(kpi_updated_at.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - ts > timedelta(hours=8):
                    return "Account KPI data is stale. Run sync before generating recommendations."
            except ValueError:
                return None
        return None

    @staticmethod
    def _normalize_recommendation(rec: dict[str, Any], now: datetime) -> dict[str, Any]:
        raw_type = str(rec.get("type", "budget_optimization")).strip()
        rec_type = AI_TYPE_MAP.get(raw_type.upper(), raw_type.lower())
        if rec_type not in RECOMMENDATION_TYPES:
            rec_type = "budget_optimization"

        suggested_content = rec.get("suggestedContent")
        if not isinstance(suggested_content, dict):
            suggested_content = {}

        proposed_action = rec.get("proposed_action") or {}
        if not isinstance(proposed_action, dict):
            proposed_action = {}

        entity_id = str(
            rec.get("entityId")
            or proposed_action.get("entity_id")
            or ""
        )
        entity_level = str(rec.get("entityLevel", "campaign")).strip().lower()
        if entity_level not in ENTITY_LEVELS:
            entity_level = "campaign"

        priority = str(rec.get("priority", "medium")).strip().lower()
        if priority not in PRIORITIES:
            priority = "medium"

        confidence = float(rec.get("confidence", 0.6) or 0.6)
        confidence = max(0.0, min(1.0, confidence))

        expected_impact = rec.get("expectedImpact", {})
        if not isinstance(expected_impact, dict):
            expected_impact = {"summary": str(expected_impact)}

        actions_draft = rec.get("actionsDraft", [])
        if not isinstance(actions_draft, list):
            actions_draft = [str(actions_draft)]

        status = "pending"

        execution_plan = rec.get("executionPlan")
        if not isinstance(execution_plan, dict):
            execution_plan = RecommendationEngine._derive_execution_plan(
                rec_type, entity_level, rec
            )

        execution_plan = RecommendationEngine._apply_safety_guardrails(
            execution_plan, proposed_action
        )

        metrics_snapshot = rec.get("metrics_snapshot") or {}
        if not isinstance(metrics_snapshot, dict):
            metrics_snapshot = {}

        ui_display_text = str(rec.get("ui_display_text") or rec.get("title") or "")

        if proposed_action.get("action") in ("CREATE_NEW_AD",) and not suggested_content.get("creativeCopy"):
            value = proposed_action.get("value")
            if isinstance(value, str) and value:
                suggested_content["creativeCopy"] = value

        if proposed_action.get("action") == "UPDATE_AUDIENCE" and not suggested_content.get("audienceSuggestions"):
            value = proposed_action.get("value")
            if isinstance(value, str) and value:
                suggested_content["audienceSuggestions"] = [value]
            elif isinstance(value, list):
                suggested_content["audienceSuggestions"] = value

        return {
            "type": rec_type,
            "entityLevel": entity_level,
            "entityId": entity_id,
            "title": str(rec.get("title") or "Optimization recommendation"),
            "priority": priority,
            "confidence": round(confidence, 4),
            "expectedImpact": expected_impact,
            "why": str(rec.get("why") or rec.get("reasoning") or ""),
            "reasoning": str(rec.get("reasoning") or rec.get("why") or ""),
            "actionsDraft": actions_draft[:5],
            "status": status,
            "executionPlan": execution_plan,
            "suggestedContent": suggested_content,
            "metricsSnapshot": metrics_snapshot,
            "uiDisplayText": ui_display_text,
            "proposedAction": proposed_action,
            "createdAt": now,
            "expiresAt": now + timedelta(hours=12),
            "review": {},
            "source": "nati_ai",
        }

    @staticmethod
    def _apply_safety_guardrails(
        execution_plan: dict[str, Any],
        proposed_action: dict[str, Any],
    ) -> dict[str, Any]:
        """Hard-coded safety caps — never trust the AI's numbers blindly."""
        ai_action = str(proposed_action.get("action", "")).upper()
        mapped = AI_ACTION_TO_EXECUTION.get(ai_action, {})

        if mapped.get("action") == "set_status":
            execution_plan = {
                **execution_plan,
                "action": "set_status",
                "desiredStatus": mapped.get("desiredStatus", "paused"),
                "targetId": str(proposed_action.get("entity_id") or execution_plan.get("targetId") or ""),
                "targetLevel": execution_plan.get("targetLevel", "adset"),
            }

        if mapped.get("action") == "adjust_budget":
            raw_value = proposed_action.get("value")
            try:
                delta_pct = float(raw_value) if raw_value is not None else execution_plan.get("deltaPct", 0)
            except (TypeError, ValueError):
                delta_pct = execution_plan.get("deltaPct", 0)

            if ai_action == "DECREASE_BUDGET":
                delta_pct = -abs(delta_pct) if delta_pct else -10.0

            if delta_pct > 0:
                delta_pct = min(delta_pct, MAX_BUDGET_INCREASE_PCT)
            else:
                delta_pct = max(delta_pct, -MAX_BUDGET_DECREASE_PCT)

            execution_plan = {
                **execution_plan,
                "action": "adjust_budget",
                "deltaPct": round(delta_pct, 2),
                "targetId": str(proposed_action.get("entity_id") or execution_plan.get("targetId") or ""),
                "targetLevel": execution_plan.get("targetLevel", "campaign"),
            }

        if not execution_plan.get("targetId"):
            target_id = str(proposed_action.get("entity_id") or "")
            if target_id:
                execution_plan["targetId"] = target_id

        return execution_plan

    @staticmethod
    def _dedup(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[str, str, str]] = set()
        unique: list[dict[str, Any]] = []
        for rec in recommendations:
            dedup_key = (rec.get("type", ""), rec.get("entityLevel", ""), rec.get("entityId", ""))
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            unique.append(rec)
        return unique

    @staticmethod
    def _derive_execution_plan(rec_type: str, entity_level: str, rec: dict[str, Any]) -> dict[str, Any]:
        entity_id = str(rec.get("entityId") or "")
        if entity_level not in {"campaign", "adset"} or not entity_id:
            return {"action": "none", "targetLevel": entity_level, "targetId": entity_id}

        if rec_type == "budget_optimization":
            impact = rec.get("expectedImpact", {})
            direction = str(impact.get("direction", "up")).lower() if isinstance(impact, dict) else "up"
            delta_pct = -10.0 if direction == "down" else 10.0
            return {
                "action": "adjust_budget",
                "targetLevel": entity_level,
                "targetId": entity_id,
                "deltaPct": delta_pct,
            }

        if rec_type in {"audience_optimization", "creative_optimization", "ab_test", "campaign_build", "audience_build", "creative_copy"}:
            return {"action": "none", "targetLevel": entity_level, "targetId": entity_id}

        return {"action": "none", "targetLevel": entity_level, "targetId": entity_id}
