"""Morning Strategist: growth, creative refresh, and A/B testing (runs daily at 07:00 AM)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from services.nano_banana import NanaBananaArtDirector
from services.recommendation_engine import RecommendationEngine
from utils.firestore_helpers import get_all_active_users, get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)

BATCH_TYPE = "MORNING_BRIEF"
MAX_TASKS = 8
DEDUP_WINDOW_HOURS = 20

# Only CREATIVE_REFRESH tasks trigger Nano Banana image generation
CREATIVE_REFRESH_TYPES = {"creative_optimization", "creative_copy"}
IMAGE_FORMAT_DEFAULT = "SQUARE"  # 1:1 Feed format


def run_morning_strategist() -> None:
    """Generate growth & creative tasks for each managed account.

    Analyzes yesterday's full data + 7-day trends. Focuses on:
    - Scale winners (ROAS above target for 3+ days → +20% budget)
    - Creative fatigue (Frequency > 2.5, CTR < 0.8% → CREATIVE_REFRESH)
    - Audience saturation → propose A/B test with fresh segments
    """
    db = get_db()
    engine = RecommendationEngine(db)
    art_director = NanaBananaArtDirector()
    users = get_all_active_users(db, managed_only=True)
    now = datetime.now(timezone.utc)

    # Morning focus: yesterday's full data + 7-day trend window
    date_to = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")

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
                    logger.info("Morning brief already generated for account %s", account_id)
                    continue

                output = engine.generate(
                    user_id,
                    account_id,
                    date_from,
                    date_to,
                    max_items=MAX_TASKS,
                    batch_type=BATCH_TYPE,
                )
                recommendations = output.get("recommendations", [])
                if output.get("meta", {}).get("guardrailBlocked"):
                    logger.info(
                        "Morning strategist guardrail blocked for account %s: %s",
                        account_id,
                        output.get("meta", {}).get("reason"),
                    )
                    continue

                created = 0
                images_generated = 0
                for rec in recommendations:
                    if _is_duplicate(rec_ref, rec):
                        continue

                    # ── Nano Banana: enrich CREATIVE_REFRESH tasks with images ──
                    if rec.get("type") in CREATIVE_REFRESH_TYPES:
                        image_urls = art_director.generate_for_task(
                            rec,
                            account_id=account_id,
                            ad_format=IMAGE_FORMAT_DEFAULT,
                        )
                        if image_urls:
                            rec["nanoBananaImages"] = image_urls
                            rec["nanoBananaGeneratedAt"] = now.isoformat()
                            images_generated += len(image_urls)
                            logger.info(
                                "Nano Banana: %d images added to CREATIVE_REFRESH task "
                                "for entity '%s' (account %s)",
                                len(image_urls),
                                rec.get("entityId", "?"),
                                account_id,
                            )

                    rec_ref.document().set(rec)
                    created += 1

                log_event(
                    "morning_strategist_tasks_generated",
                    user_id=user_id,
                    account_id=account_id,
                    generated=created,
                    images_generated=images_generated,
                    batch_type=BATCH_TYPE,
                )
                logger.info(
                    "Morning brief: %d tasks created (%d creative images) for account %s",
                    created,
                    images_generated,
                    account_id,
                )
            except Exception as exc:
                logger.error(
                    "Morning strategist failed for account %s: %s",
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
