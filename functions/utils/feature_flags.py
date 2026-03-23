"""Feature flags for controlled rollout of new capabilities."""
from __future__ import annotations

import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

FEATURE_FLAGS: dict[str, bool] = {
    "ENABLE_DIAGNOSIS_ENGINE": False,
    "ENABLE_BREAKDOWN_GUARDRAILS": True,  # ON by default (safety)
    "ENABLE_SKILL_PROMPTS": False,
    "ENABLE_FRESHNESS_DISPLAY": False,
    "ENABLE_AI_DIAGNOSIS_UI": False,
    "ENABLE_TREND_COCKPIT": False,
    "ENABLE_EXPLAINABILITY_LOGS": False,
    "ENABLE_ALIGNMENT_CHECK": False,
    "ENABLE_CONTEXTUAL_ALERTS": False,
    "ENABLE_HEALTH_SCORE": False,
    "ENABLE_SPEND_SHIFT_PANEL": False,
    "ENABLE_TEST_PLANNER": False,
    "ENABLE_PREFLIGHT_CHECKS": False,
    "ENABLE_BENCHMARKS": False,
    "ENABLE_APPROVAL_FLOWS": False,
}


def is_enabled(flag_name: str, user_id: str | None = None, account_id: str | None = None) -> bool:
    """Check whether a feature flag is enabled.

    Resolution order:
    1. Environment variable ``FEATURE_FLAG_{NAME}`` (e.g. ``FEATURE_FLAG_ENABLE_DIAGNOSIS_ENGINE``)
    2. Firestore per-user override (``users/{userId}/featureFlags`` doc) — only checked
       when *user_id* is provided **and** the env-var is absent.
    3. Default from ``FEATURE_FLAGS`` dict.
    """
    env_key = f"FEATURE_FLAG_{flag_name}"
    env_val = os.environ.get(env_key)
    if env_val is not None:
        return env_val.lower() in ("1", "true", "yes", "on")

    if user_id:
        try:
            override = _read_firestore_flag(user_id, flag_name)
            if override is not None:
                return bool(override)
        except Exception:
            logger.debug("feature_flags: Firestore lookup failed for %s/%s", user_id, flag_name)

    return FEATURE_FLAGS.get(flag_name, False)


def _read_firestore_flag(user_id: str, flag_name: str) -> bool | None:
    """Read a single flag from the user's featureFlags doc.  Returns *None* when the
    doc or field does not exist so the caller can fall through to defaults."""
    try:
        from utils.firestore_helpers import get_db
        db = get_db()
        doc_ref = db.collection("users").document(user_id).collection("featureFlags").document("flags")
        doc = doc_ref.get()
        if not doc.exists:
            return None
        data: dict[str, Any] = doc.to_dict() or {}
        value = data.get(flag_name)
        if value is None:
            return None
        return bool(value)
    except Exception:
        return None
