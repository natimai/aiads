"""Structured diagnosis engine — single entry point for all campaign analysis."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from services.ai_analyzer import AIAnalyzer
from services.feature_builder import FeatureBuilder
from services.meta_ads_analyzer_v2 import MetaAdsAnalyzerV2
from services.meta_ads_policy_enforcer import MetaAdsPolicyEnforcer
from services.performance_scoring import PerformanceScoring
from utils.evaluation_level import resolve_evaluation_level
from utils.explainability import ExplainabilityTrace, build_trace
from utils.feature_flags import is_enabled
from utils.firestore_helpers import load_official_recommendations
from utils.freshness import compute_confidence_downgrade, compute_freshness, is_breakdown_data_stale
from utils.schema_validation import validate_diagnosis_report

logger = logging.getLogger(__name__)

ENGINE_VERSION = "diagnosis-engine-v1"


class DiagnosisEngine:
    """Source of truth for campaign diagnosis.

    Orchestrates feature building, deterministic analysis, optional AI enrichment,
    policy enforcement, and schema validation.
    """

    def __init__(self, db: Any) -> None:
        self.db = db
        self.feature_builder = FeatureBuilder(db)
        self.scoring = PerformanceScoring()
        self.analyzer_v2 = MetaAdsAnalyzerV2()
        self.policy = MetaAdsPolicyEnforcer()
        try:
            self.ai_analyzer = AIAnalyzer()
        except Exception:
            logger.warning("diagnosis_engine: AIAnalyzer unavailable, AI enrichment disabled")
            self.ai_analyzer = None

    def diagnose(
        self,
        user_id: str,
        account_id: str,
        date_from: str,
        date_to: str,
    ) -> dict[str, Any]:
        """Run a full diagnosis and return a DiagnosisReport dict.

        Always returns a valid report — never None. Falls back to deterministic
        analysis when AI is unavailable or the feature flag is off.
        """
        # Gate: if diagnosis engine is disabled, run legacy V2 and wrap
        if not is_enabled("ENABLE_DIAGNOSIS_ENGINE", user_id=user_id):
            return self._legacy_fallback(user_id, account_id, date_from, date_to)

        diagnosis_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        guardrails_triggered: list[str] = []
        trace = build_trace() if is_enabled("ENABLE_EXPLAINABILITY_LOGS", user_id=user_id) else None

        # 1. Build features
        try:
            features = self.feature_builder.build(user_id, account_id, date_from, date_to)
        except Exception:
            logger.exception("diagnosis_engine: feature build failed")
            if trace:
                trace.record_fallback(True, "feature_build_failed")
            return self._empty_report(diagnosis_id, account_id, now_iso, "No campaign data available.")

        campaigns = features.get("campaigns", [])
        if not campaigns:
            return self._empty_report(diagnosis_id, account_id, now_iso, "No campaign data available.")

        # Extract objective context (added by FeatureBuilder)
        objective_ctx = features.get("objectiveContext", {})
        vertical = objective_ctx.get("vertical", "LEAD_GEN")

        # Record which inputs are available
        if trace:
            available_inputs = ["campaigns"]
            if features.get("kpiSummary"):
                available_inputs.append("kpiSummary")
            if features.get("breakdowns") or features.get("breakdownSummary"):
                available_inputs.append("breakdowns")
            trace.record_inputs(available_inputs)

        # 2. Resolve evaluation level
        evaluation_level = resolve_evaluation_level(campaigns)
        if trace:
            cbo_detected = any(
                isinstance(c, dict) and (
                    c.get("isCampaignBudgetOptimized")
                    or str(c.get("budgetOptimization", "")).lower() in {"cbo", "advantage+"}
                )
                for c in campaigns
            )
            trace.record_evaluation_level(
                evaluation_level,
                "CBO/Advantage+ detected" if cbo_detected else "No CBO detected — defaulting to adset",
            )

        # 3. Compute data freshness
        account_doc = self._load_account_doc(user_id, account_id)
        freshness = compute_freshness(account_doc)
        confidence_multiplier = compute_confidence_downgrade(freshness)
        breakdown_stale = is_breakdown_data_stale(freshness)

        if freshness.get("isStale"):
            guardrails_triggered.append("stale_data_warning")
            if trace:
                trace.record_guardrail("stale_data_warning")

        # 4. Load official recommendations (gated by ENABLE_ALIGNMENT_CHECK)
        official_recs: list[dict[str, Any]] | None = None
        if is_enabled("ENABLE_ALIGNMENT_CHECK", user_id=user_id):
            official_recs = self._safe_load_official_recs(user_id, account_id)
            if trace:
                trace.record_official_recs_checked(official_recs is not None)
        else:
            if trace:
                trace.record_official_recs_checked(False)
        official_alignment = self._compute_alignment(official_recs)

        # 5. Run deterministic V2 analysis
        v2_report = self._run_v2_analysis(features, official_recs)

        # 6. Try AI enrichment for summary
        ai_summary = self._try_ai_summary(features)
        source = "hybrid" if ai_summary else "deterministic"
        if trace and not ai_summary and self.ai_analyzer is not None:
            trace.record_fallback(True, "ai_summary_failed_or_empty")
        elif trace and self.ai_analyzer is None:
            trace.record_fallback(True, "ai_analyzer_unavailable")
        elif trace:
            trace.record_fallback(False)

        # 7. Build findings from V2 output
        findings = self._extract_findings(v2_report, confidence_multiplier)

        # 8. Build breakdown hypotheses (skip if stale)
        breakdown_hypotheses: list[dict[str, Any]] = []
        if not breakdown_stale:
            breakdown_hypotheses = self._extract_breakdown_hypotheses(v2_report)
        else:
            guardrails_triggered.append("breakdown_data_stale")
            if trace:
                trace.record_guardrail("breakdown_data_stale")

        # 9. Classify root cause
        root_cause = self._classify_root_cause(findings, campaigns)
        if trace:
            trace.record_root_cause(root_cause, self._root_cause_explanation(root_cause, findings, campaigns))

        # 10. Compute overall confidence
        base_confidence = self._compute_base_confidence(findings)
        final_confidence = round(min(max(base_confidence * confidence_multiplier, 0.0), 1.0), 3)
        if trace and confidence_multiplier < 1.0:
            trace.record_confidence_adjustment(
                "data_freshness_downgrade", base_confidence, base_confidence * confidence_multiplier
            )

        # 10b. Enrich findings with riskLevel, suggestedAction, validationMetric
        self._enrich_findings(findings, root_cause, objective_ctx)

        # 11. Build summary
        summary = ai_summary or self._deterministic_summary(v2_report, root_cause, vertical)

        # 12. Apply policy enforcement
        policy_report = {
            "aggregateFindings": [
                {"statement": f.get("title", ""), "evidence": f.get("evidence", {})}
                for f in findings
            ],
            "breakdownHypotheses": [
                {"hypothesis": h.get("hypothesis", ""), "evidence": h.get("observation", "")}
                for h in breakdown_hypotheses
            ],
        }
        enforced, policy_checks = self.policy.enforce_structured_report(policy_report, official_recs)
        for check in policy_checks:
            if check.get("status") == "applied":
                rule = check.get("rule", "policy_check")
                guardrails_triggered.append(rule)
                if trace:
                    trace.record_guardrail(rule)

        # 13. Build final DiagnosisReport
        report: dict[str, Any] = {
            "id": diagnosis_id,
            "accountId": account_id,
            "evaluationLevel": evaluation_level,
            "vertical": vertical,
            "objectiveContext": objective_ctx,
            "summary": summary,
            "rootCause": root_cause,
            "findings": findings,
            "breakdownHypotheses": breakdown_hypotheses,
            "officialAlignment": official_alignment,
            "confidence": final_confidence,
            "dataFreshness": freshness,
            "guardrailsTriggered": guardrails_triggered,
            "engineVersion": ENGINE_VERSION,
            "generatedAt": now_iso,
            "source": source,
        }

        # 13b. Attach explainability trace if enabled
        if trace:
            report["explainabilityTrace"] = trace.to_dict()

        # 14. Validate schema — fallback to deterministic if invalid
        is_valid, errors = validate_diagnosis_report(report)
        if not is_valid:
            logger.error("diagnosis_engine: schema validation failed: %s", errors)
            return self._legacy_fallback(user_id, account_id, date_from, date_to)

        return report

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _legacy_fallback(
        self,
        user_id: str,
        account_id: str,
        date_from: str,
        date_to: str,
    ) -> dict[str, Any]:
        """Run V2 analyzer and wrap output in a minimal DiagnosisReport shape."""
        diagnosis_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            features = self.feature_builder.build(user_id, account_id, date_from, date_to)
        except Exception:
            logger.exception("diagnosis_engine: legacy fallback feature build failed")
            return self._empty_report(diagnosis_id, account_id, now_iso, "No campaign data available.")

        campaigns = features.get("campaigns", [])
        if not campaigns:
            return self._empty_report(diagnosis_id, account_id, now_iso, "No campaign data available.")

        evaluation_level = resolve_evaluation_level(campaigns)
        v2_report = self._run_v2_analysis(features, None)
        findings = self._extract_findings(v2_report, 1.0)
        root_cause = self._classify_root_cause(findings, campaigns)
        summary = self._deterministic_summary(v2_report, root_cause)

        # Resolve objective context in legacy path
        from utils.objective_context import get_objective_context
        account_data = {}
        try:
            account_data = self._load_account_doc(user_id, account_id)
        except Exception:
            pass
        legacy_ctx = get_objective_context(account_data, campaigns)

        return {
            "id": diagnosis_id,
            "accountId": account_id,
            "evaluationLevel": evaluation_level,
            "vertical": legacy_ctx.get("vertical", "LEAD_GEN"),
            "objectiveContext": legacy_ctx,
            "summary": summary,
            "rootCause": root_cause,
            "findings": findings,
            "breakdownHypotheses": self._extract_breakdown_hypotheses(v2_report),
            "officialAlignment": {
                "checked": False,
                "officialCount": 0,
                "agrees": "unchecked",
                "rationale": "Diagnosis engine disabled — legacy fallback",
                "unavailableReason": None,
            },
            "confidence": round(self._compute_base_confidence(findings), 3),
            "dataFreshness": {
                "insightsSyncedAt": None,
                "structuresSyncedAt": None,
                "breakdownsSyncedAt": None,
                "isStale": True,
                "isWarning": True,
            },
            "guardrailsTriggered": [],
            "engineVersion": ENGINE_VERSION,
            "generatedAt": now_iso,
            "source": "deterministic",
        }

    @staticmethod
    def _empty_report(
        diagnosis_id: str,
        account_id: str,
        generated_at: str,
        reason: str,
    ) -> dict[str, Any]:
        return {
            "id": diagnosis_id,
            "accountId": account_id,
            "evaluationLevel": "adset",
            "vertical": "LEAD_GEN",
            "objectiveContext": {"vertical": "LEAD_GEN", "mixedObjectives": False},
            "summary": reason,
            "rootCause": "unknown",
            "findings": [],
            "breakdownHypotheses": [],
            "officialAlignment": {
                "checked": False,
                "officialCount": 0,
                "agrees": "unchecked",
                "rationale": reason,
                "unavailableReason": "no_data",
            },
            "confidence": 0.0,
            "dataFreshness": {
                "insightsSyncedAt": None,
                "structuresSyncedAt": None,
                "breakdownsSyncedAt": None,
                "isStale": True,
                "isWarning": True,
            },
            "guardrailsTriggered": ["no_data"],
            "engineVersion": ENGINE_VERSION,
            "generatedAt": generated_at,
            "source": "deterministic",
        }

    def _load_account_doc(self, user_id: str, account_id: str) -> dict[str, Any]:
        try:
            doc = (
                self.db.collection("users")
                .document(user_id)
                .collection("metaAccounts")
                .document(account_id)
                .get()
            )
            return doc.to_dict() or {} if doc.exists else {}
        except Exception:
            logger.debug("diagnosis_engine: failed to load account doc")
            return {}

    def _safe_load_official_recs(
        self, user_id: str, account_id: str
    ) -> list[dict[str, Any]] | None:
        try:
            return load_official_recommendations(self.db, user_id, account_id)
        except Exception:
            logger.debug("diagnosis_engine: failed to load official recommendations")
            return None

    @staticmethod
    def _compute_alignment(
        official_recs: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        if official_recs is None:
            return {
                "checked": False,
                "officialCount": 0,
                "agrees": "unchecked",
                "rationale": "Official recommendations API unavailable",
                "unavailableReason": "api_error",
            }
        if not official_recs:
            return {
                "checked": True,
                "officialCount": 0,
                "agrees": "unchecked",
                "rationale": "No active official recommendations found for this account",
                "unavailableReason": "no_recommendations",
            }
        count = len(official_recs)
        types = set(str(r.get("type", "")).lower() for r in official_recs if isinstance(r, dict))
        type_summary = ", ".join(sorted(types)[:5]) if types else "mixed"
        return {
            "checked": True,
            "officialCount": count,
            "agrees": "unchecked",
            "rationale": (
                f"{count} official recommendation(s) loaded ({type_summary}). "
                f"Automated comparison not yet enabled — manual review recommended."
            ),
            "unavailableReason": None,
        }

    def _run_v2_analysis(
        self,
        features: dict[str, Any],
        official_recs: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        try:
            return self.analyzer_v2.analyze(
                features,
                official_recommendations=official_recs or [],
            )
        except Exception:
            logger.exception("diagnosis_engine: V2 analysis failed")
            return {}

    def _try_ai_summary(self, features: dict[str, Any]) -> str | None:
        if self.ai_analyzer is None:
            return None
        try:
            summary = self.ai_analyzer.daily_summary(features)
            if summary and isinstance(summary, str) and len(summary.strip()) > 20:
                return summary.strip()
        except Exception:
            logger.debug("diagnosis_engine: AI summary failed, using deterministic")
        return None

    @staticmethod
    def _extract_findings(
        v2_report: dict[str, Any],
        confidence_multiplier: float,
    ) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        for item in v2_report.get("aggregateFindings", []):
            if not isinstance(item, dict):
                continue
            base_conf = 0.6
            final_conf = round(min(max(base_conf * confidence_multiplier, 0.0), 1.0), 3)
            findings.append({
                "title": item.get("statement", "Finding"),
                "evidence": item.get("evidence", {}) if isinstance(item.get("evidence"), dict) else {"detail": str(item.get("evidence", ""))},
                "interpretation": item.get("impact", item.get("statement", "")),
                "rootCause": None,
                "suggestedAction": "",
                "actionFraming": "observation" if final_conf < 0.5 else "hypothesis",
                "validationMetric": "",
                "confidence": final_conf,
            })
        return findings

    @staticmethod
    def _extract_breakdown_hypotheses(
        v2_report: dict[str, Any],
    ) -> list[dict[str, Any]]:
        hypotheses: list[dict[str, Any]] = []
        for item in v2_report.get("breakdownHypotheses", []):
            if not isinstance(item, dict):
                continue
            dimension = str(item.get("breakdownType", "")).lower()
            # Normalize dimension names
            if dimension in {"age", "gender", "placement"}:
                pass
            elif "age" in dimension:
                dimension = "age"
            elif "gender" in dimension:
                dimension = "gender"
            elif "plac" in dimension:
                dimension = "placement"
            else:
                dimension = "placement"

            hypotheses.append({
                "dimension": dimension,
                "segment": str(item.get("segment", item.get("breakdownType", ""))),
                "observation": str(item.get("evidence", "")),
                "hypothesis": str(item.get("hypothesis", "")),
                "testPlan": str(item.get("testPlan", "")),
                "confidence": 0.5,
            })
        return hypotheses

    @staticmethod
    def _classify_root_cause(
        findings: list[dict[str, Any]],
        campaigns: list[dict[str, Any]],
    ) -> str:
        """Deterministic root cause classification from findings and campaign data."""
        if not findings:
            return "unknown"

        # Gather evidence signals from finding titles/interpretations
        all_text = " ".join(
            f.get("title", "") + " " + f.get("interpretation", "")
            for f in findings
        ).lower()

        # Check for learning phase instability
        for campaign in campaigns:
            if not isinstance(campaign, dict):
                continue
            for adset in campaign.get("adsets", []):
                if not isinstance(adset, dict):
                    continue
                status = str(adset.get("effective_status", "")).upper()
                if "LEARNING" in status:
                    return "learning_instability"

        # Text-based classification
        if "cpm" in all_text and ("rising" in all_text or "increas" in all_text or "high" in all_text):
            return "auction_cost_pressure"
        if "fatigue" in all_text or ("ctr" in all_text and "declin" in all_text and "frequency" in all_text):
            return "creative_fatigue"
        if "reach" in all_text and ("declin" in all_text or "saturat" in all_text):
            return "audience_saturation"
        if "pacing" in all_text or "underspend" in all_text:
            return "pacing_constraint"
        if "bid" in all_text and ("restrict" in all_text or "cap" in all_text):
            return "restrictive_bidding"
        if "funnel" in all_text or "landing" in all_text or "post_click" in all_text:
            return "post_click_funnel_issue"
        if "overlap" in all_text:
            return "auction_overlap"
        if "breakdown" in all_text:
            return "breakdown_effect_risk"

        # Check if performance is healthy overall
        evidence_values = []
        for f in findings:
            ev = f.get("evidence", {})
            if isinstance(ev, dict):
                for v in ev.values():
                    try:
                        evidence_values.append(float(v))
                    except (TypeError, ValueError):
                        pass

        return "healthy" if not findings else "unknown"

    @staticmethod
    def _compute_base_confidence(findings: list[dict[str, Any]]) -> float:
        if not findings:
            return 0.3
        confidences = [f.get("confidence", 0.5) for f in findings if isinstance(f.get("confidence"), (int, float))]
        if not confidences:
            return 0.5
        return sum(confidences) / len(confidences)

    @staticmethod
    def _enrich_findings(
        findings: list[dict[str, Any]],
        root_cause: str,
        objective_ctx: dict[str, Any] | None = None,
    ) -> None:
        """Enrich findings in-place with riskLevel, suggestedAction, validationMetric."""
        for finding in findings:
            conf = finding.get("confidence", 0.5)
            # riskLevel: high if low confidence or severe root cause, low if healthy
            if conf < 0.4 or root_cause in ("learning_instability",):
                finding["riskLevel"] = "high"
            elif root_cause == "healthy" and conf >= 0.6:
                finding["riskLevel"] = "low"
            else:
                finding["riskLevel"] = "medium"

            # suggestedAction: derive from title/interpretation if not set
            if not finding.get("suggestedAction"):
                finding["suggestedAction"] = _infer_suggested_action(
                    finding.get("title", ""), root_cause, objective_ctx
                )

            # validationMetric: derive from evidence keys or root cause
            if not finding.get("validationMetric"):
                finding["validationMetric"] = _infer_validation_metric(
                    finding.get("evidence", {}), root_cause, objective_ctx
                )

    @staticmethod
    def _root_cause_explanation(
        root_cause: str,
        findings: list[dict[str, Any]],
        campaigns: list[dict[str, Any]],
    ) -> str:
        """Build a human-readable explanation for why a root cause was selected."""
        if root_cause == "learning_instability":
            return "At least one ad set has LEARNING status"
        if root_cause == "healthy":
            return "No negative signals detected in findings"
        if root_cause == "unknown":
            return "No matching pattern found in finding text"

        # For text-matched causes, cite the matching terms
        all_text = " ".join(
            f.get("title", "") + " " + f.get("interpretation", "")
            for f in findings
        ).lower()

        cause_terms = {
            "auction_cost_pressure": ["cpm", "rising", "increasing", "high"],
            "creative_fatigue": ["fatigue", "ctr", "declining", "frequency"],
            "audience_saturation": ["reach", "declining", "saturation"],
            "pacing_constraint": ["pacing", "underspend"],
            "restrictive_bidding": ["bid", "cap", "restrictive"],
            "post_click_funnel_issue": ["funnel", "landing", "post_click"],
            "auction_overlap": ["overlap"],
            "breakdown_effect_risk": ["breakdown"],
        }
        terms = cause_terms.get(root_cause, [])
        matched = [t for t in terms if t in all_text]
        return f"Text signals matched: {', '.join(matched)}" if matched else f"Classified as {root_cause}"

    @staticmethod
    def _deterministic_summary(
        v2_report: dict[str, Any],
        root_cause: str,
        vertical: str = "LEAD_GEN",
    ) -> str:
        parts: list[str] = []
        agg_findings = v2_report.get("aggregateFindings", [])
        if agg_findings:
            statements = [str(f.get("statement", "")) for f in agg_findings[:3] if isinstance(f, dict)]
            if statements:
                parts.append(". ".join(statements))

        # Objective-aware healthy label
        healthy_labels = {
            "LEAD_GEN": "Overall lead generation performance appears healthy.",
            "ECOMMERCE": "Overall ecommerce performance appears healthy.",
            "APP_INSTALLS": "Overall app install performance appears healthy.",
        }

        cause_labels = {
            "learning_instability": "Ad sets are in learning phase — performance is volatile.",
            "auction_cost_pressure": "Rising auction costs are pressuring efficiency.",
            "creative_fatigue": "Creative fatigue is reducing engagement.",
            "audience_saturation": "Audience saturation is limiting reach.",
            "pacing_constraint": "Budget pacing constraints are affecting delivery.",
            "restrictive_bidding": "Bid caps may be limiting delivery.",
            "post_click_funnel_issue": "Post-click funnel issues are affecting conversion rates.",
            "auction_overlap": "Auction overlap between ad sets may be increasing costs.",
            "breakdown_effect_risk": "Breakdown-level metrics may be misleading due to the Breakdown Effect.",
            "healthy": healthy_labels.get(vertical, "Overall campaign performance appears healthy."),
        }
        label = cause_labels.get(root_cause)
        if label:
            parts.append(label)

        return " ".join(parts) if parts else "Diagnosis complete. Review findings for details."


# ------------------------------------------------------------------
# Module-level helpers for finding enrichment
# ------------------------------------------------------------------

def _infer_suggested_action(
    title: str,
    root_cause: str,
    objective_ctx: dict[str, Any] | None = None,
) -> str:
    """Derive a suggested action from finding context."""
    title_lower = title.lower()
    vertical = (objective_ctx or {}).get("vertical", "LEAD_GEN")

    # Objective-aware healthy action
    healthy_actions = {
        "LEAD_GEN": "Maintain CPL below target and monitor lead volume trends",
        "ECOMMERCE": "Maintain ROAS above target and monitor purchase volume trends",
        "APP_INSTALLS": "Maintain CPI below target and monitor install volume trends",
    }

    cause_actions = {
        "learning_instability": "Wait for learning phase to complete (50+ optimization events) before making changes",
        "auction_cost_pressure": "Review bid strategy and consider broadening audience to reduce auction pressure",
        "creative_fatigue": "Refresh creative assets — test new angles while keeping top performers active",
        "audience_saturation": "Expand targeting or test new audience segments",
        "pacing_constraint": "Review budget allocation and delivery schedule",
        "restrictive_bidding": "Consider relaxing bid caps or switching to automatic bidding",
        "post_click_funnel_issue": "Audit landing page experience and conversion funnel",
        "auction_overlap": "Consolidate overlapping ad sets to reduce internal competition",
        "breakdown_effect_risk": "Do not act on breakdown averages — run a controlled split test instead",
        "healthy": healthy_actions.get(vertical, "Monitor overall performance"),
    }

    if root_cause in cause_actions:
        return cause_actions[root_cause]

    if "cpm" in title_lower:
        return "Monitor CPM trend over 7 days before adjusting"
    if "ctr" in title_lower:
        return "Review creative performance and test variations"
    if "spend" in title_lower or "budget" in title_lower:
        return "Review budget allocation against performance"

    return "Review this finding and monitor for 3-7 days"


def _infer_validation_metric(
    evidence: dict[str, Any],
    root_cause: str,
    objective_ctx: dict[str, Any] | None = None,
) -> str:
    """Derive the primary validation metric from evidence or root cause."""
    vertical = (objective_ctx or {}).get("vertical", "LEAD_GEN")

    # Objective-aware healthy validation metric
    healthy_metrics = {
        "LEAD_GEN": "cpl_7d_trend",
        "ECOMMERCE": "roas_7d",
        "APP_INSTALLS": "cpi_7d_trend",
    }

    cause_metrics = {
        "learning_instability": "optimization_events_count",
        "auction_cost_pressure": "cpm_7d_trend",
        "creative_fatigue": "ctr_7d_trend",
        "audience_saturation": "reach_vs_audience_size",
        "pacing_constraint": "spend_vs_budget_pct",
        "restrictive_bidding": "delivery_rate",
        "post_click_funnel_issue": "conversion_rate",
        "auction_overlap": "auction_overlap_pct",
        "breakdown_effect_risk": "marginal_vs_average_cpa",
        "healthy": healthy_metrics.get(vertical, "cpl_7d_trend"),
    }
    if root_cause in cause_metrics:
        return cause_metrics[root_cause]

    # Fall back to first numeric evidence key
    for key in evidence:
        try:
            float(evidence[key])
            return key
        except (TypeError, ValueError):
            continue
    return "overall_performance"
