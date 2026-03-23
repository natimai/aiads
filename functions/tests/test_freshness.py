"""Tests for utils/freshness.py."""
import unittest
from datetime import datetime, timedelta, timezone

from utils.freshness import compute_confidence_downgrade, compute_freshness, is_breakdown_data_stale


class TestComputeFreshness(unittest.TestCase):
    def test_null_timestamps_are_stale(self):
        result = compute_freshness({})
        self.assertTrue(result["isStale"])
        self.assertTrue(result["isWarning"])
        self.assertIsNone(result["insightsSyncedAt"])

    def test_recent_insights_not_stale(self):
        now = datetime.now(timezone.utc)
        result = compute_freshness({"insightsSyncedAt": now.isoformat()})
        self.assertFalse(result["isStale"])
        self.assertFalse(result["isWarning"])

    def test_30min_old_is_warning(self):
        ts = datetime.now(timezone.utc) - timedelta(minutes=45)
        result = compute_freshness({"insightsSyncedAt": ts.isoformat()})
        self.assertFalse(result["isStale"])
        self.assertTrue(result["isWarning"])

    def test_3hour_old_is_stale(self):
        ts = datetime.now(timezone.utc) - timedelta(hours=3)
        result = compute_freshness({"insightsSyncedAt": ts.isoformat()})
        self.assertTrue(result["isStale"])
        self.assertTrue(result["isWarning"])

    def test_structures_and_breakdowns_timestamps(self):
        now = datetime.now(timezone.utc)
        result = compute_freshness({
            "insightsSyncedAt": now.isoformat(),
            "structuresSyncedAt": now.isoformat(),
            "breakdownsSyncedAt": now.isoformat(),
        })
        self.assertIsNotNone(result["structuresSyncedAt"])
        self.assertIsNotNone(result["breakdownsSyncedAt"])


class TestComputeConfidenceDowngrade(unittest.TestCase):
    def test_null_timestamp_returns_05(self):
        self.assertEqual(compute_confidence_downgrade({"insightsSyncedAt": None}), 0.5)

    def test_fresh_data_returns_10(self):
        now = datetime.now(timezone.utc)
        self.assertEqual(compute_confidence_downgrade({"insightsSyncedAt": now.isoformat()}), 1.0)

    def test_45min_returns_09(self):
        ts = datetime.now(timezone.utc) - timedelta(minutes=45)
        self.assertEqual(compute_confidence_downgrade({"insightsSyncedAt": ts.isoformat()}), 0.9)

    def test_3hour_returns_08(self):
        ts = datetime.now(timezone.utc) - timedelta(hours=3)
        self.assertEqual(compute_confidence_downgrade({"insightsSyncedAt": ts.isoformat()}), 0.8)

    def test_8hour_returns_07(self):
        ts = datetime.now(timezone.utc) - timedelta(hours=8)
        self.assertEqual(compute_confidence_downgrade({"insightsSyncedAt": ts.isoformat()}), 0.7)


class TestIsBreakdownDataStale(unittest.TestCase):
    def test_null_is_stale(self):
        self.assertTrue(is_breakdown_data_stale({"breakdownsSyncedAt": None}))

    def test_missing_key_is_stale(self):
        self.assertTrue(is_breakdown_data_stale({}))

    def test_recent_not_stale(self):
        now = datetime.now(timezone.utc)
        self.assertFalse(is_breakdown_data_stale({"breakdownsSyncedAt": now.isoformat()}))

    def test_7hour_is_stale(self):
        ts = datetime.now(timezone.utc) - timedelta(hours=7)
        self.assertTrue(is_breakdown_data_stale({"breakdownsSyncedAt": ts.isoformat()}))


if __name__ == "__main__":
    unittest.main()
