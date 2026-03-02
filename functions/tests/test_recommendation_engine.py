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


if __name__ == "__main__":
    unittest.main()
