import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from services.recommendation_engine import RecommendationEngine


class RecommendationEngineTest(unittest.TestCase):
    def test_guardrail_blocks_on_stale_data(self):
        engine = RecommendationEngine(db=MagicMock())
        engine.feature_builder.build = MagicMock(
            return_value={
                "campaigns": [{"id": "c1", "insights": [{"spend": 10}], "aggregates": {}}],
                "kpiUpdatedAt": (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat(),
            }
        )
        output = engine.generate("u1", "a1", "2026-02-01", "2026-02-07")
        self.assertTrue(output["meta"]["guardrailBlocked"])
        self.assertEqual(output["recommendations"], [])

    def test_normalize_recommendation_defaults(self):
        now = datetime.now(timezone.utc)
        rec = RecommendationEngine._normalize_recommendation({"title": "x"}, now)
        self.assertEqual(rec["status"], "pending")
        self.assertEqual(rec["entityLevel"], "campaign")
        self.assertEqual(rec["type"], "budget_optimization")
        self.assertTrue(hasattr(rec["createdAt"], "isoformat"))

    def test_normalize_ab_test_task_builds_clone_execution_plan(self):
        now = datetime.now(timezone.utc)
        rec = RecommendationEngine._normalize_recommendation(
            {
                "type": "AB_TEST_AUDIENCE",
                "entityLevel": "adset",
                "proposed_action": {
                    "action": "BUILD_AB_TEST_AUDIENCE",
                    "entity_id": "adset-1",
                },
                "test_setup": {
                    "control_adset_id": "adset-1",
                    "variable_to_change": "targeting",
                    "variant_settings": {"custom_audiences": ["lookalike_purchase_3pct"], "interests": []},
                    "recommended_test_budget": 50,
                },
            },
            now,
        )
        self.assertEqual(rec["type"], "ab_test")
        self.assertEqual(rec["executionPlan"]["action"], "clone_adset_ab_test")
        self.assertEqual(rec["executionPlan"]["targetId"], "adset-1")
        self.assertIn("testSetup", rec["suggestedContent"])

    def test_reactive_breakdown_injects_targeting_optimization(self):
        engine = RecommendationEngine(db=MagicMock())
        features = {
            "campaigns": [{"id": "cmp-1", "aggregates": {}, "insights": []}],
            "breakdownSummary": {
                "age": [
                    {"age": "25-34", "campaignId": "cmp-1", "spend": 60, "purchases": 4},
                    {"age": "18-24", "campaignId": "cmp-1", "spend": 40, "purchases": 1},
                ],
                "gender": [],
                "placement": [],
            },
        }
        injected = engine._inject_reactive_tasks(features)
        self.assertTrue(any(task.get("type") == "TARGETING_OPTIMIZATION" for task in injected))


if __name__ == "__main__":
    unittest.main()
