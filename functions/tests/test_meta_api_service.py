import unittest
from unittest.mock import MagicMock, patch

from services.meta_api import MetaAPIService


class MetaAPIServiceTest(unittest.TestCase):
    @patch("services.meta_api.AdAccount")
    @patch("services.meta_api.FacebookAdsApi.init")
    def test_create_campaign_sets_budget_sharing_flag_for_abo(self, _mock_api_init, mock_ad_account_cls):
        mock_account = MagicMock()
        mock_account.create_campaign.return_value = {"id": "cmp_123"}
        mock_ad_account_cls.return_value = mock_account

        service = MetaAPIService(access_token="token", account_id="1359536062226854")
        campaign_id = service.create_campaign(
            name="IL_Leads_Insurance_PersonalAgent_Comparison",
            objective="OUTCOME_LEADS",
            status="PAUSED",
        )

        self.assertEqual(campaign_id, "cmp_123")
        call_params = mock_account.create_campaign.call_args.kwargs["params"]
        self.assertIn("is_adset_budget_sharing_enabled", call_params)
        self.assertFalse(call_params["is_adset_budget_sharing_enabled"])
