import unittest
from unittest.mock import MagicMock, patch

from scheduled.morning_strategist import _is_performance_strong, _should_create_proactive_draft


class MorningStrategistTest(unittest.TestCase):
    def test_is_performance_strong_against_targets(self):
        account = {
            "kpiSummary": {"roas": 3.0, "avgCostPerLead": 18},
            "kpi_targets": {"target_roas": 2.2, "target_cpa": 25},
        }
        self.assertTrue(_is_performance_strong(account))

    def test_is_performance_strong_falls_back_to_roas_when_no_targets(self):
        account = {"kpiSummary": {"roas": 2.3}}
        self.assertTrue(_is_performance_strong(account))

    @patch("scheduled.morning_strategist._frequency_trend", return_value=(1.5, 1.95))
    def test_should_create_proactive_draft_when_strong_and_fatiguing(self, _mock_trend):
        account = {"kpiSummary": {"roas": 2.8}, "kpiTargets": {"targetRoas": 2.0}}
        should_create, signal = _should_create_proactive_draft(
            MagicMock(),
            "user-1",
            "act-1",
            account,
        )
        self.assertTrue(should_create)
        self.assertGreater(signal["frequencyCurrent"], signal["frequencyBaseline"])

    @patch("scheduled.morning_strategist._frequency_trend", return_value=(1.7, 1.72))
    def test_should_not_create_proactive_draft_without_rising_frequency(self, _mock_trend):
        account = {"kpiSummary": {"roas": 2.8}, "kpiTargets": {"targetRoas": 2.0}}
        should_create, _signal = _should_create_proactive_draft(
            MagicMock(),
            "user-1",
            "act-1",
            account,
        )
        self.assertFalse(should_create)


if __name__ == "__main__":
    unittest.main()
