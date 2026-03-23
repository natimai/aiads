"""Data freshness computation for account sync timestamps."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def compute_freshness(account_doc: dict[str, Any]) -> dict[str, Any]:
    """Compute a ``FreshnessStatus`` dict from an account document.

    Returns::

        {
            "insightsSyncedAt": str | None,
            "structuresSyncedAt": str | None,
            "breakdownsSyncedAt": str | None,
            "isStale": bool,   # True if insights > 2 hours old or null
            "isWarning": bool, # True if insights > 30 min old or null
        }
    """
    now = datetime.now(timezone.utc)
    insights_ts = _parse_timestamp(account_doc.get("insightsSyncedAt"))
    structures_ts = _parse_timestamp(account_doc.get("structuresSyncedAt"))
    breakdowns_ts = _parse_timestamp(account_doc.get("breakdownsSyncedAt"))

    if insights_ts is None:
        is_stale = True
        is_warning = True
    else:
        age_seconds = (now - insights_ts).total_seconds()
        is_stale = age_seconds > 7200  # 2 hours
        is_warning = age_seconds > 1800  # 30 minutes

    return {
        "insightsSyncedAt": insights_ts.isoformat() if insights_ts else None,
        "structuresSyncedAt": structures_ts.isoformat() if structures_ts else None,
        "breakdownsSyncedAt": breakdowns_ts.isoformat() if breakdowns_ts else None,
        "isStale": is_stale,
        "isWarning": is_warning,
    }


def compute_confidence_downgrade(freshness: dict[str, Any]) -> float:
    """Return a confidence multiplier in [0.5, 1.0] based on freshness.

    The multiplier is applied as: ``final_confidence = base_confidence * multiplier``.

    Rules (based on ``insightsSyncedAt`` age):
    - < 30 min: 1.0  (no downgrade)
    - 30 min – 2 h: 0.9
    - 2 – 6 h: 0.8
    - > 6 h: 0.7
    - null (never synced): 0.5
    """
    raw_ts = freshness.get("insightsSyncedAt")
    if raw_ts is None:
        return 0.5

    ts = _parse_timestamp(raw_ts)
    if ts is None:
        return 0.5

    age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()

    if age_seconds < 1800:
        return 1.0
    if age_seconds < 7200:
        return 0.9
    if age_seconds < 21600:
        return 0.8
    return 0.7


def is_breakdown_data_stale(freshness: dict[str, Any]) -> bool:
    """Return True when breakdown data is stale (>6 hours or null)."""
    raw_ts = freshness.get("breakdownsSyncedAt")
    if raw_ts is None:
        return True
    ts = _parse_timestamp(raw_ts)
    if ts is None:
        return True
    age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
    return age_seconds > 21600  # 6 hours


def _parse_timestamp(value: Any) -> datetime | None:
    """Best-effort parse of a timestamp (ISO string, datetime, or Firestore timestamp)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    # Firestore Timestamp objects have a .isoformat() or can be converted
    if hasattr(value, "isoformat"):
        try:
            return _parse_timestamp(value.isoformat())
        except Exception:
            return None
    return None
