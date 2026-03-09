import os
import unittest
from unittest.mock import MagicMock, patch

from services.meta_auth import fetch_pages_with_status, get_oauth_url


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


if __name__ == "__main__":
    unittest.main()
