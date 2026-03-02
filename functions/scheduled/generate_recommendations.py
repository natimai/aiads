"""Scheduled recommendation generation job."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from services.recommendation_engine import RecommendationEngine
from utils.firestore_helpers import get_all_active_users, get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)


def run_generate_recommendations() -> None:
    """Generate recommendations for active accounts with freshness and quota guards."""
    db = get_db()
    engine = RecommendationEngine(db)
    users = get_all_active_users(db, managed_only=True)
    now = datetime.now(timezone.utc)
    date_to = now.strftime("%Y-%m-%d")
    date_from = (now - timedelta(days=6)).strftime("%Y-%m-%d")

    for user in users:
        user_id = user["id"]
        for account in user.get("accounts", []):
            account_id = account["id"]
            try:
                rec_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                    .collection("recommendations")
                )
                if _is_fresh(rec_ref):
                    continue
                if _reached_daily_quota(rec_ref):
                    logger.info("Recommendation quota reached for account %s", account_id)
                    continue

                output = engine.generate(user_id, account_id, date_from, date_to, max_items=10)
                recommendations = output.get("recommendations", [])
                if output.get("meta", {}).get("guardrailBlocked"):
                    continue

                created = 0
                for rec in recommendations:
                    if _is_duplicate(rec_ref, rec):
                        continue
                    rec_ref.document().set(rec)
                    created += 1

                log_event(
                    "scheduled_recommendations_generated",
                    user_id=user_id,
                    account_id=account_id,
                    generated=created,
                )
            except Exception as exc:
                logger.error("Failed scheduled recommendations for account %s: %s", account_id, exc, exc_info=True)


def _is_fresh(rec_ref) -> bool:
    docs = rec_ref.order_by("createdAt", direction="DESCENDING").limit(1).stream()
    latest = next(docs, None)
    if not latest:
        return False
    created = (latest.to_dict() or {}).get("createdAt")
    if not created or not hasattr(created, "tzinfo"):
        return False
    return datetime.now(timezone.utc) - created < timedelta(hours=2)


def _reached_daily_quota(rec_ref, max_per_day: int = 20) -> bool:
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    docs = rec_ref.where(filter=FieldFilter("createdAt", ">=", since)).stream()
    count = sum(1 for _ in docs)
    return count >= max_per_day


def _is_duplicate(rec_ref, candidate: dict) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=8)
    docs = (
        rec_ref.where(filter=FieldFilter("type", "==", candidate.get("type")))
        .where(filter=FieldFilter("entityId", "==", candidate.get("entityId")))
        .where(filter=FieldFilter("createdAt", ">=", since))
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)
