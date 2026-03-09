import unittest

from services.meta_ads_policy_enforcer import MetaAdsPolicyEnforcer


class MetaAdsPolicyEnforcerTest(unittest.TestCase):
    def setUp(self):
        self.enforcer = MetaAdsPolicyEnforcer()

    def test_blocks_pause_when_reason_is_breakdown_average_only(self):
        rec = {
            "type": "budget_optimization",
            "entityLevel": "adset",
            "entityId": "adset-1",
            "title": "Pause weak segment",
            "reasoning": "Breakdown shows higher average CPA on this segment, so pause it.",
            "why": "Breakdown shows higher average CPA on this segment, so pause it.",
            "proposedAction": {"action": "PAUSE_AD_SET", "entity_id": "adset-1"},
            "executionPlan": {"action": "set_status", "desiredStatus": "paused", "targetId": "adset-1"},
        }

        enforced, summary = self.enforcer.enforce_recommendation_list([rec], official_recommendations=[])

        self.assertEqual(enforced[0]["proposedAction"]["action"], "MANUAL_REVIEW")
        self.assertEqual(enforced[0]["executionPlan"]["action"], "none")
        self.assertGreaterEqual(summary["policyViolations"], 1)

    def test_normalizes_legal_terms_and_metrics(self):
        report = {
            "evaluationLevel": "adset",
            "aggregateFindings": [
                {
                    "statement": "Your ad reached 17,000 people and received 100 clicks.",
                    "evidence": "impressions were stable.",
                }
            ],
            "breakdownHypotheses": [],
            "recommendationExperiments": [],
            "alignment": {},
            "policyChecks": [],
        }

        enforced, _ = self.enforcer.enforce_structured_report(report, official_recommendations=[])
        finding = enforced["aggregateFindings"][0]

        self.assertIn("17,000 person", finding["statement"])
        self.assertIn("Clicks (all)", finding["statement"])
        self.assertIn("Impressions", finding["evidence"])

    def test_adds_divergence_reason_when_conflicting_with_official(self):
        rec = {
            "type": "budget_optimization",
            "entityLevel": "campaign",
            "entityId": "cmp-1",
            "title": "Scale campaign",
            "reasoning": "Test +10% budget",
            "proposedAction": {"action": "INCREASE_BUDGET", "entity_id": "cmp-1"},
            "executionPlan": {"action": "adjust_budget", "deltaPct": 10, "targetId": "cmp-1"},
        }
        official = [
            {
                "id": "off-1",
                "type": "creative_optimization",
                "entityId": "cmp-1",
                "executionPlan": {"action": "none"},
            }
        ]

        enforced, _ = self.enforcer.enforce_recommendation_list([rec], official_recommendations=official)
        alignment = enforced[0].get("alignment", {})

        self.assertFalse(alignment.get("isAligned"))
        self.assertTrue(bool(alignment.get("divergenceReason")))


if __name__ == "__main__":
    unittest.main()
