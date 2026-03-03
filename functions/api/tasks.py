"""API endpoint for the Task Inbox — aggregates pending tasks across all managed accounts."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

try:
    from google.cloud.firestore_v1.base_query import FieldFilter
except Exception:  # pragma: no cover - local/unit-test fallback
    class FieldFilter:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

from api.accounts import _cors_response, verify_auth
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
TYPE_MAP = {
    "MONITOR_LAUNCH": "monitor_launch",
    "GHOST_DRAFT": "ghost_draft",
}


def handle_tasks(request):
    """Route handler for /api/tasks."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/tasks" and request.method == "GET":
            return _get_tasks(request, user_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error("Tasks API error: %s", e, exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_tasks(request, user_id: str):
    """GET /api/tasks — returns all pending tasks across managed accounts."""
    status_filter = request.args.get("status", "pending").lower()
    limit = min(int(request.args.get("limit", "100")), 200)

    db = get_db()
    accounts_ref = (
        db.collection("users").document(user_id).collection("metaAccounts")
    )
    managed_accounts = (
        accounts_ref.where(filter=FieldFilter("isActive", "==", True))
        .where(filter=FieldFilter("isManagedByPlatform", "==", True))
        .stream()
    )

    all_tasks: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for account_doc in managed_accounts:
        account_data = account_doc.to_dict() or {}
        rec_ref = accounts_ref.document(account_doc.id).collection("recommendations")
        query = rec_ref.order_by("createdAt", direction="DESCENDING").limit(limit)
        for rec_doc in query.stream():
            key = (account_doc.id, rec_doc.id)
            if key in seen:
                continue
            task = _normalize_task(
                {
                    "id": rec_doc.id,
                    "accountId": account_doc.id,
                    "accountName": account_data.get("accountName", ""),
                    **_serialize_doc(rec_doc.to_dict() or {}),
                }
            )
            if status_filter != "all" and task.get("status") != status_filter:
                continue
            all_tasks.append(task)
            seen.add(key)

        tasks_ref = accounts_ref.document(account_doc.id).collection("tasks")
        task_query = tasks_ref.order_by("createdAt", direction="DESCENDING").limit(limit)
        for task_doc in task_query.stream():
            key = (account_doc.id, task_doc.id)
            if key in seen:
                continue
            task = _normalize_task(
                {
                    "id": task_doc.id,
                    "accountId": account_doc.id,
                    "accountName": account_data.get("accountName", ""),
                    **_serialize_doc(task_doc.to_dict() or {}),
                }
            )
            if status_filter != "all" and task.get("status") != status_filter:
                continue
            all_tasks.append(task)
            seen.add(key)

    # Sort: priority first, then most recent
    all_tasks.sort(
        key=lambda t: (
            PRIORITY_RANK.get(t.get("priority", "medium"), 1),
            -(t.get("_created_ts") or 0),
        )
    )
    # Remove the internal sort key
    for t in all_tasks:
        t.pop("_created_ts", None)

    morning = [t for t in all_tasks if t.get("batchType") == "MORNING_BRIEF"]
    evening = [t for t in all_tasks if t.get("batchType") == "EVENING_CHECK"]
    other = [
        t
        for t in all_tasks
        if t.get("batchType") not in ("MORNING_BRIEF", "EVENING_CHECK")
    ]

    now_hour = datetime.now(timezone.utc).hour
    if now_hour < 12:
        greeting = "Good Morning"
    elif now_hour < 18:
        greeting = "Good Afternoon"
    else:
        greeting = "Good Evening"

    payload = {
        "greeting": greeting,
        "total": len(all_tasks),
        "tasks": all_tasks[:limit],
        "groups": {
            "morning": morning,
            "evening": evening,
            "other": other,
        },
    }
    return _cors_response(json.dumps(payload, default=str), 200)


def _normalize_task(task: dict) -> dict:
    normalized = dict(task)

    raw_type = str(normalized.get("type") or "").strip()
    mapped_type = TYPE_MAP.get(raw_type.upper(), raw_type.lower())
    normalized["type"] = mapped_type or "campaign_build"

    raw_priority = str(normalized.get("priority") or "").strip().lower()
    normalized["priority"] = raw_priority if raw_priority in PRIORITY_RANK else "medium"

    raw_status = str(normalized.get("status") or "").strip().lower()
    if not raw_status:
        raw_status = "pending"
    normalized["status"] = raw_status

    if not normalized.get("uiDisplayText") and normalized.get("ui_display_text"):
        normalized["uiDisplayText"] = normalized.get("ui_display_text")

    if not normalized.get("entityLevel"):
        normalized["entityLevel"] = "campaign" if normalized.get("entityId") else "account"
    if not normalized.get("entityId"):
        metadata = normalized.get("metadata", {}) if isinstance(normalized.get("metadata"), dict) else {}
        normalized["entityId"] = str(metadata.get("campaignId") or normalized.get("accountId") or "")

    if not isinstance(normalized.get("expectedImpact"), dict):
        normalized["expectedImpact"] = {
            "summary": str(normalized.get("reasoning") or ""),
        }
    if not isinstance(normalized.get("actionsDraft"), list):
        normalized["actionsDraft"] = []
    if not isinstance(normalized.get("metricsSnapshot"), dict):
        normalized["metricsSnapshot"] = {}
    if not isinstance(normalized.get("executionPlan"), dict):
        normalized["executionPlan"] = {"action": "none", "targetLevel": "account", "targetId": normalized.get("accountId", "")}
    if not isinstance(normalized.get("review"), dict):
        normalized["review"] = {}
    if normalized.get("confidence") is None:
        normalized["confidence"] = 0.8
    if not normalized.get("title"):
        normalized["title"] = "Action required"
    if not normalized.get("reasoning"):
        normalized["reasoning"] = str(normalized.get("why") or normalized.get("uiDisplayText") or "")
    if not normalized.get("why"):
        normalized["why"] = normalized["reasoning"]
    if not normalized.get("batchType"):
        if normalized["type"] == "ghost_draft":
            normalized["batchType"] = "PROACTIVE_DRAFT"
        elif normalized["type"] == "monitor_launch":
            normalized["batchType"] = "LAUNCH_WATCH"
    return normalized


def _serialize_doc(data: dict) -> dict:
    """Convert Firestore timestamps to ISO strings and add sort key."""
    result: dict = {}
    created_ts: float = 0.0
    for key, value in data.items():
        if hasattr(value, "isoformat"):
            result[key] = value.isoformat()
            if key == "createdAt":
                try:
                    created_ts = value.timestamp()
                except Exception:
                    pass
        elif hasattr(value, "seconds"):
            # Firestore Timestamp object
            from datetime import timezone as tz
            dt = datetime.fromtimestamp(value.seconds + value.nanos / 1e9, tz=timezone.utc)
            result[key] = dt.isoformat()
            if key == "createdAt":
                created_ts = dt.timestamp()
        else:
            result[key] = value
    result["_created_ts"] = created_ts
    return result
