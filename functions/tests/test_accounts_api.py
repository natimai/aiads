import json
import unittest
from unittest.mock import MagicMock, patch

from api.accounts import handle_accounts


class FakeRequest:
    def __init__(self, method: str, path: str, payload=None, args=None):
        self.method = method
        self.path = path
        self._payload = payload or {}
        self.args = args or {}
        self.headers = {"Authorization": "Bearer token"}

    def get_json(self, silent=True):
        return self._payload


def _mock_db_for_account_doc(account_id: str, account_payload: dict):
    db = MagicMock()
    users_collection = MagicMock()
    user_doc = MagicMock()
    meta_accounts_collection = MagicMock()
    account_doc_ref = MagicMock()
    account_doc = MagicMock()
    account_doc.exists = True
    account_doc.to_dict.return_value = account_payload
    account_doc_ref.get.return_value = account_doc

    db.collection.return_value = users_collection
    users_collection.document.return_value = user_doc
    user_doc.collection.return_value = meta_accounts_collection
    meta_accounts_collection.document.side_effect = lambda doc_id: account_doc_ref if doc_id == account_id else MagicMock()
    return db, account_doc_ref


class AccountsApiTest(unittest.TestCase):
    @patch("api.accounts.verify_auth", return_value="user-1")
    @patch("api.accounts.get_db")
    def test_get_accounts_includes_page_access_status(self, mock_get_db, _mock_auth):
        db = MagicMock()
        accounts_ref = MagicMock()
        users_collection = MagicMock()
        user_doc = MagicMock()
        doc = MagicMock()
        doc.id = "acc-1"
        doc.to_dict.return_value = {
            "accountName": "Account A",
            "currency": "USD",
            "isActive": True,
            "isManagedByPlatform": True,
            "pageAccessStatus": "ok",
            "defaultPageId": "pg-1",
            "defaultPageName": "Main Page",
        }
        accounts_ref.stream.return_value = [doc]
        db.collection.return_value = users_collection
        users_collection.document.return_value = user_doc
        user_doc.collection.return_value = accounts_ref
        mock_get_db.return_value = db

        req = FakeRequest("GET", "/api/accounts")
        body, status, _ = handle_accounts(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["accounts"][0]["pageAccessStatus"], "ok")
        self.assertEqual(payload["accounts"][0]["defaultPageId"], "pg-1")

    @patch("api.accounts.verify_auth", return_value="user-1")
    @patch("api.accounts.get_db")
    @patch("services.meta_auth.fetch_pages_with_status")
    @patch("services.meta_auth.get_decrypted_token")
    def test_get_account_pages_endpoint(
        self,
        mock_get_token,
        mock_fetch_pages_with_status,
        mock_get_db,
        _mock_auth,
    ):
        db, account_doc_ref = _mock_db_for_account_doc("acc-1", {"defaultPageId": ""})
        mock_get_db.return_value = db
        mock_get_token.return_value = ("token-1", None)
        mock_fetch_pages_with_status.return_value = (
            [{"pageId": "pg-123", "pageName": "Main"}],
            "ok",
        )

        req = FakeRequest("GET", "/api/accounts/acc-1/pages")
        body, status, _ = handle_accounts(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["pageAccessStatus"], "ok")
        self.assertEqual(payload["pages"][0]["pageId"], "pg-123")
        account_doc_ref.set.assert_called()

    @patch("api.accounts.verify_auth", return_value="user-1")
    @patch("api.accounts.get_db")
    def test_set_default_page_endpoint(self, mock_get_db, _mock_auth):
        db, account_doc_ref = _mock_db_for_account_doc("acc-1", {"defaultPageId": ""})
        mock_get_db.return_value = db

        req = FakeRequest(
            "POST",
            "/api/accounts/acc-1/defaults/page",
            payload={"pageId": "pg-777", "pageName": "My Page"},
        )
        body, status, _ = handle_accounts(req)
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])
        saved = account_doc_ref.set.call_args.args[0]
        self.assertEqual(saved["defaultPageId"], "pg-777")
        self.assertEqual(saved["defaultPageName"], "My Page")


if __name__ == "__main__":
    unittest.main()
