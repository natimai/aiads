"""API endpoints for campaigns, adsets, ads, and insights."""
import json
import logging
from datetime import datetime, timezone, timedelta
from api.accounts import verify_auth, _cors_response
from utils.firestore_helpers import get_db
from services.meta_api import MetaAPIService
from services.meta_auth import get_decrypted_token

logger = logging.getLogger(__name__)


def handle_campaigns(request):
    """Route handler for /api/campaigns and /api/insights endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path.startswith("/api/insights/"):
            account_id = path.split("/api/insights/")[1]
            return _get_insights(request, user_id, account_id)

        if path.startswith("/api/campaigns/") and "/action/" in path:
            parts = path.split("/")
            account_id = parts[3]
            campaign_id = parts[5] if len(parts) > 5 else None
            action = parts[-1]
            return _campaign_action(user_id, account_id, campaign_id, action)

        if path.startswith("/api/campaigns/"):
            account_id = path.split("/api/campaigns/")[1]
            return _get_campaigns(request, user_id, account_id)

        if path == "/api/campaigns":
            return _get_all_campaigns(request, user_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"Campaigns API error: {e}")
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_campaigns(request, user_id: str, account_id: str):
    db = get_db()
    campaigns_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaigns")
    )

    status_filter = request.args.get("status")
    query = campaigns_ref
    if status_filter:
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = query.where(filter=FieldFilter("status", "==", status_filter))

    campaigns = []
    for doc in query.stream():
        campaign_data = {"id": doc.id, **doc.to_dict()}

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        insight_doc = (
            doc.reference.collection("insights").document(today).get()
        )
        if insight_doc.exists:
            campaign_data["todayInsights"] = insight_doc.to_dict()

        if request.args.get("expand") == "true":
            adsets = []
            for adset_doc in doc.reference.collection("adsets").stream():
                adset_data = {"id": adset_doc.id, **adset_doc.to_dict()}
                ads = []
                for ad_doc in adset_doc.reference.collection("ads").stream():
                    ads.append({"id": ad_doc.id, **ad_doc.to_dict()})
                adset_data["ads"] = ads
                adsets.append(adset_data)
            campaign_data["adsets"] = adsets

        _serialize_timestamps(campaign_data)
        campaigns.append(campaign_data)

    return _cors_response(json.dumps({"campaigns": campaigns, "count": len(campaigns)}))


def _get_all_campaigns(request, user_id: str):
    """Get campaigns across all accounts."""
    db = get_db()
    accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")
    all_campaigns = []

    for acc_doc in accounts_ref.stream():
        acc_data = acc_doc.to_dict()
        if not acc_data.get("isActive"):
            continue

        campaigns_ref = acc_doc.reference.collection("campaigns")
        for doc in campaigns_ref.stream():
            campaign_data = {"id": doc.id, "accountId": acc_doc.id, "accountName": acc_data.get("accountName"), **doc.to_dict()}

            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            insight_doc = doc.reference.collection("insights").document(today).get()
            if insight_doc.exists:
                campaign_data["todayInsights"] = insight_doc.to_dict()

            _serialize_timestamps(campaign_data)
            all_campaigns.append(campaign_data)

    return _cors_response(json.dumps({"campaigns": all_campaigns, "count": len(all_campaigns)}))


def _get_insights(request, user_id: str, account_id: str):
    db = get_db()
    date_from = request.args.get("dateFrom", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    date_to = request.args.get("dateTo", date_from)
    campaign_id = request.args.get("campaignId")

    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )

    results = []

    if campaign_id:
        campaign_ids = [campaign_id]
    else:
        campaign_ids = [doc.id for doc in base_ref.collection("campaigns").stream()]

    from google.cloud.firestore_v1.base_query import FieldFilter

    for cid in campaign_ids:
        insights_ref = base_ref.collection("campaigns").document(cid).collection("insights")
        query = (
            insights_ref
            .where(filter=FieldFilter("date", ">=", date_from))
            .where(filter=FieldFilter("date", "<=", date_to))
            .order_by("date")
        )
        for doc in query.stream():
            data = {"id": doc.id, "campaignId": cid, **doc.to_dict()}
            _serialize_timestamps(data)
            results.append(data)

    if not results:
        account_insights_ref = base_ref.collection("insights")
        query = (
            account_insights_ref
            .where(filter=FieldFilter("date", ">=", date_from))
            .where(filter=FieldFilter("date", "<=", date_to))
            .order_by("date")
        )
        for doc in query.stream():
            data = {"id": doc.id, **doc.to_dict()}
            _serialize_timestamps(data)
            results.append(data)

    return _cors_response(json.dumps({"insights": results, "count": len(results)}))


def _campaign_action(user_id: str, account_id: str, campaign_id: str, action: str):
    if action not in ("pause", "resume"):
        return _cors_response(json.dumps({"error": "Invalid action"}), 400)

    token, _ = get_decrypted_token(user_id, account_id)
    api = MetaAPIService(access_token=token, account_id=account_id)

    if action == "pause":
        api.pause_campaign(campaign_id)
    else:
        api.resume_campaign(campaign_id)

    db = get_db()
    new_status = "PAUSED" if action == "pause" else "ACTIVE"
    db.collection("users").document(user_id).collection("metaAccounts").document(account_id).collection("campaigns").document(campaign_id).update({"status": new_status})

    return _cors_response(json.dumps({"success": True, "status": new_status}))


def _serialize_timestamps(data: dict):
    for key, value in data.items():
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
        elif isinstance(value, dict):
            _serialize_timestamps(value)
