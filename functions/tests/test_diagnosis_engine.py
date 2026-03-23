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


    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_report_contains_vertical_from_objective_context(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": [], "objective": "OUTCOME_SALES"}],
            "kpiSummary": {},
            "vertical": "ECOMMERCE",
            "objectiveContext": {
                "vertical": "ECOMMERCE",
                "mixedObjectives": False,
                "primaryConversion": "purchases",
                "primaryCostMetric": "cpa",
                "primaryEfficiencyMetric": "roas",
                "validationMetric": "roas_7d",
            },
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertEqual(report.get("vertical"), "ECOMMERCE")
        self.assertEqual(report.get("objectiveContext", {}).get("vertical"), "ECOMMERCE")

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_ecommerce_healthy_uses_roas_validation_metric(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
            "vertical": "ECOMMERCE",
            "objectiveContext": {
                "vertical": "ECOMMERCE",
                "mixedObjectives": False,
                "primaryConversion": "purchases",
                "primaryCostMetric": "cpa",
                "primaryEfficiencyMetric": "roas",
                "validationMetric": "roas_7d",
            },
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [
                {"statement": "Performance stable", "evidence": {"roas": 3.5}, "impact": "Good"}
            ],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        # Root cause is healthy or unknown (no negative signals)
        # Validation metric should be roas_7d for ECOMMERCE
        for finding in report["findings"]:
            if report["rootCause"] in ("healthy", "unknown"):
                self.assertIn(finding["validationMetric"], ("roas_7d", "overall_performance", "roas"))

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_lead_gen_healthy_uses_cpl_validation_metric(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
            "vertical": "LEAD_GEN",
            "objectiveContext": {
                "vertical": "LEAD_GEN",
                "mixedObjectives": False,
                "primaryConversion": "leads",
                "primaryCostMetric": "cpl",
                "primaryEfficiencyMetric": "cpl",
                "validationMetric": "cpl_7d_trend",
            },
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [
                {"statement": "Lead flow stable", "evidence": {"cpl": 25.0}, "impact": "Healthy"}
            ],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        for finding in report["findings"]:
            if report["rootCause"] in ("healthy", "unknown"):
                self.assertIn(finding["validationMetric"], ("cpl_7d_trend", "overall_performance", "cpl"))

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_mixed_objectives_flagged_in_report(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [
                {"id": "c1", "status": "ACTIVE", "insights": [], "adsets": [], "objective": "OUTCOME_LEADS"},
                {"id": "c2", "status": "ACTIVE", "insights": [], "adsets": [], "objective": "OUTCOME_SALES"},
            ],
            "kpiSummary": {},
            "vertical": "LEAD_GEN",
            "objectiveContext": {
                "vertical": "LEAD_GEN",
                "mixedObjectives": True,
                "primaryConversion": "leads",
                "primaryCostMetric": "cpl",
                "primaryEfficiencyMetric": "cpl",
                "validationMetric": "cpl_7d_trend",
            },
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertTrue(report.get("objectiveContext", {}).get("mixedObjectives"))

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_empty_report_has_vertical_field(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={"campaigns": []})

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertIn("vertical", report)
        self.assertIn("objectiveContext", report)

    @patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"})
    def test_report_with_vertical_passes_schema_validation(self):
        from services.diagnosis_engine import DiagnosisEngine

        engine = DiagnosisEngine(_mock_db())
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
            "vertical": "APP_INSTALLS",
            "objectiveContext": {
                "vertical": "APP_INSTALLS",
                "mixedObjectives": False,
                "primaryConversion": "installs",
                "primaryCostMetric": "cpi",
                "primaryEfficiencyMetric": "cpi",
                "validationMetric": "cpi_7d_trend",
            },
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        engine.ai_analyzer = None

        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        is_valid, errors = validate_diagnosis_report(report)
        self.assertTrue(is_valid, f"Schema validation failed: {errors}")
        self.assertEqual(report["vertical"], "APP_INSTALLS")


if __name__ == "__main__":
    unittest.main()
