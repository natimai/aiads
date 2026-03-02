import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from services.campaign_builder_service import CampaignBuilderService


class CampaignBuilderServiceTest(unittest.TestCase):
    def setUp(self):
        self.service = CampaignBuilderService(db=MagicMock())

    def test_validate_blocks_errors_on_missing_required_fields(self):
        result = self.service._validate_blocks({}, {})
        self.assertFalse(result["isValid"])
        self.assertGreaterEqual(len(result["errors"]), 3)

    def test_normalize_blocks_populates_defaults(self):
        inputs = {"campaignName": "Launch A", "objective": "OUTCOME_SALES", "country": "IL", "dailyBudget": 77}
        blocks = self.service._normalize_blocks({}, inputs)
        self.assertEqual(blocks["campaignPlan"]["name"], "Launch A")
        self.assertEqual(blocks["campaignPlan"]["dailyBudget"], 77)
        self.assertEqual(blocks["audiencePlan"]["geo"]["countries"], ["IL"])
        self.assertTrue(blocks["creativePlan"]["primaryTexts"])

    def test_preflight_marks_high_budget_confirmation(self):
        fake_ref = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {
            "inputs": {},
            "blocks": {
                "campaignPlan": {"name": "X", "dailyBudget": 1000, "objective": "OUTCOME_SALES"},
                "audiencePlan": {"geo": {"countries": ["US"]}},
                "creativePlan": {"primaryTexts": ["a"], "headlines": ["b"]},
            },
            "status": "draft",
            "updatedAt": datetime.now(timezone.utc),
        }
        fake_ref.get.return_value = fake_doc

        self.service._draft_ref = MagicMock(return_value=fake_ref)
        self.service._compute_account_avg_daily_budget = MagicMock(return_value=50)

        result = self.service.preflight(user_id="u1", account_id="a1", draft_id="d1")
        self.assertEqual(result["safetyStatus"], "blocked")
        self.assertTrue(result["requiresExplicitConfirm"])
        self.assertTrue(result["budgetCheck"]["isOver10x"])


if __name__ == "__main__":
    unittest.main()
