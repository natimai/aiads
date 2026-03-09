"""Policy enforcement for Meta Ads diagnosis and recommendation outputs."""
from __future__ import annotations

import copy
import re
from typing import Any

from services.meta_ads_skill_pack import get_metric_display_name


class MetaAdsPolicyEnforcer:
    """Apply non-negotiable policy rules from the meta-ads-analyzer skill."""

    METRIC_MAP = {
        "impressions": "Impressions",
        "video_thruplay_watched_actions": "ThruPlays",
        "clicks": "Clicks (all)",
        "purchase_roas": "Purchase ROAS (return on ad spend)",
    }

    BREAKDOWN_TERMS = (
        "breakdown",
        "placement",
        "age",
        "gender",
        "segment",
    )

    AVG_COST_TERMS = (
        "average cpa",
        "avg cpa",
        "average cpm",
        "avg cpm",
        "higher cpa",
        "higher cpm",
        "low cpa segment",
        "high cpa segment",
    )

    MARGINAL_OR_DYNAMIC_TERMS = (
        "marginal",
        "trend",
        "time-series",
        "time series",
        "over time",
        "hypothesis",
        "test",
        "experiment",
        "incremental",
    )

    @staticmethod
    def _normalize_metric_terms(text: str) -> str:
        out = text
        for raw_name, display_name in MetaAdsPolicyEnforcer.METRIC_MAP.items():
            out = re.sub(rf"\b{re.escape(raw_name)}\b", display_name, out, flags=re.IGNORECASE)
        return out

    @staticmethod
    def _normalize_people_terms(text: str) -> str:
        out = text
        out = re.sub(r"\b(\d[\d,\.]*)\s+people\b", r"\1 person", out, flags=re.IGNORECASE)
        out = re.sub(r"\bpeople\b", "Accounts Center accounts", out, flags=re.IGNORECASE)
        return out

    @staticmethod
    def _disambiguate_clicks(text: str) -> str:
        out = text
        # Keep explicit link-click wording intact.
        out = re.sub(r"\blink\s+clicks\b", "Link Clicks", out, flags=re.IGNORECASE)

        def _replace_clicks(match: re.Match[str]) -> str:
            token = match.group(0)
            # Skip already-disambiguated tokens.
            if "(all)" in token.lower() or "link" in token.lower():
                return token
            return "Clicks (all)"

        out = re.sub(r"\bclicks\b(?!\s*\(all\))", _replace_clicks, out, flags=re.IGNORECASE)
        return out

    @staticmethod
    def _text_rules(text: str) -> tuple[str, list[dict[str, Any]]]:
        checks: list[dict[str, Any]] = []
        if not isinstance(text, str) or not text:
            return text, checks

        out = text
        before = out
        out = MetaAdsPolicyEnforcer._normalize_metric_terms(out)
        if out != before:
            checks.append({"rule": "metric_normalization", "status": "applied"})

        before = out
        out = MetaAdsPolicyEnforcer._disambiguate_clicks(out)
        if out != before:
            checks.append({"rule": "click_disambiguation", "status": "applied"})

        before = out
        out = MetaAdsPolicyEnforcer._normalize_people_terms(out)
        if out != before:
            checks.append({"rule": "audience_terminology", "status": "applied"})

        return out, checks

    @staticmethod
    def _deep_apply_text_rules(payload: Any, checks: list[dict[str, Any]]) -> Any:
        if isinstance(payload, str):
            normalized, local_checks = MetaAdsPolicyEnforcer._text_rules(payload)
            checks.extend(local_checks)
            return normalized
        if isinstance(payload, list):
            return [MetaAdsPolicyEnforcer._deep_apply_text_rules(item, checks) for item in payload]
        if isinstance(payload, dict):
            return {
                key: MetaAdsPolicyEnforcer._deep_apply_text_rules(value, checks)
                for key, value in payload.items()
            }
        return payload

    @staticmethod
    def _is_breakdown_average_only_reason(reasoning: str) -> bool:
        text = str(reasoning or "").lower()
        if not text:
            return False

        has_breakdown = any(term in text for term in MetaAdsPolicyEnforcer.BREAKDOWN_TERMS)
        has_avg_cost = any(term in text for term in MetaAdsPolicyEnforcer.AVG_COST_TERMS)
        has_dynamic = any(term in text for term in MetaAdsPolicyEnforcer.MARGINAL_OR_DYNAMIC_TERMS)

        return has_breakdown and has_avg_cost and not has_dynamic

    @staticmethod
    def _is_reduce_or_pause_action(rec: dict[str, Any]) -> bool:
        proposed = rec.get("proposedAction") if isinstance(rec.get("proposedAction"), dict) else {}
        plan = rec.get("executionPlan") if isinstance(rec.get("executionPlan"), dict) else {}

        proposed_action = str(proposed.get("action") or "").upper()
        if proposed_action in {"PAUSE_AD_SET", "DECREASE_BUDGET"}:
            return True

        plan_action = str(plan.get("action") or "")
        if plan_action == "set_status" and str(plan.get("desiredStatus") or "").lower() == "paused":
            return True
        if plan_action == "adjust_budget":
            try:
                return float(plan.get("deltaPct") or 0) < 0
            except (TypeError, ValueError):
                return False
        return False

    @staticmethod
    def _enforce_breakdown_safety_on_recommendation(rec: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        checks: list[dict[str, Any]] = []
        updated = copy.deepcopy(rec)
        reasoning = str(updated.get("reasoning") or updated.get("why") or "")

        if not MetaAdsPolicyEnforcer._is_reduce_or_pause_action(updated):
            return updated, checks

        if not MetaAdsPolicyEnforcer._is_breakdown_average_only_reason(reasoning):
            return updated, checks

        proposed = updated.get("proposedAction") if isinstance(updated.get("proposedAction"), dict) else {}
        plan = updated.get("executionPlan") if isinstance(updated.get("executionPlan"), dict) else {}

        proposed["action"] = "MANUAL_REVIEW"
        proposed["value"] = "Validate with time-series marginal CPA test"
        updated["proposedAction"] = proposed

        plan["action"] = "none"
        updated["executionPlan"] = plan

        prior_reasoning = reasoning.strip()
        updated["reasoning"] = (
            f"{prior_reasoning} Converted to hypothesis-driven test: do not pause/reduce based only "
            "on breakdown average CPA/CPM. Validate marginal trend first."
        ).strip()
        updated["why"] = updated["reasoning"]
        updated["uiDisplayText"] = (
            "Run a validation test on marginal trend before any budget cut or pause?"
        )

        checks.append(
            {
                "rule": "breakdown_effect_guardrail",
                "status": "blocked",
                "message": "Converted pause/reduce action to MANUAL_REVIEW due to average-only breakdown reasoning.",
            }
        )
        return updated, checks

    @staticmethod
    def _alignment_for_recommendation(
        rec: dict[str, Any], official_recommendations: list[dict[str, Any]]
    ) -> dict[str, Any]:
        entity_id = str(rec.get("entityId") or "")
        rec_type = str(rec.get("type") or "")
        plan = rec.get("executionPlan") if isinstance(rec.get("executionPlan"), dict) else {}
        action = str(plan.get("action") or "none")

        candidates = [
            item
            for item in official_recommendations
            if str(item.get("entityId") or "") == entity_id
        ]

        if not candidates:
            return {
                "isAligned": True,
                "officialRecommendationIds": [],
                "divergenceReason": "No overlapping official recommendation for this entity.",
            }

        for item in candidates:
            item_plan = item.get("executionPlan") if isinstance(item.get("executionPlan"), dict) else {}
            same_type = str(item.get("type") or "") == rec_type
            same_action = str(item_plan.get("action") or "none") == action
            if same_type or same_action:
                return {
                    "isAligned": True,
                    "officialRecommendationIds": [str(item.get("id") or "") for item in candidates],
                    "divergenceReason": "",
                }

        return {
            "isAligned": False,
            "officialRecommendationIds": [str(item.get("id") or "") for item in candidates],
            "divergenceReason": (
                "Differs from active official recommendation(s) for the same entity. "
                "Kept as hypothesis pending validation at aggregate level."
            ),
        }

    def enforce_recommendation_list(
        self,
        recommendations: list[dict[str, Any]],
        official_recommendations: list[dict[str, Any]] | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        official = official_recommendations or []
        output: list[dict[str, Any]] = []
        policy_checks: list[dict[str, Any]] = []
        aligned_count = 0
        diverged_count = 0

        for rec in recommendations:
            updated = copy.deepcopy(rec)
            updated, safety_checks = self._enforce_breakdown_safety_on_recommendation(updated)
            policy_checks.extend(safety_checks)

            for text_field in ("title", "why", "reasoning", "uiDisplayText"):
                normalized, text_checks = self._text_rules(str(updated.get(text_field) or ""))
                if normalized:
                    updated[text_field] = normalized
                policy_checks.extend(text_checks)

            if isinstance(updated.get("proposedAction"), dict):
                proposed = copy.deepcopy(updated["proposedAction"])
                for key in ("entity_name", "value"):
                    if key in proposed and isinstance(proposed[key], str):
                        proposed[key], text_checks = self._text_rules(proposed[key])
                        policy_checks.extend(text_checks)
                updated["proposedAction"] = proposed

            alignment = self._alignment_for_recommendation(updated, official)
            updated["alignment"] = alignment
            if alignment.get("isAligned"):
                aligned_count += 1
            else:
                diverged_count += 1
                if not alignment.get("divergenceReason"):
                    updated["alignment"]["divergenceReason"] = (
                        "Diverges from official recommendation with no explicit reason supplied."
                    )

            output.append(updated)

        summary = {
            "total": len(output),
            "aligned": aligned_count,
            "diverged": diverged_count,
            "policyViolations": sum(1 for c in policy_checks if c.get("status") == "blocked"),
            "policyChecks": policy_checks,
        }
        return output, summary

    def enforce_structured_report(
        self,
        report: dict[str, Any],
        official_recommendations: list[dict[str, Any]] | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        checks: list[dict[str, Any]] = []
        updated = copy.deepcopy(report)
        updated = self._deep_apply_text_rules(updated, checks)

        experiments = updated.get("recommendationExperiments")
        if isinstance(experiments, list):
            sanitized: list[dict[str, Any]] = []
            for exp in experiments:
                if not isinstance(exp, dict):
                    continue
                hypothesis = str(exp.get("hypothesis") or "")
                action_text = str(exp.get("action") or "")
                combined = f"{hypothesis} {action_text}".strip()
                if self._is_breakdown_average_only_reason(combined) and re.search(
                    r"\b(pause|decrease|reduce)\b", action_text, flags=re.IGNORECASE
                ):
                    exp["action"] = (
                        "Run a validation experiment on marginal trend before pausing/reducing budget."
                    )
                    checks.append(
                        {
                            "rule": "breakdown_effect_guardrail",
                            "status": "blocked",
                            "message": "Converted direct reduce/pause recommendation to experiment.",
                        }
                    )
                sanitized.append(exp)
            updated["recommendationExperiments"] = sanitized

        # Structured alignment summary.
        official = official_recommendations or []
        divergence_required = False
        divergence_reason = ""
        if official and isinstance(updated.get("recommendationExperiments"), list):
            experiment_text = " ".join(
                str(item.get("action") or "")
                for item in updated.get("recommendationExperiments", [])
                if isinstance(item, dict)
            ).lower()
            official_text = " ".join(
                str(item.get("title") or "") + " " + str(item.get("reasoning") or "")
                for item in official
            ).lower()
            if experiment_text and official_text and experiment_text not in official_text:
                divergence_required = True
                divergence_reason = (
                    "Structured diagnosis diverges from active official recommendations; "
                    "treat as hypothesis pending validation."
                )

        updated["alignment"] = {
            "checkedAgainstOfficialRecommendations": bool(official),
            "officialCount": len(official),
            "requiresDivergenceReason": divergence_required,
            "divergenceReason": divergence_reason,
        }

        updated_checks = updated.get("policyChecks")
        if not isinstance(updated_checks, list):
            updated_checks = []
        updated_checks.extend(checks)
        updated["policyChecks"] = updated_checks
        return updated, checks

    @staticmethod
    def normalize_metric_name(name: str) -> str:
        return get_metric_display_name(name)
