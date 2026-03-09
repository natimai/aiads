import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from api.ai_insights import handle_ai_insights


class FakeRequest:
    def __init__(self, method: str, path: str, payload=None):
        self.method = method
        self.path = path
        self._payload = payload or {}
        self.args = {}
        self.headers = {"Authorization": "Bearer token"}

    def get_json(self, silent=True):
        return self._payload


class FakeDocRef:
    def __init__(self, doc_id: str):
        self.id = doc_id


class FakeCollection:
    def __init__(self):
        self.items = []

    def add(self, payload):
        self.items.append(payload)
        return (None, FakeDocRef(f"doc-{len(self.items)}"))


class FakeDB:
    def __init__(self):
        self.collections = {
            "aiInsights": FakeCollection(),
            "aiAnalyzerShadowRuns": FakeCollection(),
        }

    def collection(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection()
        return self.collections[name]


class AIInsightsApiTest(unittest.TestCase):
    @patch("api.ai_insights.verify_auth", return_value="user-1")
    @patch("api.ai_insights._gather_campaign_data")
    @patch("api.ai_insights.get_db")
    @patch("services.ai_analyzer.AIAnalyzer")
    @patch("services.meta_ads_analyzer_v2.MetaAdsAnalyzerV2")
    def test_meta_diagnosis_returns_structured_payload(
        self,
        mock_v2_cls,
        mock_ai_cls,
        mock_get_db,
        mock_gather,
        _mock_auth,
    ):
        db = FakeDB()
        mock_get_db.return_value = db
        mock_gather.return_value = {
            "campaigns": [],
            "kpiSummary": {},
            "breakdowns": [],
            "officialRecommendations": [],
        }

        ai = MagicMock()
        ai.daily_summary.return_value = "legacy"
        mock_ai_cls.return_value = ai

        v2 = MagicMock()
        v2.analyze.return_value = {
            "engineVersion": "meta-ads-analyzer-v2",
            "evaluationLevel": "adset",
            "aggregateFindings": [],
            "breakdownHypotheses": [],
            "recommendationExperiments": [],
            "alignment": {"checkedAgainstOfficialRecommendations": False, "officialCount": 0},
            "policyChecks": [],
        }
        v2.to_text_report.return_value = "structured text"
        mock_v2_cls.return_value = v2

        req = FakeRequest("POST", "/api/ai/analyze", {"accountId": "acc-1", "type": "meta_diagnosis"})
        body, status, _ = handle_ai_insights(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(parsed["engineVersion"], "meta-ads-analyzer-v2")
        self.assertIn("structured", parsed)
        self.assertEqual(parsed["content"], "structured text")

    @patch("api.ai_insights.verify_auth", return_value="user-1")
    @patch("api.ai_insights._gather_campaign_data")
    @patch("api.ai_insights.get_db")
    @patch("services.ai_analyzer.AIAnalyzer")
    @patch("services.meta_ads_analyzer_v2.MetaAdsAnalyzerV2")
    def test_daily_summary_returns_legacy_when_flag_disabled(
        self,
        mock_v2_cls,
        mock_ai_cls,
        mock_get_db,
        mock_gather,
        _mock_auth,
    ):
        db = FakeDB()
        mock_get_db.return_value = db
        mock_gather.return_value = {
            "campaigns": [],
            "kpiSummary": {},
            "breakdowns": [],
            "officialRecommendations": [],
        }

        ai = MagicMock()
        ai.daily_summary.return_value = "legacy daily"
        mock_ai_cls.return_value = ai

        v2 = MagicMock()
        v2.analyze.return_value = {}
        v2.to_text_report.return_value = "v2"
        mock_v2_cls.return_value = v2

        with patch.dict(os.environ, {"META_ANALYZER_V2_ENABLED": "0", "META_ANALYZER_V2_SHADOW": "0"}, clear=False):
            req = FakeRequest("POST", "/api/ai/analyze", {"accountId": "acc-1", "type": "daily_summary"})
            body, status, _ = handle_ai_insights(req)
            parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(parsed["engineVersion"], "legacy-ai-analyzer")
        self.assertEqual(parsed["content"], "legacy daily")
        self.assertIsNone(parsed.get("structured"))

    @patch("api.ai_insights.verify_auth", return_value="user-1")
    @patch("api.ai_insights._gather_campaign_data")
    @patch("api.ai_insights.get_db")
    @patch("services.ai_analyzer.AIAnalyzer")
    @patch("services.meta_ads_analyzer_v2.MetaAdsAnalyzerV2")
    def test_shadow_mode_logs_comparison_when_v2_disabled(
        self,
        mock_v2_cls,
        mock_ai_cls,
        mock_get_db,
        mock_gather,
        _mock_auth,
    ):
        db = FakeDB()
        mock_get_db.return_value = db
        mock_gather.return_value = {
            "campaigns": [],
            "kpiSummary": {},
            "breakdowns": [],
            "officialRecommendations": [],
        }

        ai = MagicMock()
        ai.daily_summary.return_value = "legacy daily"
        mock_ai_cls.return_value = ai

        v2 = MagicMock()
        v2.analyze.return_value = {
            "engineVersion": "meta-ads-analyzer-v2",
            "evaluationLevel": "adset",
            "aggregateFindings": [],
            "breakdownHypotheses": [],
            "recommendationExperiments": [],
            "alignment": {"checkedAgainstOfficialRecommendations": False, "officialCount": 0},
            "policyChecks": [],
        }
        v2.to_text_report.return_value = "v2"
        mock_v2_cls.return_value = v2

        with patch.dict(
            os.environ,
            {
                "META_ANALYZER_V2_ENABLED": "0",
                "META_ANALYZER_V2_SHADOW": "1",
                "META_ANALYZER_V2_SHADOW_SAMPLE_RATE": "1",
            },
            clear=False,
        ):
            req = FakeRequest("POST", "/api/ai/analyze", {"accountId": "acc-1", "type": "daily_summary"})
            body, status, _ = handle_ai_insights(req)
            parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(parsed["engineVersion"], "legacy-ai-analyzer")
        self.assertEqual(parsed["content"], "legacy daily")
        self.assertEqual(len(db.collection("aiAnalyzerShadowRuns").items), 1)


if __name__ == "__main__":
    unittest.main()
