"""Evening Guard: budget pacing, bleeding ad detection, day-end safety (runs daily at 18:00)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from services.recommendation_engine import RecommendationEngine
from utils.firestore_helpers import get_all_active_users, get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)

BATCH_TYPE = "EVENING_CHECK"
MAX_TASKS = 6
DEDUP_WINDOW_HOURS = 16


def run_evening_guard() -> None:
    """Generate day-end safety tasks for each managed account.

    Analyzes today's performance so far. Focuses on:
    - Bleeding ads: today's CPA > 2x target → PAUSE immediately
    - Budget under-pace: <50% of daily budget spent by 18:00 → increase bid
    - Budget over-spend: projected to exceed daily budget → reduce bid
    - Anomalies: CPM spike >50%, sudden CTR drop >40%
    """
    db = get_db()
    engine = RecommendationEngine(db)
    users = get_all_active_users(db, managed_only=True)
    now = datetime.now(timezone.utc)

    # Evening focus: today's data only
    date_today = now.strftime("%Y-%m-%d")

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

                if _already_ran_today(rec_ref, BATCH_TYPE):
                    logger.info("Evening guard already ran for account %s", account_id)
                    continue

                output = engine.generate(
                    user_id,
                    account_id,
                    date_today,
                    date_today,
                    max_items=MAX_TASKS,
                    batch_type=BATCH_TYPE,
                )
                recommendations = output.get("recommendations", [])
                if output.get("meta", {}).get("guardrailBlocked"):
                    logger.info(
                        "Evening guard guardrail blocked for account %s: %s",
                        account_id,
                        output.get("meta", {}).get("reason"),
                    )
                    continue

                created = 0
                for rec in recommendations:
                    if _is_duplicate(rec_ref, rec):
                        continue
                    rec_ref.document().set(rec)
                    created += 1

                log_event(
                    "evening_guard_tasks_generated",
                    user_id=user_id,
                    account_id=account_id,
                    generated=created,
                    batch_type=BATCH_TYPE,
                )
                logger.info(
                    "Evening guard: %d tasks created for account %s",
                    created,
                    account_id,
                )
            except Exception as exc:
                logger.error(
                    "Evening guard failed for account %s: %s",
                    account_id,
                    exc,
                    exc_info=True,
                )


def _already_ran_today(rec_ref, batch_type: str) -> bool:
    """Return True if we already generated tasks with this batch_type today."""
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    docs = (
        rec_ref.where(filter=FieldFilter("batchType", "==", batch_type))
        .where(filter=FieldFilter("createdAt", ">=", today_start))
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)


def _is_duplicate(rec_ref, candidate: dict) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=DEDUP_WINDOW_HOURS)
    docs = (
        rec_ref.where(filter=FieldFilter("type", "==", candidate.get("type")))
        .where(filter=FieldFilter("entityId", "==", candidate.get("entityId")))
        .where(filter=FieldFilter("createdAt", ">=", since))
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)
