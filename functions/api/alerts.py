"""API endpoints for alerts and alert configurations."""
import json
import logging
from datetime import datetime, timezone
from api.accounts import verify_auth, _cors_response
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_alerts(request):
    """Route handler for /api/alerts endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/alerts/config" and request.method == "GET":
            return _get_alert_configs(user_id)
        elif path == "/api/alerts/config" and request.method == "POST":
            return _save_alert_config(request, user_id)
        elif path.startswith("/api/alerts/config/") and request.method == "DELETE":
            config_id = path.split("/api/alerts/config/")[1]
            return _delete_alert_config(user_id, config_id)
        elif path.startswith("/api/alerts/") and "/acknowledge" in path:
            parts = path.replace("/acknowledge", "").split("/api/alerts/")
            alert_info = parts[1] if len(parts) > 1 else ""
            return _acknowledge_alert(request, user_id, alert_info)
        elif path == "/api/alerts" and request.method == "GET":
            return _get_alerts(request, user_id)
        else:
            return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"Alerts API error: {e}")
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_alerts(request, user_id: str):
    db = get_db()
    account_id = request.args.get("accountId")
    alert_type = request.args.get("type")
    severity = request.args.get("severity")
    limit = int(request.args.get("limit", 50))

    accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")
    all_alerts = []

    account_ids = [account_id] if account_id else [doc.id for doc in accounts_ref.stream()]

    for acc_id in account_ids:
        alerts_ref = accounts_ref.document(acc_id).collection("alerts")
        query = alerts_ref.order_by("createdAt", direction="DESCENDING").limit(limit)

        for doc in query.stream():
            alert_data = {"id": doc.id, "accountId": acc_id, **doc.to_dict()}
            if alert_type and alert_data.get("type") != alert_type:
                continue
            if severity and alert_data.get("severity") != severity:
                continue
            _serialize_ts(alert_data)
            all_alerts.append(alert_data)

    all_alerts.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    all_alerts = all_alerts[:limit]

    return _cors_response(json.dumps({"alerts": all_alerts, "count": len(all_alerts)}))


def _acknowledge_alert(request, user_id: str, alert_path: str):
    db = get_db()
    parts = alert_path.split("/")
    if len(parts) < 2:
        return _cors_response(json.dumps({"error": "Invalid alert path"}), 400)

    account_id = parts[0]
    alert_id = parts[1]

    alert_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("alerts")
        .document(alert_id)
    )
    alert_ref.update({
        "acknowledged": True,
        "acknowledgedAt": datetime.now(timezone.utc),
    })
    return _cors_response(json.dumps({"success": True}))


def _get_alert_configs(user_id: str):
    db = get_db()
    from google.cloud.firestore_v1.base_query import FieldFilter
    configs_ref = db.collection("alertConfigs").where(filter=FieldFilter("userId", "==", user_id))
    configs = []
    for doc in configs_ref.stream():
        data = {"id": doc.id, **doc.to_dict()}
        _serialize_ts(data)
        configs.append(data)
    return _cors_response(json.dumps({"configs": configs}))


def _save_alert_config(request, user_id: str):
    db = get_db()
    data = request.get_json(silent=True) or {}

    config_id = data.get("id")
    config_data = {
        "userId": user_id,
        "accountId": data.get("accountId"),
        "alertType": data.get("alertType"),
        "enabled": data.get("enabled", True),
        "threshold": data.get("threshold"),
        "cooldownHours": data.get("cooldownHours", 6),
        "channels": data.get("channels", ["telegram"]),
        "updatedAt": datetime.now(timezone.utc),
    }

    if config_id:
        db.collection("alertConfigs").document(config_id).set(config_data, merge=True)
    else:
        config_data["createdAt"] = datetime.now(timezone.utc)
        doc_ref = db.collection("alertConfigs").add(config_data)
        config_id = doc_ref[1].id

    return _cors_response(json.dumps({"id": config_id, "success": True}))


def _delete_alert_config(user_id: str, config_id: str):
    db = get_db()
    doc_ref = db.collection("alertConfigs").document(config_id)
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("userId") != user_id:
        return _cors_response(json.dumps({"error": "Not found"}), 404)
    doc_ref.delete()
    return _cors_response(json.dumps({"success": True}))


def _serialize_ts(data: dict):
    for key, value in data.items():
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
        elif isinstance(value, dict):
            _serialize_ts(value)
