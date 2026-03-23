"""Tests for services/diagnosis_engine.py."""
import os
import unittest
from unittest.mock import MagicMock, patch

from utils.schema_validation import validate_diagnosis_report


def _mock_db():
    """Create a mock Firestore db that returns empty results."""
    db = MagicMock()
    # Mock account doc
    account_doc = MagicMock()
    account_doc.exists = True
    account_doc.to_dict.return_value = {}
    db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = account_doc
    # Mock recommendations stream
    db.collection.return_value.document.return_value.collection.return_value.document.return_value.collection.return_value.stream.return_value = []
    return db


class TestDiagnosisEngine(unittest.TestCase):
    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "false"})
    def test_flag_off_returns_deterministic(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIsNotNone(report)
        self.assertEqual(report["source"], "deterministic")
        self.assertIn("id", report)
        self.assertIn("accountId", report)

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "false"})
    def test_flag_off_never_returns_none(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={"campaigns": []})

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIsNotNone(report)
        self.assertEqual(report["source"], "deterministic")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_empty_campaigns_returns_empty_report(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={"campaigns": []})

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIsNotNone(report)
        self.assertEqual(report["rootCause"], "unknown")
        self.assertIn("no_data", report.get("guardrailsTriggered", []))

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_valid_report_passes_schema_validation(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [
                {"statement": "CPM rising", "evidence": {"cpm": 12.5}, "impact": "Cost pressure"}
            ],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None  # Force deterministic

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Schema validation failed: {errors}")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_gemini_failure_falls_back_to_deterministic(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        # Mock AI analyzer that throws
        engine.ai_analyzer = MagicMock()
        engine.ai_analyzer.daily_summary.side_effect = Exception("Gemini down")

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIsNotNone(report)
        self.assertEqual(report["source"], "deterministic")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_report_has_required_fields(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        for field in ("id", "accountId", "evaluationLevel", "summary", "rootCause",
                       "findings", "confidence", "generatedAt", "source"):
            self.assertIn(field, report, f"Missing field: {field}")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_official_alignment_unchecked_when_recs_unavailable(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None
        # Make official recs loading fail
        engine._safe_load_official_recs = MagicMock(return_value=None)

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        alignment = report.get("officialAlignment", {})
        self.assertEqual(alignment.get("agrees"), "unchecked")
        self.assertFalse(alignment.get("checked", True))


    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_EXPLAINABILITY_LOGS": "true",
    })
    def test_explainability_trace_attached_when_flag_on(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {"totalSpend": 100},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [
                {"statement": "CPM rising", "evidence": {"cpm": 12.5}, "impact": "Cost pressure"}
            ],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIn("explainabilityTrace", report)
        trace = report["explainabilityTrace"]
        self.assertIsInstance(trace["inputsUsed"], list)
        self.assertIn("campaigns", trace["inputsUsed"])
        self.assertTrue(trace["fallbackUsed"])  # ai_analyzer is None

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_EXPLAINABILITY_LOGS": "false",
    })
    def test_no_trace_when_flag_off(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertNotIn("explainabilityTrace", report)

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_findings_enriched_with_risk_level(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [
                {"statement": "CPM rising", "evidence": {"cpm": 12.5}, "impact": "Cost up"}
            ],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        for finding in report["findings"]:
            self.assertIn(finding["riskLevel"], ("high", "medium", "low"))
            self.assertTrue(len(finding["suggestedAction"]) > 0)
            self.assertTrue(len(finding["validationMetric"]) > 0)


if __name__ == "__main__":
    unittest.main()
