"""Tests for utils/evaluation_level.py."""
import unittest

from utils.evaluation_level import resolve_evaluation_level


class TestResolveEvaluationLevel(unittest.TestCase):
    def test_cbo_returns_campaign(self):
        campaigns = [{"isCampaignBudgetOptimized": True}]
        self.assertEqual(resolve_evaluation_level(campaigns), "campaign")

    def test_budget_optimization_cbo_returns_campaign(self):
        campaigns = [{"budgetOptimization": "CBO"}]
        self.assertEqual(resolve_evaluation_level(campaigns), "campaign")

    def test_budget_optimization_advantage_returns_campaign(self):
        campaigns = [{"budgetOptimization": "advantage+"}]
        self.assertEqual(resolve_evaluation_level(campaigns), "campaign")

    def test_buying_type_advantage_plus_returns_campaign(self):
        campaigns = [{"buyingType": "ADVANTAGE_PLUS"}]
        self.assertEqual(resolve_evaluation_level(campaigns), "campaign")

    def test_non_cbo_returns_adset(self):
        campaigns = [{"id": "123", "status": "ACTIVE"}]
        self.assertEqual(resolve_evaluation_level(campaigns), "adset")

    def test_empty_campaigns_returns_adset(self):
        self.assertEqual(resolve_evaluation_level([]), "adset")

    def test_mixed_campaigns_cbo_wins(self):
        campaigns = [
            {"id": "1", "status": "ACTIVE"},
            {"isCampaignBudgetOptimized": True},
        ]
        self.assertEqual(resolve_evaluation_level(campaigns), "campaign")

    def test_non_dict_entries_skipped(self):
        campaigns = [None, "bad", 123, {"id": "ok"}]
        self.assertEqual(resolve_evaluation_level(campaigns), "adset")

    def test_none_values_dont_crash(self):
        campaigns = [{"budgetOptimization": None, "buyingType": None}]
        self.assertEqual(resolve_evaluation_level(campaigns), "adset")


if __name__ == "__main__":
    unittest.main()
