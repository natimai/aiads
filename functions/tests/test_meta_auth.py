import os
import unittest
from unittest.mock import MagicMock, patch
from cryptography.fernet import Fernet, InvalidToken

from services.meta_auth import decrypt_token, fetch_pages_with_status, get_decrypted_token, get_oauth_url


class MetaAuthTest(unittest.TestCase):
    def test_get_oauth_url_includes_pages_scopes(self):
        with patch.dict(os.environ, {"META_APP_ID": "app-123"}, clear=False):
            url = get_oauth_url("https://example.com/callback", "state-1")

        self.assertIn("ads_management", url)
        self.assertIn("ads_read", url)
        self.assertIn("business_management", url)
        self.assertIn("pages_show_list", url)
        self.assertIn("pages_read_engagement", url)

    @patch("services.meta_auth.requests.get")
    def test_fetch_pages_with_status_missing_permissions(self, mock_get):
        response = MagicMock()
        response.status_code = 400
        response.json.return_value = {
            "error": {
                "code": 10,
                "message": "Missing permissions pages_show_list",
            }
        }
        mock_get.return_value = response

        pages, status = fetch_pages_with_status("token-1")
        self.assertEqual(pages, [])
        self.assertEqual(status, "missing_permissions")

    @patch("services.meta_auth.requests.get")
    def test_fetch_pages_with_status_no_pages(self, mock_get):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"data": []}
        mock_get.return_value = response

        pages, status = fetch_pages_with_status("token-1")
        self.assertEqual(pages, [])
        self.assertEqual(status, "no_pages")

    @patch("services.meta_auth.requests.get")
    def test_fetch_pages_with_status_ok(self, mock_get):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "data": [{"id": "pg-1", "name": "Main Page"}]
        }
        mock_get.return_value = response

        pages, status = fetch_pages_with_status("token-1")
        self.assertEqual(status, "ok")
        self.assertEqual(pages[0]["pageId"], "pg-1")

    def test_decrypt_token_uses_fallback_keys(self):
        primary_key = Fernet.generate_key().decode()
        fallback_key = Fernet.generate_key().decode()
        encrypted_with_fallback = Fernet(fallback_key.encode()).encrypt(b"token-abc").decode()

        with patch.dict(
            os.environ,
            {
                "TOKEN_ENCRYPTION_KEY": primary_key,
                "TOKEN_ENCRYPTION_KEY_FALLBACKS": fallback_key,
            },
            clear=False,
        ):
            token, source = decrypt_token(encrypted_with_fallback, return_source=True)

        self.assertEqual(token, "token-abc")
        self.assertEqual(source, "fallback")

    def test_decrypt_token_accepts_plaintext_meta_token(self):
        primary_key = Fernet.generate_key().decode()
        plaintext_token = "EAABwzLixnjYBOlegacytokenvalue123456789"

        with patch.dict(os.environ, {"TOKEN_ENCRYPTION_KEY": primary_key}, clear=False):
            token, source = decrypt_token(plaintext_token, return_source=True)

        self.assertEqual(token, plaintext_token)
        self.assertEqual(source, "plaintext")

    def test_decrypt_token_raises_on_unreadable_payload(self):
        primary_key = Fernet.generate_key().decode()

        with patch.dict(os.environ, {"TOKEN_ENCRYPTION_KEY": primary_key}, clear=False):
            with self.assertRaises(InvalidToken):
                decrypt_token("not-a-valid-token")

    @patch("services.meta_auth.get_db")
    @patch("services.meta_auth.decrypt_token", side_effect=InvalidToken("bad signature"))
    def test_get_decrypted_token_returns_reconnect_error_when_decrypt_fails(self, _mock_decrypt, mock_get_db):
        fake_db = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {"accessToken": "broken-token", "tokenExpiry": None}
        fake_doc_ref = MagicMock()
        fake_doc_ref.get.return_value = fake_doc
        fake_db.collection.return_value.document.return_value.collection.return_value.document.return_value = fake_doc_ref
        mock_get_db.return_value = fake_db

        with self.assertRaises(ValueError) as exc_ctx:
            get_decrypted_token("user-1", "acc-1")
        self.assertIn("Please reconnect this account", str(exc_ctx.exception))


if __name__ == "__main__":
    unittest.main()
