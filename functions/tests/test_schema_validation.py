"""Tests for utils/schema_validation.py."""
import unittest

from utils.schema_validation import validate_diagnosis_report


def _valid_report():
    return {
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


class TestValidateDiagnosisReport(unittest.TestCase):
    def test_valid_report_passes(self):
        is_valid, errors = validate_diagnosis_report(_valid_report())
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")
        self.assertEqual(errors, [])

    def test_missing_required_field_fails(self):
        report = _valid_report()
        del report["rootCause"]
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("rootCause" in e for e in errors))

    def test_invalid_evaluation_level_fails(self):
        report = _valid_report()
        report["evaluationLevel"] = "invalid"
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("evaluationLevel" in e for e in errors))

    def test_invalid_root_cause_fails(self):
        report = _valid_report()
        report["rootCause"] = "not_a_real_cause"
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)

    def test_invalid_source_fails(self):
        report = _valid_report()
        report["source"] = "magic"
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)

    def test_confidence_out_of_range_fails(self):
        report = _valid_report()
        report["confidence"] = 1.5
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)

    def test_empty_findings_is_valid(self):
        report = _valid_report()
        report["findings"] = []
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_finding_missing_title_fails(self):
        report = _valid_report()
        report["findings"] = [
            {"evidence": {"x": 1}, "interpretation": "y", "actionFraming": "observation", "confidence": 0.5}
        ]
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)

    def test_finding_directive_framing_fails(self):
        report = _valid_report()
        report["findings"] = [
            {
                "title": "F",
                "evidence": {"x": 1},
                "interpretation": "y",
                "actionFraming": "directive",
                "confidence": 0.5,
            }
        ]
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)
        self.assertTrue(any("directive" in e for e in errors))

    def test_valid_breakdown_hypothesis(self):
        report = _valid_report()
        report["breakdownHypotheses"] = [
            {
                "dimension": "age",
                "segment": "25-34",
                "observation": "High share",
                "hypothesis": "May be marginal",
                "confidence": 0.5,
            }
        ]
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_invalid_breakdown_dimension_fails(self):
        report = _valid_report()
        report["breakdownHypotheses"] = [
            {
                "dimension": "invalid_dim",
                "segment": "x",
                "observation": "y",
                "hypothesis": "z",
                "confidence": 0.5,
            }
        ]
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)

    def test_official_alignment_valid(self):
        report = _valid_report()
        report["officialAlignment"] = {"agrees": "yes"}
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Unexpected errors: {errors}")

    def test_official_alignment_invalid_agrees(self):
        report = _valid_report()
        report["officialAlignment"] = {"agrees": "maybe"}
        is_valid, errors = validate_diagnosis_report(report)
        self.assertFalse(is_valid)


if __name__ == "__main__":
    unittest.main()
