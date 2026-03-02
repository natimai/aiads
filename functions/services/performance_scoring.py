"""Performance scoring layer for campaign recommendations."""
from __future__ import annotations

from typing import Any


class PerformanceScoring:
    """Compute normalized quality and risk scores per campaign."""

    def score_campaigns(self, campaign_features: list[dict[str, Any]]) -> list[dict[str, Any]]:
        scored: list[dict[str, Any]] = []
        for campaign in campaign_features:
            aggregates = campaign.get("aggregates", {})
            insights = campaign.get("insights", [])

            efficiency = self._efficiency_score(aggregates)
            trend = self._trend_score(insights)
            stability = self._stability_score(insights)
            fatigue = self._creative_fatigue_score(insights)

            total = round((efficiency * 0.45) + (trend * 0.25) + (stability * 0.2) - (fatigue * 0.1), 2)
            total = max(0.0, min(100.0, total))
            risk_level = "high" if total < 35 else "medium" if total < 60 else "low"

            scored.append(
                {
                    "campaignId": campaign.get("id"),
                    "campaignName": campaign.get("name", ""),
                    "status": campaign.get("status", ""),
                    "scores": {
                        "overall": total,
                        "efficiency": round(efficiency, 2),
                        "trend": round(trend, 2),
                        "stability": round(stability, 2),
                        "creativeFatigue": round(fatigue, 2),
                    },
                    "riskLevel": risk_level,
                    "aggregates": aggregates,
                }
            )

        scored.sort(key=lambda item: item["scores"]["overall"])
        return scored

    @staticmethod
    def _efficiency_score(aggregates: dict[str, Any]) -> float:
        roas = float(aggregates.get("roas", 0) or 0)
        cpi = float(aggregates.get("cpi", 0) or 0)
        ctr = float(aggregates.get("ctr", 0) or 0)

        roas_score = min(100.0, roas * 28.0)
        ctr_score = min(100.0, ctr * 18.0)
        cpi_penalty = min(60.0, cpi * 4.0) if cpi > 0 else 0.0
        return max(0.0, min(100.0, (roas_score * 0.55) + (ctr_score * 0.45) - cpi_penalty))

    @staticmethod
    def _trend_score(insights: list[dict[str, Any]]) -> float:
        if len(insights) < 2:
            return 50.0

        first = insights[0]
        last = insights[-1]
        roas_change = PerformanceScoring._pct_change(first.get("roas"), last.get("roas"))
        ctr_change = PerformanceScoring._pct_change(first.get("ctr"), last.get("ctr"))
        cpi_change = PerformanceScoring._pct_change(first.get("cpi"), last.get("cpi"))

        trend = 50.0
        trend += roas_change * 0.25
        trend += ctr_change * 0.2
        trend -= cpi_change * 0.2
        return max(0.0, min(100.0, trend))

    @staticmethod
    def _stability_score(insights: list[dict[str, Any]]) -> float:
        if len(insights) < 3:
            return 50.0
        spends = [float(i.get("spend", 0) or 0) for i in insights]
        mean_spend = sum(spends) / len(spends) if spends else 0.0
        if mean_spend == 0:
            return 40.0
        variance = sum((x - mean_spend) ** 2 for x in spends) / len(spends)
        coeff_var = (variance**0.5) / mean_spend
        return max(0.0, min(100.0, 100.0 - (coeff_var * 100.0)))

    @staticmethod
    def _creative_fatigue_score(insights: list[dict[str, Any]]) -> float:
        if len(insights) < 2:
            return 30.0
        first = insights[0]
        last = insights[-1]
        freq_change = PerformanceScoring._pct_change(first.get("frequency"), last.get("frequency"))
        ctr_change = PerformanceScoring._pct_change(first.get("ctr"), last.get("ctr"))
        cpm_change = PerformanceScoring._pct_change(first.get("cpm"), last.get("cpm"))
        score = 30.0 + max(0.0, freq_change * 0.4) + max(0.0, -ctr_change * 0.35) + max(0.0, cpm_change * 0.25)
        return max(0.0, min(100.0, score))

    @staticmethod
    def _pct_change(old_val: Any, new_val: Any) -> float:
        old_num = float(old_val or 0)
        new_num = float(new_val or 0)
        if old_num == 0:
            return 0.0
        return ((new_num - old_num) / old_num) * 100.0
