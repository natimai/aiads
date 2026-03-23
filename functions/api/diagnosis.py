"""API endpoints for structured campaign diagnosis."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from api.accounts import _cors_response, verify_auth
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_diagnosis(request):
    """Route handler for /api/diagnosis endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        path = request.path.rstrip("/")

        # POST /api/diagnosis/run
        if path.endswith("/run") and request.method == "POST":
            return _run_diagnosis(request)

        # GET /api/diagnosis/{accountId}
        parts = path.split("/")
        if len(parts) >= 4 and request.method == "GET":
            account_id = parts[3]
            return _get_latest_diagnosis(request, account_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.exception("diagnosis: unhandled error")
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _run_diagnosis(request) -> tuple:
    """POST /api/diagnosis/run — execute diagnosis and store result."""
    user_id = verify_auth(request)
    db = get_db()

    body = request.get_json(silent=True) or {}
    account_id = body.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId is required"}), 400)

    # Default date range: last 7 days
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    date_from = body.get("dateFrom", (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d"))
    date_to = body.get("dateTo", today)

    from services.diagnosis_engine import DiagnosisEngine

    engine = DiagnosisEngine(db)
    report = engine.diagnose(user_id, account_id, date_from, date_to)

    # Store in Firestore
    try:
        diagnosis_ref = (
            db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("diagnoses")
            .document(report["id"])
        )
        diagnosis_ref.set(report)
    except Exception:
        logger.exception("diagnosis: failed to store report")

    return _cors_response(json.dumps(report, default=str))


def _get_latest_diagnosis(request, account_id: str) -> tuple:
    """GET /api/diagnosis/{accountId} — return most recent diagnosis."""
    user_id = verify_auth(request)
    db = get_db()

    try:
        query = (
            db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("diagnoses")
            .order_by("generatedAt", direction="DESCENDING")
            .limit(1)
        )
        docs = list(query.stream())
        if not docs:
            return _cors_response(json.dumps({"error": "No diagnosis found"}), 404)

        report = docs[0].to_dict()
        report["id"] = docs[0].id
        return _cors_response(json.dumps(report, default=str))
    except Exception:
        logger.exception("diagnosis: failed to fetch latest")
        return _cors_response(json.dumps({"error": "Failed to fetch diagnosis"}), 500)
