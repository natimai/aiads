"""Core alert detection engine with configurable thresholds and rolling average analysis."""
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    type: str
    severity: str  # critical, warning, info
    message: str
    campaign_name: str = ""
    campaign_id: str = ""
    adset_id: str = ""
    ad_id: str = ""
    threshold_value: float = 0.0
    actual_value: float = 0.0
    account_name: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["acknowledged"] = False
        d["createdAt"] = datetime.now(timezone.utc)
        d["campaignRef"] = self.campaign_id
        d["adsetRef"] = self.adset_id
        d["adRef"] = self.ad_id
        d["campaignName"] = self.campaign_name
        d["accountName"] = self.account_name
        d["thresholdValue"] = self.threshold_value
        d["actualValue"] = self.actual_value
        return d


class AlertEngine:
    """Runs alert checks against campaign data using configurable thresholds."""

    def check_roas_drop(
        self,
        campaign_name: str,
        campaign_id: str,
        current_roas: float,
        historical_roas: list[float],
        threshold: float = 1.5,
        account_name: str = "",
    ) -> Alert | None:
        """Check if ROAS dropped below threshold or significantly vs rolling average."""
        if current_roas >= threshold:
            return None

        avg_3d = self._rolling_avg(historical_roas, 3)
        avg_7d = self._rolling_avg(historical_roas, 7)

        severity = "critical" if current_roas < 1.0 else "warning"

        context_parts = [f"Current ROAS: {current_roas:.2f}x (threshold: {threshold:.2f}x)"]
        if avg_3d:
            context_parts.append(f"3-day avg: {avg_3d:.2f}x")
        if avg_7d:
            context_parts.append(f"7-day avg: {avg_7d:.2f}x")

        return Alert(
            type="roas_drop",
            severity=severity,
            message=f"ROAS dropped below threshold. {'. '.join(context_parts)}",
            campaign_name=campaign_name,
            campaign_id=campaign_id,
            threshold_value=threshold,
            actual_value=current_roas,
            account_name=account_name,
        )

    def check_creative_fatigue(
        self,
        ad_name: str,
        ad_id: str,
        campaign_name: str,
        campaign_id: str,
        ctr_history: list[float],
        current_frequency: float,
        current_cpm: float,
        historical_cpm: list[float],
        frequency_threshold: float = 3.0,
        account_name: str = "",
    ) -> Alert | None:
        """Detect creative fatigue via declining CTR + rising frequency + increasing CPM."""
        signals = []

        if len(ctr_history) >= 3:
            declining_days = 0
            for i in range(1, len(ctr_history)):
                if ctr_history[i] < ctr_history[i - 1]:
                    declining_days += 1
                else:
                    declining_days = 0
            if declining_days >= 3:
                signals.append(f"CTR declining for {declining_days}+ consecutive days")

        if current_frequency > frequency_threshold:
            signals.append(f"Frequency at {current_frequency:.1f} (threshold: {frequency_threshold:.1f})")

        if len(historical_cpm) >= 3:
            avg_cpm = self._rolling_avg(historical_cpm, 3)
            if avg_cpm and current_cpm > avg_cpm * 1.15:
                signals.append(f"CPM rising: ${current_cpm:.2f} vs 3d avg ${avg_cpm:.2f}")

        if len(signals) < 2:
            return None

        severity = "warning" if len(signals) == 2 else "critical"

        return Alert(
            type="creative_fatigue",
            severity=severity,
            message=f"Creative fatigue detected. {'; '.join(signals)}",
            campaign_name=campaign_name,
            campaign_id=campaign_id,
            ad_id=ad_id,
            threshold_value=frequency_threshold,
            actual_value=current_frequency,
            account_name=account_name,
        )

    def check_budget_anomaly(
        self,
        campaign_name: str,
        campaign_id: str,
        daily_budget: float,
        current_spend: float,
        hour_of_day: int,
        historical_daily_spend: list[float],
        threshold_pct: float = 30.0,
        account_name: str = "",
    ) -> Alert | None:
        """Check for spend pacing anomalies (overspend or underspend)."""
        if daily_budget <= 0:
            return None

        expected_spend = daily_budget * (hour_of_day / 24.0)
        if expected_spend <= 0:
            return None

        deviation_pct = ((current_spend - expected_spend) / expected_spend) * 100

        avg_7d = self._rolling_avg(historical_daily_spend, 7)
        if avg_7d and avg_7d > 0:
            spike_pct = ((current_spend - avg_7d) / avg_7d) * 100
        else:
            spike_pct = 0

        if abs(deviation_pct) < threshold_pct and abs(spike_pct) < threshold_pct * 1.5:
            return None

        if deviation_pct > threshold_pct:
            severity = "critical" if deviation_pct > threshold_pct * 2 else "warning"
            message = f"Overspending: ${current_spend:.2f} spent ({deviation_pct:+.1f}% vs expected ${expected_spend:.2f} at hour {hour_of_day})"
        elif deviation_pct < -threshold_pct:
            severity = "warning"
            message = f"Underspending: ${current_spend:.2f} spent ({deviation_pct:+.1f}% vs expected ${expected_spend:.2f} at hour {hour_of_day})"
        else:
            severity = "warning"
            message = f"Spend spike: ${current_spend:.2f} vs 7d avg ${avg_7d:.2f} ({spike_pct:+.1f}%)"

        return Alert(
            type="budget_anomaly",
            severity=severity,
            message=message,
            campaign_name=campaign_name,
            campaign_id=campaign_id,
            threshold_value=threshold_pct,
            actual_value=round(deviation_pct, 1),
            account_name=account_name,
        )

    def check_cpi_spike(
        self,
        campaign_name: str,
        campaign_id: str,
        current_cpi: float,
        historical_cpi: list[float],
        threshold: float = 5.0,
        account_name: str = "",
    ) -> Alert | None:
        """Check if CPI exceeds threshold or spikes vs historical average."""
        if current_cpi <= 0:
            return None

        avg_7d = self._rolling_avg(historical_cpi, 7)
        spike_pct = 0.0
        if avg_7d and avg_7d > 0:
            spike_pct = ((current_cpi - avg_7d) / avg_7d) * 100

        if current_cpi < threshold and spike_pct < 30:
            return None

        if current_cpi >= threshold * 1.5 or spike_pct >= 50:
            severity = "critical"
        else:
            severity = "warning"

        parts = [f"CPI: ${current_cpi:.2f} (threshold: ${threshold:.2f})"]
        if avg_7d:
            parts.append(f"7d avg: ${avg_7d:.2f} ({spike_pct:+.1f}%)")

        return Alert(
            type="cpi_spike",
            severity=severity,
            message=f"CPI spike detected. {'. '.join(parts)}",
            campaign_name=campaign_name,
            campaign_id=campaign_id,
            threshold_value=threshold,
            actual_value=current_cpi,
            account_name=account_name,
        )

    def check_campaign_status(
        self,
        campaign_name: str,
        campaign_id: str,
        current_status: str,
        previous_status: str | None,
        account_name: str = "",
    ) -> Alert | None:
        """Detect campaign status changes (paused, rejected, issues)."""
        problem_statuses = {"PAUSED", "WITH_ISSUES", "DISAPPROVED", "DELETED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"}

        if current_status not in problem_statuses:
            return None

        if previous_status == current_status:
            return None

        severity_map = {
            "DISAPPROVED": "critical",
            "WITH_ISSUES": "critical",
            "DELETED": "warning",
            "PAUSED": "info",
            "CAMPAIGN_PAUSED": "info",
            "ADSET_PAUSED": "info",
        }

        return Alert(
            type="campaign_status",
            severity=severity_map.get(current_status, "info"),
            message=f"Campaign status changed to {current_status}" + (f" (was: {previous_status})" if previous_status else ""),
            campaign_name=campaign_name,
            campaign_id=campaign_id,
            threshold_value=0,
            actual_value=0,
            account_name=account_name,
        )

    @staticmethod
    def _rolling_avg(values: list[float], window: int) -> float | None:
        if not values:
            return None
        sliced = values[-window:]
        valid = [v for v in sliced if v is not None and v > 0]
        if not valid:
            return None
        return sum(valid) / len(valid)
