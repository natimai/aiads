import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scheduled.ghost_drafts import _pick_opportunity_theme


class GhostDraftsTest(unittest.TestCase):
    @patch("scheduled.ghost_drafts.datetime")
    def test_pick_theme_weekend_flash_sale(self, mock_datetime):
        now = datetime(2026, 3, 6, 9, 0, tzinfo=timezone.utc)  # Friday
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

        theme = _pick_opportunity_theme({"kpiSummary": {"roas": 1.1, "avgCPI": 3.2, "avgCTR": 0.7}})
        self.assertIn("Flash Sale", theme)

    @patch("scheduled.ghost_drafts.datetime")
    def test_pick_theme_prefers_low_cpi(self, mock_datetime):
        now = datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc)  # Monday
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

        theme = _pick_opportunity_theme({"kpiSummary": {"roas": 1.3, "avgCPI": 1.8, "avgCTR": 1.1}})
        self.assertEqual(theme, "Scale While CPA Is Low")

    @patch("scheduled.ghost_drafts.datetime")
    def test_pick_theme_roas_signal(self, mock_datetime):
        now = datetime(2026, 3, 3, 9, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

        theme = _pick_opportunity_theme({"kpiSummary": {"roas": 2.4, "avgCPI": 3.0, "avgCTR": 1.0}})
        self.assertEqual(theme, "Winner Expansion Campaign")


if __name__ == "__main__":
    unittest.main()
