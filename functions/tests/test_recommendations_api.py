import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from api.recommendations import handle_recommendations


class FakeRequest:
    def __init__(self, method: str, path: str, payload=None, args=None):
        self.method = method
        self.path = path
        self._payload = payload or {}
        self.args = args or {}
        self.headers = {"Authorization": "Bearer token"}

    def get_json(self, silent=True):
        return self._payload


class FakeDocSnapshot:
    def __init__(self, exists=True, data=None):
        self.exists = exists
        self._data = data or {}

    def to_dict(self):
        return self._data


class FakeLogDoc:
    def __init__(self):
        self.set_payload = None
        self.updated_with = None

    def set(self, payload):
        self.set_payload = payload

    def update(self, payload):
        self.updated_with = payload


class FakeSubCollection:
    def __init__(self):
        self.docs = []

    def document(self, _doc_id=None):
        doc = FakeLogDoc()
        self.docs.append(doc)
        return doc

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def stream(self):
        class _DocWrap:
            def __init__(self, idx, payload):
                self.id = f"exec-{idx}"
                self._payload = payload

            def to_dict(self):
                return self._payload.set_payload or self._payload.updated_with or {}

        return iter([_DocWrap(i, doc) for i, doc in enumerate(self.docs, start=1)])


class FakeRecommendationDoc:
    def __init__(self, doc_id="generated-id", exists=True):
        self.id = doc_id
        self.exists = exists
        self.updated_with = None
        self.set_payload = None
        self.subcollections = {"executions": FakeSubCollection()}
        self.data = {
            "status": "approved",
            "entityLevel": "campaign",
            "entityId": "cmp-1",
            "confidence": 0.91,
            "executionPlan": {
                "action": "adjust_budget",
                "targetLevel": "campaign",
                "targetId": "cmp-1",
                "deltaPct": 10,
            },
            "expiresAt": datetime.now(timezone.utc) + timedelta(hours=3),
        }

    def set(self, payload):
        self.set_payload = payload
        if isinstance(payload, dict):
            self.data.update(payload)

    def get(self):
        return FakeDocSnapshot(exists=self.exists, data=self.data)

    def update(self, payload):
        self.updated_with = payload
        if isinstance(payload, dict):
            self.data.update(payload)

    def collection(self, name):
        if name not in self.subcollections:
            self.subcollections[name] = FakeSubCollection()
        return self.subcollections[name]


class FakeRecommendationsCollection:
    def __init__(self):
        self.docs = []
        self.doc_by_id = {}

    def document(self, doc_id=None):
        if doc_id:
            if doc_id not in self.doc_by_id:
                self.doc_by_id[doc_id] = FakeRecommendationDoc(doc_id=doc_id, exists=True)
            return self.doc_by_id[doc_id]
        doc = FakeRecommendationDoc()
        self.docs.append(doc)
        return doc

    # For list endpoint compatibility in case used
    def where(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def stream(self):
        return iter([])


class FakeAccountDoc:
    def __init__(self, rec_collection):
        self.rec_collection = rec_collection
        self.data = {"kpiUpdatedAt": datetime.now(timezone.utc), "recommendationPolicy": {}}

    def collection(self, name):
        if name == "recommendations":
            return self.rec_collection
        raise ValueError(name)

    def get(self):
        return FakeDocSnapshot(exists=True, data=self.data)

    def set(self, payload, merge=False):
        if merge and isinstance(payload, dict):
            self.data.update(payload)
        elif isinstance(payload, dict):
            self.data = payload


class FakeMetaAccountsCollection:
    def __init__(self, rec_collection):
        self.rec_collection = rec_collection
        self.accounts = {}

    def document(self, account_id):
        if account_id not in self.accounts:
            self.accounts[account_id] = FakeAccountDoc(self.rec_collection)
        return self.accounts[account_id]


class FakeUserDoc:
    def __init__(self, rec_collection):
        self.rec_collection = rec_collection
        self.meta_accounts = FakeMetaAccountsCollection(self.rec_collection)

    def collection(self, name):
        if name == "metaAccounts":
            return self.meta_accounts
        raise ValueError(name)


class FakeUsersCollection:
    def __init__(self, rec_collection):
        self.rec_collection = rec_collection
        self.users = {}

    def document(self, user_id):
        if user_id not in self.users:
            self.users[user_id] = FakeUserDoc(self.rec_collection)
        return self.users[user_id]


class FakeDB:
    def __init__(self):
        self.recommendations = FakeRecommendationsCollection()
        self.users_collection = FakeUsersCollection(self.recommendations)

    def collection(self, name):
        if name == "users":
            return self.users_collection
        raise ValueError(name)


class RecommendationsApiTest(unittest.TestCase):
    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.log_event")
    @patch("api.recommendations._is_recent_duplicate", return_value=False)
    @patch("api.recommendations.RecommendationEngine")
    @patch("api.recommendations.get_db")
    def test_generate_recommendations_flow(
        self, mock_get_db, mock_engine_cls, _mock_dedup, _mock_log, _mock_auth
    ):
        db = FakeDB()
        mock_get_db.return_value = db
        engine = MagicMock()
        engine.generate.return_value = {
            "recommendations": [
                {
                    "type": "budget_optimization",
                    "entityLevel": "campaign",
                    "entityId": "cmp-1",
                    "title": "Scale winner",
                    "priority": "high",
                    "confidence": 0.8,
                    "expectedImpact": {"summary": "Higher ROAS"},
                    "reasoning": "Strong trend",
                    "actionsDraft": ["Increase budget by 10%"],
                    "status": "pending",
                }
            ],
            "meta": {"guardrailBlocked": False, "campaignsAnalyzed": 4},
        }
        mock_engine_cls.return_value = engine

        req = FakeRequest("POST", "/api/recommendations/generate", {"accountId": "acc-1"})
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(parsed["generated"], 1)
        self.assertEqual(len(parsed["recommendationIds"]), 1)
        self.assertEqual(len(db.recommendations.docs), 1)
        self.assertEqual(db.recommendations.docs[0].set_payload["type"], "budget_optimization")

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.log_event")
    @patch("api.recommendations.get_db")
    def test_approve_recommendation_flow(self, mock_get_db, _mock_log, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        self.assertTrue(existing_doc.get().exists)

        req = FakeRequest(
            "POST",
            "/api/recommendations/rec-1/approve",
            {"accountId": "acc-1", "reason": "Looks good"},
        )
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertTrue(parsed["success"])
        self.assertEqual(existing_doc.updated_with["status"], "approved")
        self.assertEqual(existing_doc.updated_with["review"]["reason"], "Looks good")

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.log_event")
    @patch("api.recommendations.execute_recommendation")
    @patch("api.recommendations.get_db")
    def test_execute_recommendation_flow(self, mock_get_db, mock_execute, _mock_log, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        mock_execute.return_value = {
            "action": "adjust_budget",
            "targetLevel": "campaign",
            "targetId": "cmp-1",
            "newBudget": 1100,
        }

        req = FakeRequest("POST", "/api/recommendations/rec-1/execute", {"accountId": "acc-1"})
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertTrue(parsed["success"])
        self.assertEqual(existing_doc.updated_with["status"], "executed")
        execution_logs = existing_doc.subcollections["executions"].docs
        self.assertGreaterEqual(len(execution_logs), 1)
        self.assertEqual(execution_logs[0].updated_with["status"], "executed")

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.log_event")
    @patch("api.recommendations.execute_recommendation")
    @patch("api.recommendations.get_db")
    def test_execute_recommendation_blocks_on_none_action(self, mock_get_db, mock_execute, _mock_log, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        existing_doc.data["executionPlan"] = {"action": "none"}

        req = FakeRequest("POST", "/api/recommendations/rec-1/execute", {"accountId": "acc-1"})
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 400)
        self.assertIn("not executable", parsed["error"])
        mock_execute.assert_not_called()

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.get_db")
    def test_list_execution_history(self, mock_get_db, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        log_doc = existing_doc.collection("executions").document()
        log_doc.set({"status": "executed", "requestedAt": datetime.now(timezone.utc)})

        req = FakeRequest(
            "GET",
            "/api/recommendations/rec-1/executions",
            args={"accountId": "acc-1", "limit": "10"},
        )
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(parsed["count"], 1)
        self.assertEqual(parsed["executions"][0]["status"], "executed")

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.log_event")
    @patch("api.recommendations.rollback_recommendation")
    @patch("api.recommendations.get_db")
    def test_rollback_recommendation_flow(self, mock_get_db, mock_rollback, _mock_log, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        existing_doc.data["status"] = "executed"
        existing_doc.data["execution"] = {
            "result": {
                "action": "adjust_budget",
                "targetLevel": "campaign",
                "targetId": "cmp-1",
                "oldBudget": 1000,
                "newBudget": 1100,
            }
        }
        mock_rollback.return_value = {
            "action": "rollback_budget",
            "targetLevel": "campaign",
            "targetId": "cmp-1",
            "restoredBudget": 1000,
        }

        req = FakeRequest("POST", "/api/recommendations/rec-1/rollback", {"accountId": "acc-1"})
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)

        self.assertEqual(status, 200)
        self.assertTrue(parsed["success"])
        self.assertEqual(existing_doc.updated_with["status"], "approved")

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.rollback_preview")
    @patch("api.recommendations.get_db")
    def test_rollback_preview_flow(self, mock_get_db, mock_preview, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        existing_doc.data["status"] = "executed"
        mock_preview.return_value = {
            "canRollback": True,
            "action": "rollback_budget",
            "currentBudget": 1100,
            "restoredBudget": 1000,
        }

        req = FakeRequest(
            "GET",
            "/api/recommendations/rec-1/rollback-preview",
            args={"accountId": "acc-1"},
        )
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(parsed["preview"]["canRollback"])

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.execute_preview")
    @patch("api.recommendations.get_db")
    def test_execute_preview_flow(self, mock_get_db, mock_preview, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db
        existing_doc = db.recommendations.document("rec-1")
        existing_doc.data["status"] = "approved"
        mock_preview.return_value = {
            "canExecute": True,
            "action": "adjust_budget",
            "currentBudget": 1000,
            "newBudget": 1100,
        }

        req = FakeRequest(
            "GET",
            "/api/recommendations/rec-1/execute-preview",
            args={"accountId": "acc-1"},
        )
        body, status, _ = handle_recommendations(req)
        parsed = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(parsed["preview"]["canExecute"])

    @patch("api.recommendations.verify_auth", return_value="user-1")
    @patch("api.recommendations.get_db")
    def test_policy_get_and_save_flow(self, mock_get_db, _mock_auth):
        db = FakeDB()
        mock_get_db.return_value = db

        save_req = FakeRequest(
            "POST",
            "/api/recommendations/policy/acc-1",
            payload={
                "allowExecute": True,
                "allowRollback": False,
                "minConfidenceToExecute": 0.8,
                "maxBudgetDeltaPct": 20,
            },
        )
        save_body, save_status, _ = handle_recommendations(save_req)
        save_parsed = json.loads(save_body)
        self.assertEqual(save_status, 200)
        self.assertTrue(save_parsed["success"])
        self.assertEqual(save_parsed["policy"]["allowRollback"], False)

        get_req = FakeRequest("GET", "/api/recommendations/policy/acc-1")
        get_body, get_status, _ = handle_recommendations(get_req)
        get_parsed = json.loads(get_body)
        self.assertEqual(get_status, 200)
        self.assertEqual(get_parsed["policy"]["minConfidenceToExecute"], 0.8)


if __name__ == "__main__":
    unittest.main()
