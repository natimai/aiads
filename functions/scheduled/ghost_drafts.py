"""Daily proactive ghost draft generation."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from services.campaign_builder_service import CampaignBuilderService
from utils.firestore_helpers import get_all_active_users, get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)

MAX_PER_DAY_PER_ACCOUNT = 1
THEME_DEDUP_HOURS = 72


def run_ghost_drafts() -> None:
    db = get_db()
    builder = CampaignBuilderService(db)
    users = get_all_active_users(db, managed_only=True)
    now = datetime.now(timezone.utc)

    for user in users:
        user_id = user["id"]
        for account in user.get("accounts", []):
            account_id = account["id"]
            try:
                if _has_recent_ghost_draft(db, user_id, account_id, hours=24, max_allowed=MAX_PER_DAY_PER_ACCOUNT):
                    continue

                theme = _pick_opportunity_theme(account)
                if not theme:
                    continue

                if _has_recent_theme(db, user_id, account_id, theme, hours=THEME_DEDUP_HOURS):
                    continue

                draft_id, recommendation_id = builder.create_ghost_draft_for_theme(
                    user_id=user_id,
                    account_id=account_id,
                    opportunity_theme=theme,
                )

                log_event(
                    "ghost_draft_created",
                    user_id=user_id,
                    account_id=account_id,
                    draft_id=draft_id,
                    recommendation_id=recommendation_id,
                    theme=theme,
                    created_at=now.isoformat(),
                )
                logger.info(
                    "Ghost draft created for account %s (draft=%s, theme=%s)",
                    account_id,
                    draft_id,
                    theme,
                )
            except Exception as exc:
                logger.error(
                    "Ghost draft generation failed for account %s: %s",
                    account_id,
                    exc,
                    exc_info=True,
                )


def _pick_opportunity_theme(account_payload: dict) -> str:
    """Simple deterministic heuristics for MVP ghost opportunities."""
    now = datetime.now(timezone.utc)
    weekday = now.weekday()  # Monday=0
    kpi = account_payload.get("kpiSummary", {}) if isinstance(account_payload.get("kpiSummary"), dict) else {}

    roas = float(kpi.get("roas", 0) or 0)
    cpi = float(kpi.get("avgCPI", 0) or 0)

    if weekday in (3, 4):
        return "Flash Sale לסופ\"ש"
    if cpi > 0 and cpi <= 2.0:
        return "Scale While CPA Is Low"
    if roas >= 2.2:
        return "Winner Expansion Campaign"
    if float(kpi.get("avgCTR", 0) or 0) < 0.8:
        return "Creative Refresh Push"
    return "Seasonal Opportunity Boost"


def _has_recent_ghost_draft(db, user_id: str, account_id: str, *, hours: int, max_allowed: int) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    drafts_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaignDrafts")
    )
    docs = (
        drafts_ref.where("origin", "==", "ghost")
        .where("createdAt", ">=", since)
        .limit(max_allowed)
        .stream()
    )
    return sum(1 for _ in docs) >= max_allowed


def _has_recent_theme(db, user_id: str, account_id: str, theme: str, *, hours: int) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    drafts_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaignDrafts")
    )
    docs = (
        drafts_ref.where("origin", "==", "ghost")
        .where("opportunityTheme", "==", theme)
        .where("createdAt", ">=", since)
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)
