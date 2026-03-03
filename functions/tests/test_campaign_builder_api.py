import json
import unittest
from unittest.mock import MagicMock, patch

from api.campaign_builder import handle_campaign_builder
from services.campaign_builder_service import ValidationError


class FakeRequest:
    def __init__(self, method: str, path: str, payload=None, args=None):
        self.method = method
        self.path = path
        self._payload = payload or {}
        self.args = args or {}
        self.headers = {"Authorization": "Bearer token"}

    def get_json(self, silent=True):
        return self._payload


class CampaignBuilderApiTest(unittest.TestCase):
    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    @patch("api.campaign_builder.get_db")
    @patch("api.campaign_builder.CampaignBuilderService")
    def test_create_draft_success(self, mock_service_cls, _mock_db, _mock_auth):
        service = MagicMock()
        service.create_draft.return_value = (
            "draft-1",
            {
                "id": "draft-1",
                "validation": {"isValid": True, "errors": [], "warnings": []},
                "benchmarkSnapshot": {"peerBenchmark": {"accountsCompared": 2}},
            },
        )
        mock_service_cls.return_value = service

        req = FakeRequest(
            "POST",
            "/api/ai/campaign-builder/drafts",
            payload={
                "accountId": "acc-1",
                "objective": "sales",
                "offer": "Test offer",
                "targetGeo": "US",
                "budget": 50,
                "language": "en",
                "campaignName": "Test",
            },
        )
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["draftId"], "draft-1")
        self.assertTrue(payload["validation"]["isValid"])

    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    @patch("api.campaign_builder.get_db")
    @patch("api.campaign_builder.CampaignBuilderService")
    def test_create_draft_accepts_flat_payload(self, mock_service_cls, _mock_db, _mock_auth):
        service = MagicMock()
        service.create_draft.return_value = (
            "draft-2",
            {
                "id": "draft-2",
                "validation": {"isValid": True, "errors": [], "warnings": []},
                "benchmarkSnapshot": {"peerBenchmark": {"accountsCompared": 2}},
            },
        )
        mock_service_cls.return_value = service

        req = FakeRequest(
            "POST",
            "/api/ai/campaign-builder/drafts",
            payload={
                "accountId": "acc-1",
                "objective": "sales",
                "offer": "Free consultation",
                "targetGeo": "US",
                "budget": 75,
                "language": "en",
            },
        )
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["draftId"], "draft-2")
        service.create_draft.assert_called_once()
        inputs = service.create_draft.call_args.kwargs["inputs"]
        self.assertEqual(inputs["objective"], "OUTCOME_SALES")
        self.assertEqual(inputs["dailyBudget"], 75.0)

    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    def test_create_draft_requires_account_id(self, _mock_auth):
        req = FakeRequest("POST", "/api/ai/campaign-builder/drafts", payload={"inputs": {}})
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 400)
        self.assertIn("accountId required", payload["error"])

    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    @patch("api.campaign_builder.get_db")
    @patch("api.campaign_builder.CampaignBuilderService")
    def test_publish_returns_validation_error_for_budget_guardrail(self, mock_service_cls, _mock_db, _mock_auth):
        service = MagicMock()
        service.publish_draft.side_effect = ValidationError("Budget exceeds safety limits. Please edit the budget block.")
        mock_service_cls.return_value = service

        req = FakeRequest(
            "POST",
            "/api/ai/campaign-builder/drafts/draft-1/publish",
            payload={"accountId": "acc-1"},
        )
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 422)
        self.assertEqual(payload["code"], "VALIDATION_ERROR")
        self.assertIn("Budget exceeds safety limits", payload["error"])

    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    @patch("api.campaign_builder.get_db")
    @patch("api.campaign_builder.CampaignBuilderService")
    def test_regenerate_requires_block_type(self, mock_service_cls, _mock_db, _mock_auth):
        mock_service_cls.return_value = MagicMock()
        req = FakeRequest(
            "POST",
            "/api/ai/campaign-builder/drafts/draft-1/regenerate",
            payload={"accountId": "acc-1"},
        )
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 400)
        self.assertIn("blockType required", payload["error"])

    @patch("api.campaign_builder.verify_auth", return_value="user-1")
    @patch("api.campaign_builder.get_db")
    @patch("api.campaign_builder.CampaignBuilderService")
    def test_update_block_endpoint(self, mock_service_cls, _mock_db, _mock_auth):
        service = MagicMock()
        service.update_block.return_value = {
            "id": "draft-1",
            "blocks": {
                "campaignPlan": {"name": "X"},
                "audiencePlan": {"geo": {"countries": ["US"]}},
                "creativePlan": {"primaryTexts": ["Hi"], "headlines": ["Head"]},
                "reasoning": "why",
            },
            "validation": {"isValid": True, "errors": [], "warnings": []},
        }
        mock_service_cls.return_value = service

        req = FakeRequest(
            "POST",
            "/api/ai/campaign-builder/drafts/draft-1/update",
            payload={
                "accountId": "acc-1",
                "blockType": "CREATIVE",
                "value": {"headlines": ["New"]},
            },
        )
        body, status, _ = handle_campaign_builder(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertIn("draft", payload)
        service.update_block.assert_called_once()


if __name__ == "__main__":
    unittest.main()
