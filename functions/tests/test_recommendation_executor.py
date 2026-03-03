import unittest
import types
from unittest.mock import MagicMock, patch

from services.recommendation_executor import execute_preview, execute_recommendation


class RecommendationExecutorAbTest(unittest.TestCase):
    def test_execute_preview_clone_ab_test(self):
        recommendation = {
            "confidence": 0.9,
            "executionPlan": {
                "action": "clone_adset_ab_test",
                "targetLevel": "adset",
                "targetId": "adset-1",
                "recommendedTestBudget": 50,
                "variableToChange": "targeting",
                "variantSettings": {
                    "custom_audiences": ["lookalike_purchase_3pct"],
                    "interests": [],
                },
            },
        }

        preview = execute_preview("user-1", "acc-1", recommendation)
        self.assertTrue(preview["canExecute"])
        self.assertEqual(preview["action"], "clone_adset_ab_test")
        self.assertEqual(preview["recommendedTestBudget"], 50)

    @patch("services.recommendation_executor._sync_ab_test_variant_firestore")
    def test_execute_recommendation_clone_ab_test(self, mock_sync_variant):
        mock_api = MagicMock()
        mock_api.clone_adset_for_ab_test.return_value = {
            "controlAdsetId": "adset-1",
            "variantAdsetId": "adset-2",
            "recommendedTestBudget": 75,
            "status": "ACTIVE",
        }

        fake_meta_api = types.ModuleType("services.meta_api")
        fake_meta_api.MetaAPIService = MagicMock(return_value=mock_api)
        fake_meta_auth = types.ModuleType("services.meta_auth")
        fake_meta_auth.get_decrypted_token = MagicMock(return_value=("token", None))

        recommendation = {
            "confidence": 0.91,
            "executionPlan": {
                "action": "clone_adset_ab_test",
                "targetLevel": "adset",
                "targetId": "adset-1",
                "recommendedTestBudget": 75,
                "variantSettings": {
                    "custom_audiences": ["lookalike_purchase_3pct"],
                    "interests": [],
                },
            },
        }

        with patch.dict(
            "sys.modules",
            {
                "services.meta_api": fake_meta_api,
                "services.meta_auth": fake_meta_auth,
            },
        ):
            result = execute_recommendation("user-1", "acc-1", recommendation)
        self.assertEqual(result["action"], "clone_adset_ab_test")
        self.assertEqual(result["variantAdsetId"], "adset-2")
        mock_api.clone_adset_for_ab_test.assert_called_once()
        mock_sync_variant.assert_called_once()


if __name__ == "__main__":
    unittest.main()
