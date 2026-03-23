"""Tests for utils/explainability.py."""
import unittest

from utils.explainability import ExplainabilityTrace, build_trace


class TestExplainabilityTrace(unittest.TestCase):
    def test_record_inputs(self):
        trace = build_trace()
        trace.record_inputs(["campaigns", "kpiSummary", "breakdowns"])
        result = trace.to_dict()
        self.assertEqual(result["inputsUsed"], ["campaigns", "kpiSummary", "breakdowns"])

    def test_record_confidence_adjustments(self):
        trace = build_trace()
        trace.record_confidence_adjustment("stale_data", 0.6, 0.48)
        trace.record_confidence_adjustment("low_data_volume", 0.48, 0.4)
        result = trace.to_dict()
        self.assertEqual(len(result["confidenceAdjustments"]), 2)
        self.assertEqual(result["confidenceAdjustments"][0]["reason"], "stale_data")
        self.assertAlmostEqual(result["confidenceAdjustments"][0]["from"], 0.6)
        self.assertAlmostEqual(result["confidenceAdjustments"][0]["to"], 0.48)

    def test_record_guardrails_deduplicates(self):
        trace = build_trace()
        trace.record_guardrail("breakdown_effect")
        trace.record_guardrail("learning_phase")
        trace.record_guardrail("breakdown_effect")  # duplicate
        result = trace.to_dict()
        self.assertEqual(result["guardrailsChecked"], ["breakdown_effect", "learning_phase"])

    def test_record_fallback(self):
        trace = build_trace()
        trace.record_fallback(True, "Gemini API timeout")
        result = trace.to_dict()
        self.assertTrue(result["fallbackUsed"])
        self.assertEqual(result["fallbackReason"], "Gemini API timeout")

    def test_empty_trace_has_all_keys(self):
        trace = build_trace()
        result = trace.to_dict()
        expected_keys = {
            "inputsUsed", "evaluationLevelReason", "rootCauseReason",
            "confidenceAdjustments", "guardrailsChecked",
            "officialRecsChecked", "fallbackUsed", "fallbackReason",
        }
        self.assertEqual(set(result.keys()), expected_keys)
        self.assertEqual(result["inputsUsed"], [])
        self.assertFalse(result["officialRecsChecked"])
        self.assertFalse(result["fallbackUsed"])
        self.assertIsNone(result["fallbackReason"])

    def test_skips_empty_and_none_inputs(self):
        trace = build_trace()
        trace.record_inputs(["campaigns", "", None, "breakdowns"])
        result = trace.to_dict()
        self.assertEqual(result["inputsUsed"], ["campaigns", "breakdowns"])

    def test_record_evaluation_level_and_root_cause(self):
        trace = build_trace()
        trace.record_evaluation_level("campaign", "CBO detected on campaign c1")
        trace.record_root_cause("creative_fatigue", "CTR declining + frequency rising")
        result = trace.to_dict()
        self.assertIn("CBO", result["evaluationLevelReason"])
        self.assertIn("CTR declining", result["rootCauseReason"])


if __name__ == "__main__":
    unittest.main()
