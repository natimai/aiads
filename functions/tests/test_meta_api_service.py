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

    @patch("services.meta_api.TargetingSearch.search")
    @patch("services.meta_api.AdAccount")
    @patch("services.meta_api.FacebookAdsApi.init")
    def test_create_adset_resolves_interest_names_to_ids(
        self,
        _mock_api_init,
        mock_ad_account_cls,
        mock_targeting_search,
    ):
        mock_account = MagicMock()
        mock_account.create_ad_set.return_value = {"id": "adset_123"}
        mock_ad_account_cls.return_value = mock_account
        mock_targeting_search.return_value = [{"id": "6003139266461", "name": "Insurance"}]

        service = MetaAPIService(access_token="token", account_id="1359536062226854")
        adset_id = service.create_adset(
            campaign_id="camp_123",
            name="Adset A",
            daily_budget=10000,
            targeting={
                "geo_locations": {"countries": ["IL"]},
                "age_min": 25,
                "age_max": 65,
                "interests": [{"name": "Insurance"}],
            },
        )

        self.assertEqual(adset_id, "adset_123")
        targeting = mock_account.create_ad_set.call_args.kwargs["params"]["targeting"]
        self.assertEqual(targeting["interests"], [{"id": "6003139266461", "name": "Insurance"}])

    @patch("services.meta_api.TargetingSearch.search", return_value=[])
    @patch("services.meta_api.AdAccount")
    @patch("services.meta_api.FacebookAdsApi.init")
    def test_create_adset_drops_unresolved_interests(
        self,
        _mock_api_init,
        mock_ad_account_cls,
        _mock_targeting_search,
    ):
        mock_account = MagicMock()
        mock_account.create_ad_set.return_value = {"id": "adset_456"}
        mock_ad_account_cls.return_value = mock_account

        service = MetaAPIService(access_token="token", account_id="1359536062226854")
        adset_id = service.create_adset(
            campaign_id="camp_456",
            name="Adset B",
            daily_budget=10000,
            targeting={
                "geo_locations": {"countries": ["IL"]},
                "age_min": 25,
                "age_max": 65,
                "interests": [{"name": "Non Existing Interest"}],
            },
        )

        self.assertEqual(adset_id, "adset_456")
        targeting = mock_account.create_ad_set.call_args.kwargs["params"]["targeting"]
        self.assertNotIn("interests", targeting)

    @patch("services.meta_api.AdAccount")
    @patch("services.meta_api.FacebookAdsApi.init")
    @patch.object(MetaAPIService, "_get_first_pixel_id", return_value="pixel_123")
    def test_create_adset_auto_sets_promoted_object_for_offsite_conversions(
        self,
        _mock_pixel_id,
        _mock_api_init,
        mock_ad_account_cls,
    ):
        mock_account = MagicMock()
        mock_account.create_ad_set.return_value = {"id": "adset_789"}
        mock_ad_account_cls.return_value = mock_account

        service = MetaAPIService(access_token="token", account_id="1359536062226854")
        service.create_adset(
            campaign_id="camp_789",
            name="Adset C",
            daily_budget=10000,
            targeting={"geo_locations": {"countries": ["IL"]}, "age_min": 25, "age_max": 65},
            optimization_goal="OFFSITE_CONVERSIONS",
            promoted_object={"custom_event_type": "LEAD"},
        )

        params = mock_account.create_ad_set.call_args.kwargs["params"]
        self.assertEqual(
            params["promoted_object"],
            {"pixel_id": "pixel_123", "custom_event_type": "LEAD"},
        )
