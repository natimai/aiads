"""API endpoint for the Task Inbox — aggregates pending tasks across all managed accounts."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from api.accounts import _cors_response, verify_auth
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


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
    for account_doc in managed_accounts:
        account_data = account_doc.to_dict() or {}
        rec_ref = accounts_ref.document(account_doc.id).collection("recommendations")
        query = (
            rec_ref.where(filter=FieldFilter("status", "==", status_filter))
            .order_by("createdAt", direction="DESCENDING")
            .limit(limit)
        )
        for rec_doc in query.stream():
            task = {
                "id": rec_doc.id,
                "accountId": account_doc.id,
                "accountName": account_data.get("accountName", ""),
                **_serialize_doc(rec_doc.to_dict() or {}),
            }
            all_tasks.append(task)

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
