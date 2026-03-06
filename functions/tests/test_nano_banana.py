import os
import unittest
from unittest.mock import patch

from services.nano_banana import NanaBananaArtDirector


class NanoBananaTest(unittest.TestCase):
    @patch.dict(os.environ, {"FIREBASE_STORAGE_BUCKET": "aiads-f0675.firebasestorage.app"}, clear=False)
    def test_resolve_storage_bucket_prefers_explicit_env(self):
        director = NanaBananaArtDirector()
        self.assertEqual(director.storage_bucket, "aiads-f0675.firebasestorage.app")

    @patch.dict(os.environ, {"FIREBASE_STORAGE_BUCKET": "aiads-f0675.appspot.com"}, clear=False)
    def test_candidate_buckets_include_both_domains(self):
        director = NanaBananaArtDirector()
        candidates = director._candidate_buckets()
        self.assertIn("aiads-f0675.appspot.com", candidates)
        self.assertIn("aiads-f0675.firebasestorage.app", candidates)


if __name__ == "__main__":
    unittest.main()
