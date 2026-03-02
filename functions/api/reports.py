"""API endpoints for report management and configuration."""
import json
import logging
from datetime import datetime, timezone
from api.accounts import verify_auth, _cors_response
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_reports(request):
    """Route handler for /api/reports endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/reports" and request.method == "GET":
            return _get_reports(user_id)
        elif path == "/api/reports/generate" and request.method == "POST":
            return _generate_report(request, user_id)
        elif path == "/api/reports/config" and request.method == "GET":
            return _get_report_configs(user_id)
        elif path == "/api/reports/config" and request.method == "POST":
            return _save_report_config(request, user_id)
        else:
            return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"Reports API error: {e}")
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_reports(user_id: str):
    db = get_db()
    reports_ref = (
        db.collection("users")
        .document(user_id)
        .collection("reports")
        .order_by("createdAt", direction="DESCENDING")
        .limit(50)
    )
    reports = []
    for doc in reports_ref.stream():
        data = {"id": doc.id, **doc.to_dict()}
        for key in data:
            if hasattr(data[key], "isoformat"):
                data[key] = data[key].isoformat()
        reports.append(data)
    return _cors_response(json.dumps({"reports": reports}))


def _generate_report(request, user_id: str):
    data = request.get_json(silent=True) or {}
    report_type = data.get("type", "daily")

    try:
        from services.report_generator import ReportGenerator
        generator = ReportGenerator()
        db = get_db()

        result = generator.generate(db, user_id, report_type)

        report_doc = {
            "type": report_type,
            "content": result.get("content", ""),
            "status": "completed",
            "createdAt": datetime.now(timezone.utc),
            "deliveredTo": result.get("deliveredTo", []),
        }

        doc_ref = db.collection("users").document(user_id).collection("reports").add(report_doc)

        return _cors_response(json.dumps({
            "id": doc_ref[1].id,
            "type": report_type,
            "status": "completed",
        }))

    except Exception as e:
        logger.error(f"Report generation error: {e}")
        return _cors_response(json.dumps({"error": f"Report generation failed: {str(e)}"}), 500)


def _get_report_configs(user_id: str):
    db = get_db()
    from google.cloud.firestore_v1.base_query import FieldFilter
    configs = db.collection("reportConfigs").where(filter=FieldFilter("userId", "==", user_id)).stream()
    result = []
    for doc in configs:
        data = {"id": doc.id, **doc.to_dict()}
        for key in data:
            if hasattr(data[key], "isoformat"):
                data[key] = data[key].isoformat()
        result.append(data)
    return _cors_response(json.dumps({"configs": result}))


def _save_report_config(request, user_id: str):
    db = get_db()
    data = request.get_json(silent=True) or {}

    config_data = {
        "userId": user_id,
        "reportType": data.get("reportType", "daily"),
        "deliveryChannels": data.get("deliveryChannels", ["telegram"]),
        "scheduleTime": data.get("scheduleTime", "08:00"),
        "timezone": data.get("timezone", "UTC"),
        "enabled": data.get("enabled", True),
        "updatedAt": datetime.now(timezone.utc),
    }

    config_id = data.get("id")
    if config_id:
        db.collection("reportConfigs").document(config_id).set(config_data, merge=True)
    else:
        config_data["createdAt"] = datetime.now(timezone.utc)
        doc_ref = db.collection("reportConfigs").add(config_data)
        config_id = doc_ref[1].id

    return _cors_response(json.dumps({"id": config_id, "success": True}))
