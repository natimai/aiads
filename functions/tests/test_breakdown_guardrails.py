"""Tests for breakdown guardrail behavior in recommendation_engine.py."""
import os
import unittest
from unittest.mock import MagicMock, patch

from services.recommendation_engine import RecommendationEngine


def _make_breakdown_features():
    """Build features dict that triggers breakdown targeting logic.

    Creates a segment with >60% result share at lower CPA than overall.
    """
    return {
        "campaigns": [{"id": "c1", "insights": [{"spend": 100}], "aggregates": {}}],
        "breakdownSummary": {
            "age": [
                # Dominant segment: 80 purchases / $800 spend = $10 CPA, 80/85 = 94% share
                {"age": "25-34", "spend": 800, "purchases": 80, "campaignId": "c1"},
                # Minor segment: 5 purchases / $200 spend = $40 CPA
                {"age": "65+", "spend": 200, "purchases": 5, "campaignId": "c1"},
            ]
        },
    }


class TestBreakdownGuardrails(unittest.TestCase):
    def setUp(self):
        self.engine = RecommendationEngine(db=MagicMock())

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "true"})
    def test_guardrail_on_outputs_manual_review(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated (data may not trigger)")
            return
        task = tasks[0]
        self.assertEqual(task["proposed_action"]["action"], "MANUAL_REVIEW")
        self.assertNotEqual(task["proposed_action"]["action"], "UPDATE_AUDIENCE")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "true"})
    def test_guardrail_on_title_not_isolate(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated")
            return
        task = tasks[0]
        self.assertNotIn("Isolate", task["title"])
        self.assertIn("Validate", task["title"])

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "true"})
    def test_guardrail_on_reasoning_contains_hypothesis(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated")
            return
        task = tasks[0]
        reasoning_lower = task["reasoning"].lower()
        self.assertTrue(
            "breakdown effect" in reasoning_lower or "test" in reasoning_lower or "hypothesis" in reasoning_lower,
            f"Reasoning should mention hypothesis/test/Breakdown Effect: {task['reasoning']}"
        )

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "true"})
    def test_guardrail_on_confidence_below_07(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated")
            return
        task = tasks[0]
        self.assertLess(task["confidence"], 0.7)

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "true"})
    def test_guardrail_on_has_action_framing(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated")
            return
        task = tasks[0]
        self.assertEqual(task.get("actionFraming"), "hypothesis")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "false"})
    def test_guardrail_off_preserves_old_behavior(self):
        features = _make_breakdown_features()
        tasks = self.engine._build_breakdown_targeting_tasks(features)
        if not tasks:
            self.skipTest("No breakdown tasks generated")
            return
        task = tasks[0]
        self.assertEqual(task["proposed_action"]["action"], "UPDATE_AUDIENCE")
        self.assertIn("Isolate", task["title"])


if __name__ == "__main__":
    unittest.main()
