import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from services.campaign_builder_service import CampaignBuilderService, ValidationError


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

    def test_regenerate_block_preserves_other_blocks(self):
        fake_ref = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {
            "inputs": {
                "campaignName": "My Campaign",
                "objective": "OUTCOME_SALES",
                "country": "US",
                "dailyBudget": 100,
            },
            "blocks": {
                "campaignPlan": {
                    "name": "My Campaign",
                    "objective": "OUTCOME_SALES",
                    "dailyBudget": 100,
                    "buyingType": "AUCTION",
                    "budgetType": "daily",
                },
                "audiencePlan": {"geo": {"countries": ["US"]}, "interests": ["Real Estate"]},
                "creativePlan": {"primaryTexts": ["A"], "headlines": ["B"], "angles": ["C"], "cta": "LEARN_MORE"},
                "reasoning": "Initial strategy",
            },
        }
        fake_ref.get.return_value = fake_doc

        self.service._ensure_account_exists = MagicMock()
        self.service._build_context = MagicMock(return_value={})
        self.service._draft_ref = MagicMock(return_value=fake_ref)
        self.service.ai.regenerate_campaign_builder_block = MagicMock(
            return_value={
                "audiencePlan": {
                    "geo": {"countries": ["CA"]},
                    "interests": ["Stock Market"],
                    "genders": ["all"],
                    "lookalikeHints": ["1% purchasers"],
                }
            }
        )

        result = self.service.regenerate_block(
            user_id="u1",
            account_id="a1",
            draft_id="d1",
            block_type="AUDIENCE",
            instruction="Try Canada",
        )

        self.assertEqual(result["blocks"]["campaignPlan"]["name"], "My Campaign")
        self.assertEqual(result["blocks"]["creativePlan"]["headlines"], ["B"])
        self.assertEqual(result["blocks"]["audiencePlan"]["geo"]["countries"], ["CA"])
        fake_ref.update.assert_called_once()

    def test_budget_guardrail_blocks_over_absolute_limit(self):
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={},
                proposed_daily_budget=1600,
            )

    def test_budget_guardrail_blocks_over_three_x_average(self):
        self.service._compute_account_avg_daily_spend = MagicMock(return_value=200)
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={},
                proposed_daily_budget=650,
            )

    def test_budget_guardrail_blocks_over_explicit_cap(self):
        self.service._compute_account_avg_daily_spend = MagicMock(return_value=0)
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={"kpi_targets": {"max_daily_spend_cap": 300}},
                proposed_daily_budget=450,
            )


if __name__ == "__main__":
    unittest.main()
