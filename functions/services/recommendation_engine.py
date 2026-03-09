"""Recommendation generation orchestration (features + scoring + Gemini)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from services.ai_analyzer import AIAnalyzer
from services.feature_builder import FeatureBuilder
from services.meta_ads_policy_enforcer import MetaAdsPolicyEnforcer
from services.performance_scoring import PerformanceScoring

logger = logging.getLogger(__name__)

RECOMMENDATION_TYPES = {
    "budget_optimization",
    "audience_optimization",
    "creative_optimization",
    "audience_discovery",
    "targeting_optimization",
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
    "AUDIENCE_DISCOVERY": "audience_discovery",
    "TARGETING_OPTIMIZATION": "targeting_optimization",
    "AB_TEST_AUDIENCE": "ab_test",
    "SCALE_EXPERIMENT": "budget_optimization",
    "AUDIENCE_EXPANSION": "audience_discovery",
    "ANOMALY": "budget_optimization",
}

AI_ACTION_TO_EXECUTION: dict[str, dict[str, str]] = {
    "PAUSE_AD_SET": {"action": "set_status", "desiredStatus": "paused"},
    "INCREASE_BUDGET": {"action": "adjust_budget"},
    "DECREASE_BUDGET": {"action": "adjust_budget"},
    "CREATE_NEW_AD": {"action": "none"},
    "UPDATE_AUDIENCE": {"action": "none"},
    "BUILD_AB_TEST_AUDIENCE": {"action": "clone_adset_ab_test"},
    "MANUAL_REVIEW": {"action": "none"},
}

MAX_BUDGET_INCREASE_PCT = 20.0
MAX_BUDGET_DECREASE_PCT = 50.0
DEFAULT_AB_TEST_BUDGET = 50
MAX_REACTIVE_TASKS = 3

LATERAL_INTEREST_MAP: dict[str, list[str]] = {
    "real estate": ["Stock Market", "Luxury Vehicles", "Mortgage Brokers"],
    "fitness": ["Biohacking", "Healthy Recipes", "Wellness Retreats"],
    "beauty": ["Skincare Routines", "Luxury Cosmetics", "Haircare Trends"],
    "crypto": ["Stock Market", "Fintech Apps", "Alternative Investments"],
    "ecommerce": ["Entrepreneurship", "Shopify", "Digital Marketing"],
    "parenting": ["Early Education", "Family Finance", "Kids Health"],
}


class RecommendationEngine:
    def __init__(self, db):
        self.db = db
        self.feature_builder = FeatureBuilder(db)
        self.scoring = PerformanceScoring()
        self.ai = AIAnalyzer()
        self.policy_enforcer = MetaAdsPolicyEnforcer()

    def generate(
        self,
        user_id: str,
        account_id: str,
        date_from: str,
        date_to: str,
        *,
        max_items: int = 12,
        batch_type: str = "",
    ) -> dict[str, Any]:
        features = self.feature_builder.build(user_id, account_id, date_from, date_to)
        guardrail_error = self._validate_data_readiness(features)
        if guardrail_error:
            return {"recommendations": [], "meta": {"guardrailBlocked": True, "reason": guardrail_error}}

        official_recommendations = self._load_official_recommendations(user_id, account_id)
        scored_campaigns = self.scoring.score_campaigns(features.get("campaigns", []))
        context = {
            "account": {
                "id": features.get("accountId"),
                "name": features.get("accountName"),
                "currency": features.get("currency"),
                "kpiSummary": features.get("kpiSummary", {}),
                "dateRange": features.get("dateRange", {}),
            },
            "campaigns": features.get("campaigns", []),
            "breakdowns": features.get("breakdowns", []),
            "breakdownSummary": features.get("breakdownSummary", {}),
            "scores": scored_campaigns,
            "officialRecommendations": official_recommendations,
        }

        if batch_type == "MORNING_BRIEF":
            recommendations = self.ai.generate_morning_tasks(context, max_items=max_items)
        elif batch_type == "EVENING_CHECK":
            recommendations = self.ai.generate_evening_tasks(context, max_items=max_items)
        else:
            recommendations = self.ai.generate_recommendations(context, max_items=max_items)

        now = datetime.now(timezone.utc)
        proactive = self._inject_reactive_tasks(features)
        normalized = [
            self._normalize_recommendation(rec, now, batch_type=batch_type)
            for rec in [*recommendations, *proactive]
        ]
        deduped = self._sort_by_priority(self._dedup(normalized))
        enforced, policy_summary = self.policy_enforcer.enforce_recommendation_list(
            deduped,
            official_recommendations=official_recommendations,
        )
        return {
            "recommendations": enforced,
            "meta": {
                "guardrailBlocked": False,
                "generatedAt": now.isoformat(),
                "campaignsAnalyzed": len(features.get("campaigns", [])),
                "reactiveTasksInjected": len(proactive),
                "batchType": batch_type,
                "alignment": {
                    "officialCount": len(official_recommendations),
                    "aligned": policy_summary.get("aligned", 0),
                    "diverged": policy_summary.get("diverged", 0),
                },
                "policyViolations": policy_summary.get("policyViolations", 0),
            },
        }

    def _load_official_recommendations(self, user_id: str, account_id: str) -> list[dict[str, Any]]:
        """Load active recommendations to enforce strict alignment metadata."""
        rec_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("recommendations")
        )
        docs = rec_ref.stream()

        results: list[dict[str, Any]] = []
        for doc in docs:
            payload = doc.to_dict() or {}
            status = str(payload.get("status") or "").lower()
            if status not in {"pending", "approved"}:
                continue
            results.append(
                {
                    "id": doc.id,
                    "type": payload.get("type"),
                    "title": payload.get("title"),
                    "reasoning": payload.get("reasoning"),
                    "entityId": payload.get("entityId"),
                    "status": payload.get("status"),
                    "createdAt": payload.get("createdAt"),
                    "executionPlan": payload.get("executionPlan")
                    if isinstance(payload.get("executionPlan"), dict)
                    else {},
                }
            )
        results.sort(
            key=lambda item: str(item.get("createdAt") or ""),
            reverse=True,
        )
        return results[:60]

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
    def _normalize_recommendation(rec: dict[str, Any], now: datetime, *, batch_type: str = "") -> dict[str, Any]:
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

        test_setup = rec.get("test_setup")
        if not isinstance(test_setup, dict):
            test_setup = rec.get("testSetup")
        if not isinstance(test_setup, dict):
            test_setup = {}

        entity_id = str(
            rec.get("entityId")
            or rec.get("entity_id")
            or proposed_action.get("entity_id")
            or test_setup.get("control_adset_id")
            or ""
        )
        entity_level = str(rec.get("entityLevel") or rec.get("entity_level") or "campaign").strip().lower()
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

        if test_setup:
            suggested_content["testSetup"] = {
                "controlAdsetId": str(test_setup.get("control_adset_id") or ""),
                "variableToChange": str(test_setup.get("variable_to_change") or "targeting"),
                "variantSettings": test_setup.get("variant_settings")
                if isinstance(test_setup.get("variant_settings"), dict)
                else {},
                "recommendedTestBudget": float(test_setup.get("recommended_test_budget") or DEFAULT_AB_TEST_BUDGET),
            }

        if proposed_action.get("action") == "BUILD_AB_TEST_AUDIENCE" and not execution_plan.get("action"):
            execution_plan = RecommendationEngine._derive_execution_plan(rec_type, entity_level, rec)

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
            "batchType": batch_type,
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

        if mapped.get("action") == "clone_adset_ab_test":
            variant_settings = execution_plan.get("variantSettings")
            if not isinstance(variant_settings, dict):
                variant_settings = {}

            raw_budget = (
                execution_plan.get("recommendedTestBudget")
                or proposed_action.get("value")
                or DEFAULT_AB_TEST_BUDGET
            )
            try:
                budget = max(1, int(float(raw_budget)))
            except (TypeError, ValueError):
                budget = DEFAULT_AB_TEST_BUDGET

            execution_plan = {
                **execution_plan,
                "action": "clone_adset_ab_test",
                "targetLevel": "adset",
                "targetId": str(proposed_action.get("entity_id") or execution_plan.get("targetId") or ""),
                "variantSettings": variant_settings,
                "variableToChange": str(execution_plan.get("variableToChange") or "targeting"),
                "recommendedTestBudget": budget,
            }

        if not execution_plan.get("targetId"):
            target_id = str(proposed_action.get("entity_id") or "")
            if target_id:
                execution_plan["targetId"] = target_id

        return execution_plan

    def _inject_reactive_tasks(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        """Deterministic fallback tasks so recommendations never stay idle."""
        injected: list[dict[str, Any]] = []
        injected.extend(self._build_ab_test_tasks(features))
        injected.extend(self._build_breakdown_targeting_tasks(features))
        injected.extend(self._build_stable_experiment_tasks(features))
        injected.extend(self._build_audience_discovery_tasks(features))
        return injected[:MAX_REACTIVE_TASKS]

    def _build_ab_test_tasks(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        campaigns = features.get("campaigns", [])
        for campaign in campaigns:
            aggregates = campaign.get("aggregates", {})
            spend = float(aggregates.get("spend", 0) or 0)
            frequency = float(aggregates.get("frequency", 0) or 0)
            ctr = float(aggregates.get("ctr", 0) or 0)
            roas = float(aggregates.get("roas", 0) or 0)
            if frequency <= 2.5 or spend < 50:
                continue
            if roas <= 0 and ctr < 0.9:
                continue

            control_adset = self._pick_control_adset(campaign)
            control_adset_id = str(
                (control_adset or {}).get("metaAdsetId")
                or (control_adset or {}).get("id")
                or ""
            )
            if not control_adset_id:
                continue

            control_name = str((control_adset or {}).get("name") or campaign.get("name") or "Ad Set")
            recommended_budget = DEFAULT_AB_TEST_BUDGET

            variant_settings = {
                "custom_audiences": ["lookalike_purchase_3pct"],
                "interests": [],
            }

            return [
                {
                    "type": "AB_TEST_AUDIENCE",
                    "entityLevel": "adset",
                    "entityId": control_adset_id,
                    "priority": "HIGH",
                    "title": "A/B Test: Shift Winning Ad to Lookalike Audience",
                    "reasoning": (
                        f"The current audience is fatiguing (freq {frequency:.2f}) while the creative still performs "
                        f"(ROAS {roas:.2f}, CTR {ctr:.2f}%). Test the same creative against a 3% purchase lookalike."
                    ),
                    "metrics_snapshot": {
                        "spend": spend,
                        "roas": roas,
                        "ctr": ctr,
                        "frequency": frequency,
                        "cpa": float(aggregates.get("cpa", 0) or 0),
                        "cpm": float(aggregates.get("cpm", 0) or 0),
                    },
                    "proposed_action": {
                        "action": "BUILD_AB_TEST_AUDIENCE",
                        "entity_id": control_adset_id,
                        "entity_name": control_name,
                        "value": recommended_budget,
                    },
                    "test_setup": {
                        "control_adset_id": control_adset_id,
                        "variable_to_change": "targeting",
                        "variant_settings": variant_settings,
                        "recommended_test_budget": recommended_budget,
                    },
                    "suggestedContent": {
                        "abTest": {
                            "control": {
                                "adsetId": control_adset_id,
                                "name": control_name,
                                "targeting": "Current interest stack",
                            },
                            "variant": {
                                "targeting": "3% Purchase Lookalike",
                                "customAudiences": ["lookalike_purchase_3pct"],
                                "interests": [],
                            },
                        }
                    },
                    "ui_display_text": "Approve this A/B test to clone the ad set and publish the lookalike variant?",
                    "confidence": 0.82,
                    "expectedImpact": {
                        "metric": "cpa",
                        "direction": "down",
                        "magnitudePct": 12.0,
                        "summary": "Can reduce fatigue-driven CPA inflation while keeping the winning creative.",
                    },
                }
            ]

        return []

    def _build_breakdown_targeting_tasks(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        summary = features.get("breakdownSummary", {})
        if not isinstance(summary, dict):
            return []

        dimension_map = {
            "age": ("age", "Age"),
            "gender": ("gender", "Gender"),
            "placement": ("platform_position", "Placement"),
        }

        for summary_key, (segment_key, label) in dimension_map.items():
            rows = summary.get(summary_key, [])
            if not isinstance(rows, list) or not rows:
                continue
            aggregate: dict[str, dict[str, Any]] = {}
            total_results = 0.0
            total_spend = 0.0
            for row in rows:
                if not isinstance(row, dict):
                    continue
                segment = str(row.get(segment_key) or "").strip()
                if not segment:
                    continue
                results = self._results_from_row(row)
                spend = float(row.get("spend", 0) or 0)
                if results <= 0 or spend <= 0:
                    continue
                total_results += results
                total_spend += spend
                item = aggregate.setdefault(
                    segment,
                    {"results": 0.0, "spend": 0.0, "campaignResults": {}},
                )
                item["results"] += results
                item["spend"] += spend
                campaign_id = str(row.get("campaignId") or "")
                if campaign_id:
                    item["campaignResults"][campaign_id] = item["campaignResults"].get(campaign_id, 0.0) + results

            if total_results <= 0 or total_spend <= 0:
                continue

            overall_cpa = total_spend / total_results
            best_segment = ""
            best_stats: dict[str, Any] = {}
            for segment, stats in aggregate.items():
                share = stats["results"] / total_results
                segment_cpa = stats["spend"] / stats["results"] if stats["results"] > 0 else 0
                if share >= 0.6 and segment_cpa > 0 and segment_cpa < overall_cpa:
                    if not best_stats or share > best_stats.get("share", 0):
                        best_segment = segment
                        best_stats = {
                            "share": share,
                            "cpa": segment_cpa,
                            "results": stats["results"],
                            "campaignResults": stats.get("campaignResults", {}),
                        }

            if not best_segment:
                continue

            campaign_results = best_stats.get("campaignResults", {})
            top_campaign_id = ""
            if isinstance(campaign_results, dict) and campaign_results:
                top_campaign_id = max(campaign_results, key=campaign_results.get)
            if not top_campaign_id:
                campaigns = features.get("campaigns", [])
                top_campaign_id = str(campaigns[0].get("id")) if campaigns else ""
            if not top_campaign_id:
                continue

            share_pct = best_stats["share"] * 100
            return [
                {
                    "type": "TARGETING_OPTIMIZATION",
                    "entityLevel": "campaign",
                    "entityId": top_campaign_id,
                    "priority": "HIGH",
                    "title": f"Isolate {label}: {best_segment}",
                    "reasoning": (
                        f"{label} segment '{best_segment}' drove {share_pct:.1f}% of results with lower CPA "
                        f"(${best_stats['cpa']:.2f} vs ${overall_cpa:.2f}). Split this segment into a dedicated ad set."
                    ),
                    "metrics_snapshot": {
                        "spend": total_spend,
                        "cpa": round(best_stats["cpa"], 4),
                        "frequency": 0,
                        "ctr": 0,
                        "cpm": 0,
                        "roas": 0,
                    },
                    "proposed_action": {
                        "action": "UPDATE_AUDIENCE",
                        "entity_id": top_campaign_id,
                        "entity_name": f"{label} {best_segment}",
                        "value": f"isolate_{summary_key}:{best_segment}",
                    },
                    "suggestedContent": {
                        "audienceSuggestions": [f"Isolate {label} {best_segment} in its own ad set"]
                    },
                    "ui_display_text": f"Create a dedicated ad set for {label.lower()} '{best_segment}'?",
                    "confidence": 0.78,
                    "expectedImpact": {
                        "metric": "cpa",
                        "direction": "down",
                        "magnitudePct": 10.0,
                        "summary": "Budget concentration on the best converting demographic should improve CPA efficiency.",
                    },
                }
            ]

        return []

    def _build_stable_experiment_tasks(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        campaigns = features.get("campaigns", [])
        for campaign in campaigns:
            insights = campaign.get("insights", [])
            if not isinstance(insights, list) or len(insights) < 7:
                continue
            recent = [row for row in insights[-7:] if float(row.get("spend", 0) or 0) > 0]
            if len(recent) < 7:
                continue
            target_cpa = self._infer_target_cpa(features, campaign)
            if target_cpa <= 0:
                continue

            cpas = [self._effective_cpa(row) for row in recent]
            if not cpas or any(c <= 0 for c in cpas):
                continue

            avg_cpa = sum(cpas) / len(cpas)
            cpa_spread = max(cpas) - min(cpas)
            is_stable = avg_cpa <= (target_cpa * 1.05) and cpa_spread <= (target_cpa * 0.35)
            if not is_stable:
                continue

            adset = self._pick_control_adset(campaign)
            entity_id = str((adset or {}).get("metaAdsetId") or (adset or {}).get("id") or campaign.get("id") or "")
            entity_level = "adset" if adset else "campaign"
            if not entity_id:
                continue

            aggregates = campaign.get("aggregates", {})
            roas = float(aggregates.get("roas", 0) or 0)
            spend = float(aggregates.get("spend", 0) or 0)
            frequency = float(aggregates.get("frequency", 0) or 0)

            return [
                {
                    "type": "SCALE_EXPERIMENT",
                    "entityLevel": entity_level,
                    "entityId": entity_id,
                    "priority": "HIGH",
                    "title": "Scale Experiment: Stable CPA for 7 Days",
                    "reasoning": (
                        f"CPA stayed stable for 7 days (${avg_cpa:.2f} vs target ${target_cpa:.2f}). "
                        "Run a controlled +15% budget test instead of staying idle."
                    ),
                    "metrics_snapshot": {
                        "spend": spend,
                        "roas": roas,
                        "cpa": round(avg_cpa, 4),
                        "ctr": float(aggregates.get("ctr", 0) or 0),
                        "cpm": float(aggregates.get("cpm", 0) or 0),
                        "frequency": frequency,
                    },
                    "proposed_action": {
                        "action": "INCREASE_BUDGET",
                        "entity_id": entity_id,
                        "entity_name": str((adset or {}).get("name") or campaign.get("name") or "Campaign"),
                        "value": 15,
                    },
                    "ui_display_text": "Run a +15% controlled budget experiment on this stable winner?",
                    "confidence": 0.76,
                    "expectedImpact": {
                        "metric": "roas",
                        "direction": "up",
                        "magnitudePct": 8.0,
                        "summary": "Controlled scaling can unlock additional conversion volume while monitoring CPA drift.",
                    },
                }
            ]

        return []

    def _build_audience_discovery_tasks(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        campaigns = features.get("campaigns", [])
        for campaign in campaigns:
            aggregates = campaign.get("aggregates", {})
            roas = float(aggregates.get("roas", 0) or 0)
            if roas < 1.0:
                continue

            control_adset = self._pick_control_adset(campaign)
            source_adsets = campaign.get("adsets", []) if isinstance(campaign.get("adsets"), list) else []
            if control_adset and control_adset not in source_adsets:
                source_adsets = [control_adset, *source_adsets]

            interests: list[str] = []
            for adset in source_adsets[:5]:
                interests.extend(self._extract_interests_from_adset(adset))
            interests = [x for x in interests if x]
            if not interests:
                continue

            lateral = self._find_lateral_interests(interests)
            if not lateral:
                continue

            entity_id = str((control_adset or {}).get("metaAdsetId") or (control_adset or {}).get("id") or campaign.get("id") or "")
            entity_level = "adset" if control_adset else "campaign"
            if not entity_id:
                continue

            return [
                {
                    "type": "AUDIENCE_DISCOVERY",
                    "entityLevel": entity_level,
                    "entityId": entity_id,
                    "priority": "MEDIUM",
                    "title": "Audience Discovery: Expand into Adjacent Interests",
                    "reasoning": (
                        f"Current winning interests ({', '.join(interests[:2])}) are delivering positive ROAS ({roas:.2f}). "
                        f"Test adjacent interests ({', '.join(lateral[:2])}) to find cheaper CPM pockets."
                    ),
                    "metrics_snapshot": {
                        "spend": float(aggregates.get("spend", 0) or 0),
                        "roas": roas,
                        "cpa": float(aggregates.get("cpa", 0) or 0),
                        "ctr": float(aggregates.get("ctr", 0) or 0),
                        "cpm": float(aggregates.get("cpm", 0) or 0),
                        "frequency": float(aggregates.get("frequency", 0) or 0),
                    },
                    "proposed_action": {
                        "action": "UPDATE_AUDIENCE",
                        "entity_id": entity_id,
                        "entity_name": str((control_adset or {}).get("name") or campaign.get("name") or "Ad Set"),
                        "value": lateral,
                    },
                    "suggestedContent": {"audienceSuggestions": lateral[:6]},
                    "ui_display_text": "Launch an audience discovery test with these adjacent interests?",
                    "confidence": 0.72,
                    "expectedImpact": {
                        "metric": "cpm",
                        "direction": "down",
                        "magnitudePct": 9.0,
                        "summary": "Adjacent audience testing can unlock lower CPM inventory without changing creative.",
                    },
                }
            ]

        return []

    @staticmethod
    def _pick_control_adset(campaign: dict[str, Any]) -> dict[str, Any] | None:
        adsets = campaign.get("adsets", [])
        if not isinstance(adsets, list):
            return None
        active = []
        for adset in adsets:
            if not isinstance(adset, dict):
                continue
            status = str(adset.get("status", "")).upper()
            if status in {"ACTIVE", ""}:
                active.append(adset)
        return active[0] if active else (adsets[0] if adsets else None)

    @staticmethod
    def _effective_cpa(row: dict[str, Any]) -> float:
        cpa = float(row.get("cpa", 0) or 0)
        if cpa > 0:
            return cpa
        spend = float(row.get("spend", 0) or 0)
        purchases = float(row.get("purchases", 0) or 0)
        leads = float(row.get("leads", 0) or 0)
        installs = float(row.get("installs", 0) or 0)
        denominator = purchases or leads or installs
        return (spend / denominator) if denominator > 0 else 0.0

    @staticmethod
    def _results_from_row(row: dict[str, Any]) -> float:
        return float(row.get("purchases", 0) or row.get("leads", 0) or row.get("installs", 0) or 0)

    @staticmethod
    def _infer_target_cpa(features: dict[str, Any], campaign: dict[str, Any]) -> float:
        kpi = features.get("kpiSummary", {})
        campaign_agg = campaign.get("aggregates", {})
        account_target = float(
            (kpi.get("avgCostPerLead") or 0) or (kpi.get("avgCPI") or 0) or 0
        )
        campaign_cpa = float(campaign_agg.get("cpa", 0) or campaign_agg.get("cpi", 0) or 0)
        if account_target > 0 and campaign_cpa > 0:
            return (account_target * 0.6) + (campaign_cpa * 0.4)
        if account_target > 0:
            return account_target
        if campaign_cpa > 0:
            return campaign_cpa * 1.05
        return 0.0

    @staticmethod
    def _extract_interests_from_adset(adset: dict[str, Any]) -> list[str]:
        if not isinstance(adset, dict):
            return []

        interests: list[str] = []
        raw_interests = adset.get("interests", [])
        if isinstance(raw_interests, list):
            for item in raw_interests:
                if isinstance(item, str) and item.strip():
                    interests.append(item.strip())
                elif isinstance(item, dict):
                    name = str(item.get("name") or "").strip()
                    if name:
                        interests.append(name)

        if interests:
            return interests

        targeting_summary = str(adset.get("targetingSummary") or "").strip()
        if targeting_summary and targeting_summary.lower() != "broad":
            return [x.strip() for x in targeting_summary.split(",") if x.strip()]
        return []

    @staticmethod
    def _find_lateral_interests(current_interests: list[str]) -> list[str]:
        suggestions: list[str] = []
        lowered_existing = {x.lower() for x in current_interests}
        for interest in current_interests:
            seed = interest.lower()
            for key, mapped in LATERAL_INTEREST_MAP.items():
                if key in seed:
                    for candidate in mapped:
                        if candidate.lower() not in lowered_existing and candidate not in suggestions:
                            suggestions.append(candidate)
        return suggestions[:8]

    @staticmethod
    def _sort_by_priority(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        priority_rank = {"high": 0, "medium": 1, "low": 2}
        return sorted(
            recommendations,
            key=lambda rec: (
                priority_rank.get(str(rec.get("priority", "medium")).lower(), 1),
                -float(rec.get("confidence", 0) or 0),
            ),
        )

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
        entity_id = str(
            rec.get("entityId")
            or rec.get("entity_id")
            or ((rec.get("proposed_action") or {}).get("entity_id") if isinstance(rec.get("proposed_action"), dict) else "")
            or ""
        )
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

        if rec_type == "ab_test":
            raw_setup = rec.get("test_setup")
            if not isinstance(raw_setup, dict):
                raw_setup = rec.get("testSetup")
            if not isinstance(raw_setup, dict):
                raw_setup = {}

            control_adset_id = str(
                raw_setup.get("control_adset_id")
                or raw_setup.get("controlAdsetId")
                or entity_id
            )
            variant_settings = raw_setup.get("variant_settings") or raw_setup.get("variantSettings") or {}
            if not isinstance(variant_settings, dict):
                variant_settings = {}
            recommended_budget = raw_setup.get("recommended_test_budget") or raw_setup.get("recommendedTestBudget")
            try:
                budget_value = max(1, int(float(recommended_budget)))
            except (TypeError, ValueError):
                budget_value = DEFAULT_AB_TEST_BUDGET

            return {
                "action": "clone_adset_ab_test",
                "targetLevel": "adset",
                "targetId": control_adset_id,
                "variableToChange": str(raw_setup.get("variable_to_change") or raw_setup.get("variableToChange") or "targeting"),
                "variantSettings": variant_settings,
                "recommendedTestBudget": budget_value,
            }

        if rec_type in {
            "audience_optimization",
            "targeting_optimization",
            "audience_discovery",
            "creative_optimization",
            "campaign_build",
            "audience_build",
            "creative_copy",
        }:
            return {"action": "none", "targetLevel": entity_level, "targetId": entity_id}

        return {"action": "none", "targetLevel": entity_level, "targetId": entity_id}
