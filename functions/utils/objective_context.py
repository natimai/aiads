"""Objective-aware context resolution for accounts and campaigns.

Determines the account vertical (LEAD_GEN / ECOMMERCE / APP_INSTALLS) from
account metadata and campaign objectives, and maps each vertical to its
primary metrics.  Mirrors the frontend ``metricsConfig.ts`` logic so that
backend and frontend always agree on the active vertical.
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Mapping — must match frontend OBJECTIVE_TO_VERTICAL exactly
# ---------------------------------------------------------------------------

OBJECTIVE_TO_VERTICAL: list[tuple[str, str]] = [
    ("OUTCOME_LEADS", "LEAD_GEN"),
    ("LEAD", "LEAD_GEN"),
    ("OUTCOME_SALES", "ECOMMERCE"),
    ("SALES", "ECOMMERCE"),
    ("PURCHASE", "ECOMMERCE"),
    ("APP_INSTALL", "APP_INSTALLS"),
    ("INSTALL", "APP_INSTALLS"),
]

VALID_VERTICALS = {"LEAD_GEN", "ECOMMERCE", "APP_INSTALLS"}

PRIMARY_METRICS: dict[str, dict[str, str]] = {
    "LEAD_GEN": {
        "primaryConversion": "leads",
        "primaryCostMetric": "cpl",
        "primaryEfficiencyMetric": "cpl",
        "validationMetric": "cpl_7d_trend",
    },
    "ECOMMERCE": {
        "primaryConversion": "purchases",
        "primaryCostMetric": "cpa",
        "primaryEfficiencyMetric": "roas",
        "validationMetric": "roas_7d",
    },
    "APP_INSTALLS": {
        "primaryConversion": "installs",
        "primaryCostMetric": "cpi",
        "primaryEfficiencyMetric": "cpi",
        "validationMetric": "cpi_7d_trend",
    },
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def resolve_vertical(
    account_data: dict[str, Any],
    campaigns: list[dict[str, Any]],
) -> str:
    """Determine the effective vertical for an account.

    Priority order:
    1. Explicit ``vertical`` field on the account document.
    2. ``primaryObjective`` field on the account document, mapped via
       ``OBJECTIVE_TO_VERTICAL``.
    3. Majority vote from campaign ``objective`` fields.
    4. Fallback: ``"LEAD_GEN"``.
    """
    # 1. Explicit vertical
    explicit = _normalize_vertical(account_data.get("vertical"))
    if explicit:
        return explicit

    # 2. primaryObjective mapping
    from_objective = _objective_to_vertical(str(account_data.get("primaryObjective", "")))
    if from_objective:
        return from_objective

    # 3. Campaign majority vote
    from_campaigns = _majority_vote(campaigns)
    if from_campaigns:
        return from_campaigns

    # 4. Fallback
    return "LEAD_GEN"


def get_primary_metrics(vertical: str) -> dict[str, str]:
    """Return the primary metric mapping for *vertical*."""
    return dict(PRIMARY_METRICS.get(vertical, PRIMARY_METRICS["LEAD_GEN"]))


def get_objective_context(
    account_data: dict[str, Any],
    campaigns: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a full objective context dict.

    Combines the resolved vertical, primary metrics, and a
    ``mixedObjectives`` flag that is ``True`` when campaigns span more than
    one vertical.
    """
    vertical = resolve_vertical(account_data, campaigns)
    metrics = get_primary_metrics(vertical)
    mixed = _detect_mixed(campaigns)

    return {
        "vertical": vertical,
        "mixedObjectives": mixed,
        **metrics,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_vertical(value: Any) -> str | None:
    if not value or not isinstance(value, str):
        return None
    normalized = value.upper().strip()
    return normalized if normalized in VALID_VERTICALS else None


def _objective_to_vertical(objective: str) -> str | None:
    normalized = objective.upper().strip()
    if not normalized:
        return None
    for match_str, vertical in OBJECTIVE_TO_VERTICAL:
        if match_str in normalized:
            return vertical
    return None


def _majority_vote(campaigns: list[dict[str, Any]]) -> str | None:
    votes: dict[str, int] = {"LEAD_GEN": 0, "ECOMMERCE": 0, "APP_INSTALLS": 0}
    for campaign in campaigns:
        if not isinstance(campaign, dict):
            continue
        objective = str(campaign.get("objective", ""))
        vertical = _objective_to_vertical(objective)
        if vertical:
            votes[vertical] += 1

    best = max(votes, key=lambda k: votes[k])
    return best if votes[best] > 0 else None


def _detect_mixed(campaigns: list[dict[str, Any]]) -> bool:
    seen: set[str] = set()
    for campaign in campaigns:
        if not isinstance(campaign, dict):
            continue
        objective = str(campaign.get("objective", ""))
        vertical = _objective_to_vertical(objective)
        if vertical:
            seen.add(vertical)
    return len(seen) > 1
