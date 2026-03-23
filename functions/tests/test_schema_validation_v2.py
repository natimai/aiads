"""Tests for Sprint 2 additive schema validation extensions."""
import unittest

from utils.schema_validation import validate_diagnosis_report


def _valid_report(**overrides):
    base = {
        "id": "test-123",
        "accountId": "acc-456",
        "evaluationLevel": "adset",
        "summary": "Test summary",
        "rootCause": "healthy",
        "confidence": 0.8,
        "generatedAt": "2025-01-01T00:00:00Z",
        "source": "deterministic",
        "findings": [
            {
                "title": "Finding 1",
                "evidence": {"ctr": 1.5},
                "interpretation": "Good CTR",
                "actionFraming": "observation",
                "confidence": 0.6,
            }
        ],
    }
    base.update(overrides)
    return base


class TestSchemaValidationV2(unittest.TestCase):
    def test_report_without_trace_still_valid(self):
        report = _valid_report()
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_report_with_valid_trace(self):
        report = _valid_report(explainabilityTrace={
            "inputsUsed": ["campaigns", "kpiSummary"],
            "evaluationLevelReason": "CBO detected",
            "rootCauseReason": "healthy: no negative signals",
            "confidenceAdjustments": [{"reason": "stale_data", "from": 0.6, "to": 0.48}],
            "guardrailsChecked": ["breakdown_effect"],
            "officialRecsChecked": True,
            "fallbackUsed": False,
            "fallbackReason": None,
        })
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_trace_with_invalid_inputs_type(self):
        report = _valid_report(explainabilityTrace={
            "inputsUsed": "not_a_list",
        })
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("inputsUsed" in e for e in errors))

    def test_trace_must_be_dict(self):
        report = _valid_report(explainabilityTrace="not_a_dict")
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("explainabilityTrace" in e for e in errors))

    def test_finding_valid_risk_level(self):
        report = _valid_report(findings=[
            {
                "title": "F1",
                "evidence": {"x": 1},
                "interpretation": "y",
                "actionFraming": "hypothesis",
                "confidence": 0.5,
                "riskLevel": "high",
            }
        ])
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_finding_invalid_risk_level(self):
        report = _valid_report(findings=[
            {
                "title": "F1",
                "evidence": {"x": 1},
                "interpretation": "y",
                "actionFraming": "hypothesis",
                "confidence": 0.5,
                "riskLevel": "critical",
            }
        ])
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("riskLevel" in e for e in errors))

    def test_finding_without_risk_level_still_valid(self):
        report = _valid_report(findings=[
            {
                "title": "F1",
                "evidence": {"x": 1},
                "interpretation": "y",
                "actionFraming": "observation",
                "confidence": 0.5,
            }
        ])
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")


    # Sprint 3: vertical field validation
    def test_report_with_valid_vertical(self):
        report = _valid_report(vertical="LEAD_GEN")
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_report_with_invalid_vertical_fails(self):
        report = _valid_report(vertical="UNKNOWN_TYPE")
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("vertical" in e for e in errors))

    def test_report_without_vertical_still_valid(self):
        report = _valid_report()
        self.assertNotIn("vertical", report)
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_all_valid_verticals_accepted(self):
        for v in ("LEAD_GEN", "ECOMMERCE", "APP_INSTALLS"):
            report = _valid_report(vertical=v)
            is_valid, errors = validate_diagnosis_report(report)
            self.assertTrue(is_valid, f"Vertical {v} should be valid: {errors}")


if __name__ == "__main__":
    unittest.main()
