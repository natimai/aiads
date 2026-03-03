"""Morning Strategist: growth, creative refresh, and A/B testing (runs daily at 07:00 AM)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

try:
    from google.cloud.firestore_v1.base_query import FieldFilter
except Exception:  # pragma: no cover - local/unit-test fallback when firestore extras are missing
    class FieldFilter:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

from services.campaign_builder_service import CampaignBuilderService
from services.nano_banana import NanaBananaArtDirector
from services.recommendation_engine import RecommendationEngine
from utils.firestore_helpers import get_all_active_users, get_db
from utils.observability import log_event

logger = logging.getLogger(__name__)

BATCH_TYPE = "MORNING_BRIEF"
MAX_TASKS = 8
DEDUP_WINDOW_HOURS = 20
PROACTIVE_DEDUP_HOURS = 24
PROACTIVE_MIN_FREQ = 1.8
PROACTIVE_FREQ_GROWTH = 1.15
PROACTIVE_THEME = "Broad Audience + Nano Banana creatives"

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
    builder = CampaignBuilderService(db)
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

                should_create_draft, draft_signal = _should_create_proactive_draft(
                    db, user_id, account_id, account
                )
                if should_create_draft and not _has_recent_proactive_draft(rec_ref):
                    draft_id, recommendation_id = builder.create_ghost_draft_for_theme(
                        user_id=user_id,
                        account_id=account_id,
                        opportunity_theme=PROACTIVE_THEME,
                    )
                    created += 1
                    log_event(
                        "morning_strategist_proactive_draft_created",
                        user_id=user_id,
                        account_id=account_id,
                        draft_id=draft_id,
                        recommendation_id=recommendation_id,
                        frequency_baseline=draft_signal.get("frequencyBaseline"),
                        frequency_current=draft_signal.get("frequencyCurrent"),
                    )

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


def _should_create_proactive_draft(
    db,
    user_id: str,
    account_id: str,
    account_payload: dict,
) -> tuple[bool, dict[str, float]]:
    performance_strong = _is_performance_strong(account_payload)
    frequency_baseline, frequency_current = _frequency_trend(db, user_id, account_id)
    fatigue_rising = bool(
        frequency_baseline > 0
        and frequency_current >= PROACTIVE_MIN_FREQ
        and frequency_current >= (frequency_baseline * PROACTIVE_FREQ_GROWTH)
    )
    return performance_strong and fatigue_rising, {
        "frequencyBaseline": round(frequency_baseline, 4),
        "frequencyCurrent": round(frequency_current, 4),
    }


def _is_performance_strong(account_payload: dict) -> bool:
    kpi = account_payload.get("kpiSummary", {}) if isinstance(account_payload.get("kpiSummary"), dict) else {}
    roas = float(kpi.get("roas", 0) or 0)
    cpa = float(
        kpi.get("avgCostPerLead")
        or kpi.get("avgCPA")
        or kpi.get("avgCPI")
        or 0
    )

    targets = _extract_kpi_targets(account_payload)
    target_roas = float(targets.get("targetRoas", 0) or 0)
    target_cpa = float(targets.get("targetCpa", 0) or 0)

    strong_roas = bool(target_roas > 0 and roas >= (target_roas * 1.1))
    strong_cpa = bool(target_cpa > 0 and cpa > 0 and cpa <= (target_cpa * 0.9))

    if target_roas > 0 or target_cpa > 0:
        return strong_roas or strong_cpa
    return roas >= 2.2


def _extract_kpi_targets(account_payload: dict) -> dict:
    raw_targets = account_payload.get("kpiTargets")
    if not isinstance(raw_targets, dict):
        raw_targets = account_payload.get("kpi_targets")
    if not isinstance(raw_targets, dict):
        raw_targets = {}

    return {
        "targetRoas": float(
            raw_targets.get("targetRoas")
            or raw_targets.get("target_roas")
            or raw_targets.get("roas")
            or 0
        ),
        "targetCpa": float(
            raw_targets.get("targetCpa")
            or raw_targets.get("target_cpa")
            or raw_targets.get("cpa")
            or 0
        ),
    }


def _frequency_trend(db, user_id: str, account_id: str) -> tuple[float, float]:
    campaigns_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaigns")
    )
    baseline_values: list[float] = []
    current_values: list[float] = []

    for campaign_doc in campaigns_ref.stream():
        try:
            rows: list[tuple[str, float]] = []
            docs = (
                campaign_doc.reference.collection("insights")
                .order_by("date", direction="DESCENDING")
                .limit(7)
                .stream()
            )
            for row_doc in docs:
                row = row_doc.to_dict() or {}
                freq = float(row.get("frequency", 0) or 0)
                date = str(row.get("date") or row_doc.id or "")
                if freq > 0:
                    rows.append((date, freq))

            if len(rows) < 4:
                continue

            rows.sort(key=lambda x: x[0])
            split = max(2, len(rows) // 2)
            early = [f for _, f in rows[:split]]
            late = [f for _, f in rows[split:]]
            if not late:
                continue
            baseline_values.append(sum(early) / len(early))
            current_values.append(sum(late) / len(late))
        except Exception:
            continue

    if not baseline_values or not current_values:
        return 0.0, 0.0
    return (sum(baseline_values) / len(baseline_values), sum(current_values) / len(current_values))


def _has_recent_proactive_draft(rec_ref) -> bool:
    since = datetime.now(timezone.utc) - timedelta(hours=PROACTIVE_DEDUP_HOURS)
    docs = (
        rec_ref.where(filter=FieldFilter("batchType", "in", ["PROACTIVE_DRAFT", "GHOST_DRAFT"]))
        .where(filter=FieldFilter("createdAt", ">=", since))
        .limit(1)
        .stream()
    )
    return any(True for _ in docs)
