"""Tests for utils/feature_flags.py."""
import os
import unittest
from unittest.mock import patch

from utils.feature_flags import FEATURE_FLAGS, is_enabled


class TestFeatureFlags(unittest.TestCase):
    def test_default_values(self):
        # ENABLE_BREAKDOWN_GUARDRAILS defaults to True
        with patch.dict(os.environ, {}, clear=False):
            # Remove any env override
            env_key = "FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS"
            with patch.dict(os.environ, {k: v for k, v in os.environ.items() if k != env_key}):
                self.assertTrue(is_enabled("ENABLE_BREAKDOWN_GUARDRAILS"))

    def test_default_disabled(self):
        self.assertFalse(FEATURE_FLAGS.get("ENABLE_DIAGNOSIS_ENGINE"))

    def test_env_var_true(self):
        with patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "true"}):
            self.assertTrue(is_enabled("ENABLE_DIAGNOSIS_ENGINE"))

    def test_env_var_false(self):
        with patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "false"}):
            self.assertFalse(is_enabled("ENABLE_BREAKDOWN_GUARDRAILS"))

    def test_env_var_one(self):
        with patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE": "1"}):
            self.assertTrue(is_enabled("ENABLE_DIAGNOSIS_ENGINE"))

    def test_unknown_flag_returns_false(self):
        self.assertFalse(is_enabled("NONEXISTENT_FLAG"))

    def test_env_var_takes_precedence(self):
        # ENABLE_BREAKDOWN_GUARDRAILS defaults True, but env can override
        with patch.dict(os.environ, {"FEATURE_FLAG_ENABLE_BREAKDOWN_GUARDRAILS": "0"}):
            self.assertFalse(is_enabled("ENABLE_BREAKDOWN_GUARDRAILS"))


if __name__ == "__main__":
    unittest.main()
