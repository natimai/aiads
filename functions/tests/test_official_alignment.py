"""Tests for official recommendation alignment presence logic."""
import os
import unittest
from unittest.mock import MagicMock, patch


class TestOfficialAlignment(unittest.TestCase):
    def _make_engine(self):
        from services.diagnosis_engine import DiagnosisEngine
        db = MagicMock()
        account_doc = MagicMock()
        account_doc.exists = True
        account_doc.to_dict.return_value = {}
        db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = account_doc
        engine = DiagnosisEngine(db)
        engine.ai_analyzer = None
        engine.feature_builder.build = MagicMock(return_value={
            "campaigns": [{"id": "c1", "status": "ACTIVE", "insights": [], "adsets": []}],
            "kpiSummary": {},
        })
        engine.analyzer_v2.analyze = MagicMock(return_value={
            "aggregateFindings": [],
            "breakdownHypotheses": [],
        })
        return engine

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_ALIGNMENT_CHECK": "true",
    })
    def test_recs_loaded_checked_true_with_count(self):
        engine = self._make_engine()
        engine._safe_load_official_recs = MagicMock(return_value=[
            {"id": "r1", "type": "budget_optimization", "title": "Scale budget"},
            {"id": "r2", "type": "creative_optimization", "title": "Refresh creatives"},
        ])
        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        alignment = report["officialAlignment"]
        self.assertTrue(alignment["checked"])
        self.assertEqual(alignment["officialCount"], 2)
        self.assertEqual(alignment["agrees"], "unchecked")
        self.assertIsNone(alignment["unavailableReason"])
        self.assertIn("2", alignment["rationale"])

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_ALIGNMENT_CHECK": "true",
    })
    def test_api_error_checked_false(self):
        engine = self._make_engine()
        engine._safe_load_official_recs = MagicMock(return_value=None)
        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        alignment = report["officialAlignment"]
        self.assertFalse(alignment["checked"])
        self.assertEqual(alignment["agrees"], "unchecked")
        self.assertEqual(alignment["unavailableReason"], "api_error")

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_ALIGNMENT_CHECK": "true",
    })
    def test_no_recs_checked_true_zero_count(self):
        engine = self._make_engine()
        engine._safe_load_official_recs = MagicMock(return_value=[])
        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        alignment = report["officialAlignment"]
        self.assertTrue(alignment["checked"])
        self.assertEqual(alignment["officialCount"], 0)
        self.assertEqual(alignment["unavailableReason"], "no_recommendations")

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_ALIGNMENT_CHECK": "false",
    })
    def test_flag_off_skips_alignment_check(self):
        engine = self._make_engine()
        # Should NOT call _safe_load_official_recs when flag is off
        engine._safe_load_official_recs = MagicMock(return_value=[{"id": "r1"}])
        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        alignment = report["officialAlignment"]
        # When flag is off, official_recs is None → checked=False
        engine._safe_load_official_recs.assert_not_called()

    @patch.dict(os.environ, {
        "FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true",
        "FEATURE_FLAG_ENABLE_ALIGNMENT_CHECK": "true",
    })
    def test_agrees_never_yes_partially_no(self):
        """Sprint 2 contract: agrees must always be 'unchecked'."""
        engine = self._make_engine()
        engine._safe_load_official_recs = MagicMock(return_value=[
            {"id": "r1", "type": "budget_optimization"},
        ])
        report = engine.diagnose("u1", "a1", "2025-01-01", "2025-01-07")
        self.assertEqual(report["officialAlignment"]["agrees"], "unchecked")


if __name__ == "__main__":
    unittest.main()
