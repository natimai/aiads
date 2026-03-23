"""Shared evaluation level resolver for Meta Ads analysis."""
from __future__ import annotations

from typing import Any


def resolve_evaluation_level(campaigns: list[dict[str, Any]]) -> str:
    """Determine the correct analysis level based on campaign configuration.

    Returns ``"campaign"`` when any campaign uses CBO / Advantage+ Campaign Budget,
    otherwise returns ``"adset"``.

    Evaluation level rules (from Meta Ads Analysis Skill):
    - Advantage+ Campaign Budget (CBO) → campaign level
    - Automatic placements without CBO → ad set level
    - Multiple ads within a single ad set → ad set level
    """
    for campaign in campaigns:
        if not isinstance(campaign, dict):
            continue
        if campaign.get("isCampaignBudgetOptimized"):
            return "campaign"
        budget_opt = str(campaign.get("budgetOptimization") or "").lower()
        if budget_opt in {"cbo", "advantage+"}:
            return "campaign"
        buying_type = str(campaign.get("buyingType") or "").upper()
        if buying_type == "ADVANTAGE_PLUS":
            return "campaign"
    return "adset"
