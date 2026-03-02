import unittest

from services.performance_scoring import PerformanceScoring


class PerformanceScoringTest(unittest.TestCase):
    def setUp(self):
        self.scoring = PerformanceScoring()

    def test_scores_campaigns_and_orders_by_risk(self):
        payload = [
            {
                "id": "high",
                "name": "Good",
                "status": "ACTIVE",
                "aggregates": {"roas": 2.8, "cpi": 2.0, "ctr": 2.2},
                "insights": [
                    {"roas": 2.2, "ctr": 1.9, "cpi": 2.4, "frequency": 1.6, "cpm": 9.0, "spend": 120},
                    {"roas": 2.8, "ctr": 2.3, "cpi": 1.9, "frequency": 1.7, "cpm": 9.3, "spend": 130},
                ],
            },
            {
                "id": "low",
                "name": "Bad",
                "status": "ACTIVE",
                "aggregates": {"roas": 0.6, "cpi": 15.0, "ctr": 0.6},
                "insights": [
                    {"roas": 1.0, "ctr": 1.0, "cpi": 8.0, "frequency": 1.2, "cpm": 7.0, "spend": 80},
                    {"roas": 0.6, "ctr": 0.6, "cpi": 15.0, "frequency": 2.4, "cpm": 12.5, "spend": 210},
                ],
            },
        ]
        scored = self.scoring.score_campaigns(payload)
        self.assertEqual(scored[0]["campaignId"], "low")
        self.assertEqual(scored[-1]["campaignId"], "high")
        self.assertGreater(scored[-1]["scores"]["overall"], scored[0]["scores"]["overall"])


if __name__ == "__main__":
    unittest.main()
