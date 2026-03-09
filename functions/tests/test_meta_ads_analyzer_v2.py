import unittest

from services.meta_ads_analyzer_v2 import MetaAdsAnalyzerV2


class MetaAdsAnalyzerV2Test(unittest.TestCase):
    def setUp(self):
        self.analyzer = MetaAdsAnalyzerV2()

    def test_returns_structured_report_shape(self):
        campaign_data = {
            "accountName": "Main",
            "kpiSummary": {"totalSpend": 1200, "roas": 1.8, "avgCTR": 1.2, "avgCPM": 18},
            "campaigns": [
                {
                    "name": "Winner",
                    "todayInsights": {
                        "spend": 400,
                        "roas": 2.2,
                        "cpa": 18,
                        "ctr": 1.4,
                        "cpm": 15,
                        "frequency": 1.8,
                        "impressions": 10000,
                    },
                },
                {
                    "name": "Fatigue",
                    "todayInsights": {
                        "spend": 300,
                        "roas": 1.1,
                        "cpa": 35,
                        "ctr": 0.7,
                        "cpm": 24,
                        "frequency": 2.7,
                        "impressions": 7000,
                    },
                },
            ],
            "breakdowns": [
                {
                    "type": "age",
                    "data": [
                        {"age": "25-34", "spend": 80, "purchases": 5},
                        {"age": "18-24", "spend": 90, "purchases": 3},
                    ],
                }
            ],
        }
        official = [
            {"id": "r1", "title": "Pause loser", "reasoning": "Cut spend", "entityId": "c1"}
        ]

        report = self.analyzer.analyze(campaign_data, official_recommendations=official, language="en")

        self.assertIn("evaluationLevel", report)
        self.assertIn("aggregateFindings", report)
        self.assertIn("breakdownHypotheses", report)
        self.assertIn("recommendationExperiments", report)
        self.assertIn("alignment", report)
        self.assertIn("policyChecks", report)
        self.assertTrue(isinstance(report["recommendationExperiments"], list))

    def test_text_report_contains_sections(self):
        report = {
            "evaluationLevel": "campaign",
            "aggregateFindings": [{"statement": "A", "evidence": "B"}],
            "breakdownHypotheses": [{"hypothesis": "H", "testPlan": "T"}],
            "recommendationExperiments": [{"hypothesis": "H2", "action": "A2", "validationWindow": "3 days"}],
            "alignment": {
                "checkedAgainstOfficialRecommendations": True,
                "officialCount": 1,
                "divergenceReason": "reason",
            },
        }

        text = self.analyzer.to_text_report(report)

        self.assertIn("Evaluation level", text)
        self.assertIn("Aggregate findings", text)
        self.assertIn("Recommendation experiments", text)


if __name__ == "__main__":
    unittest.main()
