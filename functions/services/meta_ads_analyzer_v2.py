"""Meta Ads Analyzer V2: structured diagnosis with policy-safe recommendations."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from statistics import median
from typing import Any

from services.meta_ads_policy_enforcer import MetaAdsPolicyEnforcer
from services.meta_ads_skill_pack import get_skill_bundle


class MetaAdsAnalyzerV2:
    """Generate structured diagnosis output aligned with meta-ads-analyzer policy."""

    def __init__(self):
        self.policy = MetaAdsPolicyEnforcer()
        self.skill_bundle = get_skill_bundle()
        self.engine_version = os.environ.get("META_ANALYZER_V2_ENGINE_VERSION", "meta-ads-analyzer-v2")

    def analyze(
        self,
        campaign_data: dict[str, Any],
        *,
        official_recommendations: list[dict[str, Any]] | None = None,
        language: str = "en",
    ) -> dict[str, Any]:
        campaigns = campaign_data.get("campaigns", []) if isinstance(campaign_data.get("campaigns"), list) else []
        kpi_summary = campaign_data.get("kpiSummary", {}) if isinstance(campaign_data.get("kpiSummary"), dict) else {}
        breakdowns = campaign_data.get("breakdowns", []) if isinstance(campaign_data.get("breakdowns"), list) else []

        evaluation_level = self._determine_evaluation_level(campaigns)
        aggregate_findings = self._build_aggregate_findings(campaigns, kpi_summary)
        breakdown_hypotheses = self._build_breakdown_hypotheses(breakdowns)
        recommendation_experiments = self._build_recommendation_experiments(campaigns, breakdown_hypotheses)

        report = {
            "engineVersion": self.engine_version,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "language": str(language or "en"),
            "evaluationLevel": evaluation_level,
            "aggregateFindings": aggregate_findings,
            "breakdownHypotheses": breakdown_hypotheses,
            "recommendationExperiments": recommendation_experiments,
            "alignment": {
                "checkedAgainstOfficialRecommendations": False,
                "officialCount": 0,
                "requiresDivergenceReason": False,
                "divergenceReason": "",
            },
            "policyChecks": [],
            "skill": {
                "name": self.skill_bundle.get("name"),
                "referencesLoaded": sorted((self.skill_bundle.get("references") or {}).keys()),
            },
        }

        enforced_report, checks = self.policy.enforce_structured_report(
            report,
            official_recommendations=official_recommendations or [],
        )
        if not isinstance(enforced_report.get("policyChecks"), list):
            enforced_report["policyChecks"] = []
        enforced_report["policyChecks"].extend(checks)
        return enforced_report

    def to_text_report(self, structured: dict[str, Any]) -> str:
        """Render the structured report as readable text for backward-compatible UI."""
        parts: list[str] = []
        parts.append(f"Evaluation level: {structured.get('evaluationLevel', 'adset')}")

        findings = structured.get("aggregateFindings") if isinstance(structured.get("aggregateFindings"), list) else []
        if findings:
            parts.append("\nAggregate findings:")
            for item in findings[:8]:
                if not isinstance(item, dict):
                    continue
                statement = str(item.get("statement") or "").strip()
                evidence = str(item.get("evidence") or "").strip()
                if statement:
                    parts.append(f"- {statement}")
                if evidence:
                    parts.append(f"  Evidence: {evidence}")

        hypotheses = structured.get("breakdownHypotheses") if isinstance(structured.get("breakdownHypotheses"), list) else []
        if hypotheses:
            parts.append("\nBreakdown hypotheses:")
            for item in hypotheses[:8]:
                if not isinstance(item, dict):
                    continue
                hypothesis = str(item.get("hypothesis") or "").strip()
                test_plan = str(item.get("testPlan") or "").strip()
                if hypothesis:
                    parts.append(f"- {hypothesis}")
                if test_plan:
                    parts.append(f"  Test: {test_plan}")

        experiments = structured.get("recommendationExperiments") if isinstance(structured.get("recommendationExperiments"), list) else []
        if experiments:
            parts.append("\nRecommendation experiments:")
            for item in experiments[:8]:
                if not isinstance(item, dict):
                    continue
                hypothesis = str(item.get("hypothesis") or "").strip()
                action = str(item.get("action") or "").strip()
                window = str(item.get("validationWindow") or "").strip()
                if hypothesis:
                    parts.append(f"- Hypothesis: {hypothesis}")
                if action:
                    parts.append(f"  Action: {action}")
                if window:
                    parts.append(f"  Validation window: {window}")

        alignment = structured.get("alignment") if isinstance(structured.get("alignment"), dict) else {}
        if alignment:
            parts.append("\nAlignment:")
            parts.append(
                f"- Checked against official recommendations: {alignment.get('checkedAgainstOfficialRecommendations', False)}"
            )
            parts.append(f"- Official count: {alignment.get('officialCount', 0)}")
            divergence = str(alignment.get("divergenceReason") or "").strip()
            if divergence:
                parts.append(f"- Divergence reason: {divergence}")

        return "\n".join(parts).strip()

    @staticmethod
    def _determine_evaluation_level(campaigns: list[dict[str, Any]]) -> str:
        # If any campaign signals CBO/Advantage+ budget, enforce campaign-level evaluation.
        for campaign in campaigns:
            if not isinstance(campaign, dict):
                continue
            if campaign.get("isCampaignBudgetOptimized"):
                return "campaign"
            if str(campaign.get("budgetOptimization") or "").lower() in {"cbo", "advantage+"}:
                return "campaign"
            if str(campaign.get("buyingType") or "").upper() == "ADVANTAGE_PLUS":
                return "campaign"
        return "adset"

    @staticmethod
    def _read_insights(campaign: dict[str, Any]) -> dict[str, Any]:
        raw = campaign.get("todayInsights") if isinstance(campaign.get("todayInsights"), dict) else {}
        return {
            "spend": float(raw.get("spend", 0) or 0),
            "roas": float(raw.get("roas", 0) or 0),
            "cpa": float(raw.get("cpa", 0) or 0),
            "ctr": float(raw.get("ctr", 0) or 0),
            "cpm": float(raw.get("cpm", 0) or 0),
            "frequency": float(raw.get("frequency", 0) or 0),
            "impressions": float(raw.get("impressions", 0) or 0),
            "purchases": float(raw.get("purchases", 0) or 0),
            "leads": float(raw.get("leads", 0) or 0),
        }

    def _build_aggregate_findings(
        self, campaigns: list[dict[str, Any]], kpi_summary: dict[str, Any]
    ) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []

        spend = float(kpi_summary.get("totalSpend", 0) or 0)
        roas = float(kpi_summary.get("roas", 0) or 0)
        ctr = float(kpi_summary.get("avgCTR", 0) or 0)
        cpm = float(kpi_summary.get("avgCPM", 0) or 0)

        findings.append(
            {
                "statement": "Start from aggregate account-level performance before slices.",
                "evidence": (
                    f"Total spend {spend:.2f}, Purchase ROAS (return on ad spend) {roas:.2f}, "
                    f"CTR {ctr:.2f}%, CPM {cpm:.2f}."
                ),
                "impact": "Sets baseline for evaluating whether breakdown changes are additive or harmful.",
            }
        )

        if campaigns:
            roas_values: list[float] = []
            cpa_values: list[float] = []
            for campaign in campaigns:
                if not isinstance(campaign, dict):
                    continue
                insights = self._read_insights(campaign)
                if insights["roas"] > 0:
                    roas_values.append(insights["roas"])
                if insights["cpa"] > 0:
                    cpa_values.append(insights["cpa"])

            if roas_values:
                findings.append(
                    {
                        "statement": "ROAS spread indicates selective scaling opportunities.",
                        "evidence": (
                            f"Median Purchase ROAS (return on ad spend) across active campaigns is {median(roas_values):.2f}."
                        ),
                        "impact": "Use controlled budget experiments on winners, avoid blanket shifts.",
                    }
                )
            if cpa_values:
                findings.append(
                    {
                        "statement": "CPA dispersion suggests marginal-efficiency differences.",
                        "evidence": f"Median CPA across active campaigns is {median(cpa_values):.2f}.",
                        "impact": "Requires trend-based validation before pausing segments.",
                    }
                )

        return findings

    @staticmethod
    def _results_from_breakdown_row(row: dict[str, Any]) -> float:
        return float(row.get("purchases", 0) or row.get("leads", 0) or row.get("installs", 0) or 0)

    def _build_breakdown_hypotheses(self, breakdowns: list[dict[str, Any]]) -> list[dict[str, Any]]:
        hypotheses: list[dict[str, Any]] = []

        for doc in breakdowns[:6]:
            if not isinstance(doc, dict):
                continue
            breakdown_type = str(doc.get("type") or "")
            rows = doc.get("data") if isinstance(doc.get("data"), list) else []
            if not rows:
                continue

            total_spend = 0.0
            total_results = 0.0
            best_segment = ""
            best_segment_cpa = 0.0
            best_segment_share = 0.0

            aggregates: dict[str, dict[str, float]] = {}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                key = str(
                    row.get("age")
                    or row.get("gender")
                    or row.get("platform_position")
                    or row.get("placement")
                    or ""
                ).strip()
                if not key:
                    continue
                spend = float(row.get("spend", 0) or 0)
                results = self._results_from_breakdown_row(row)
                if spend <= 0 or results <= 0:
                    continue

                total_spend += spend
                total_results += results
                item = aggregates.setdefault(key, {"spend": 0.0, "results": 0.0})
                item["spend"] += spend
                item["results"] += results

            if total_spend <= 0 or total_results <= 0:
                continue

            overall_cpa = total_spend / total_results
            for segment, stats in aggregates.items():
                seg_results = stats["results"]
                seg_spend = stats["spend"]
                seg_share = seg_results / total_results if total_results else 0
                seg_cpa = seg_spend / seg_results if seg_results else 0
                if seg_share > best_segment_share:
                    best_segment = segment
                    best_segment_share = seg_share
                    best_segment_cpa = seg_cpa

            if not best_segment:
                continue

            hypotheses.append(
                {
                    "breakdownType": breakdown_type or "unknown",
                    "hypothesis": (
                        f"{best_segment} appears to carry a large result share ({best_segment_share * 100:.1f}%), "
                        "but action should depend on marginal trend, not average CPA alone."
                    ),
                    "evidence": (
                        f"Segment average CPA {best_segment_cpa:.2f} vs blended CPA {overall_cpa:.2f}."
                    ),
                    "testPlan": (
                        "Run a 3-7 day controlled split test and compare incremental conversions and blended CPA."
                    ),
                }
            )

        return hypotheses

    def _build_recommendation_experiments(
        self, campaigns: list[dict[str, Any]], breakdown_hypotheses: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        experiments: list[dict[str, Any]] = []

        scored: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for campaign in campaigns:
            if not isinstance(campaign, dict):
                continue
            scored.append((campaign, self._read_insights(campaign)))

        winners = sorted(scored, key=lambda item: item[1]["roas"], reverse=True)
        if winners:
            campaign, metrics = winners[0]
            if metrics["roas"] > 0:
                experiments.append(
                    {
                        "hypothesis": (
                            f"{campaign.get('name', 'Campaign')} can absorb controlled scale without hurting blended efficiency."
                        ),
                        "action": "Increase budget by 10-15% as a controlled experiment (not an unconditional scale order).",
                        "validationWindow": "3 days",
                        "expectedImpact": (
                            f"Potential lift in volume while tracking Purchase ROAS (return on ad spend) and CPA drift from {metrics['cpa']:.2f}."
                        ),
                    }
                )

        fatigue_candidates = [
            (campaign, metrics)
            for campaign, metrics in scored
            if metrics["frequency"] > 2.2 and metrics["ctr"] < 1.0
        ]
        if fatigue_candidates:
            campaign, metrics = fatigue_candidates[0]
            experiments.append(
                {
                    "hypothesis": (
                        f"{campaign.get('name', 'Campaign')} shows fatigue signature (frequency {metrics['frequency']:.2f}, CTR {metrics['ctr']:.2f}%)."
                    ),
                    "action": "Launch creative refresh test with one new angle and keep targeting unchanged.",
                    "validationWindow": "5 days",
                    "expectedImpact": "Recover CTR and stabilize CPM before broader budget changes.",
                }
            )

        for hypothesis in breakdown_hypotheses[:2]:
            if not isinstance(hypothesis, dict):
                continue
            experiments.append(
                {
                    "hypothesis": str(hypothesis.get("hypothesis") or ""),
                    "action": "Create a segment-isolation test and compare blended outcome at campaign level.",
                    "validationWindow": "7 days",
                    "expectedImpact": "Confirm whether reallocation improves aggregate results without harming delivery efficiency.",
                }
            )

        if not experiments:
            experiments.append(
                {
                    "hypothesis": "Current data does not justify irreversible allocation changes.",
                    "action": "Collect 3 additional days of stable data and rerun diagnosis.",
                    "validationWindow": "3 days",
                    "expectedImpact": "Higher-confidence decisions with reduced false positives.",
                }
            )

        return experiments[:6]
