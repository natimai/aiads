"""API endpoints for AI-powered campaign analysis."""
import json
import logging
from datetime import datetime, timezone, timedelta
from api.accounts import verify_auth, _cors_response
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_ai_insights(request):
    """Route handler for /api/ai endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path.startswith("/api/ai/campaign-builder/"):
            from api.campaign_builder import handle_campaign_builder
            return handle_campaign_builder(request)

        if path.startswith("/api/ai/insights/") and request.method == "GET":
            account_id = path.split("/api/ai/insights/")[1]
            return _get_insights(user_id, account_id)
        elif path == "/api/ai/analyze" and request.method == "POST":
            return _trigger_analysis(request, user_id)
        else:
            return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"AI Insights API error: {e}")
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_insights(user_id: str, account_id: str):
    db = get_db()
    from google.cloud.firestore_v1.base_query import FieldFilter
    insights_ref = (
        db.collection("aiInsights")
        .where(filter=FieldFilter("userId", "==", user_id))
        .where(filter=FieldFilter("accountId", "==", account_id))
        .order_by("generatedAt", direction="DESCENDING")
        .limit(10)
    )

    insights = []
    for doc in insights_ref.stream():
        data = {"id": doc.id, **doc.to_dict()}
        for key in data:
            if hasattr(data[key], "isoformat"):
                data[key] = data[key].isoformat()
        insights.append(data)

    return _cors_response(json.dumps({"insights": insights}))


def _trigger_analysis(request, user_id: str):
    data = request.get_json(silent=True) or {}
    account_id = data.get("accountId")
    analysis_type = data.get("type", "daily_summary")

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    try:
        from services.ai_analyzer import AIAnalyzer
        analyzer = AIAnalyzer()
        db = get_db()

        campaign_data = _gather_campaign_data(db, user_id, account_id)

        result = None
        result = None
        if analysis_type == "daily_summary":
            result = analyzer.daily_summary(campaign_data)
        elif analysis_type == "budget_optimization":
            result = analyzer.budget_optimization(campaign_data)
        elif analysis_type == "creative_recommendations":
            result = analyzer.creative_recommendations(campaign_data)
        elif analysis_type == "creative_copy":
            campaign_name = data.get("campaignName", "")
            objective = data.get("objective", "conversions")
            variations = analyzer.generate_creative_copy(campaign_data, campaign_name, objective)
            result = json.dumps({"copyVariations": variations})
        else:
            return _cors_response(json.dumps({"error": f"Unknown analysis type: {analysis_type}"}), 400)

        now = datetime.now(timezone.utc)
        insight_data = {
            "userId": user_id,
            "accountId": account_id,
            "insightType": analysis_type,
            "content": result if isinstance(result, str) else json.dumps(result),
            "generatedAt": now,
            "expiresAt": now + timedelta(hours=1),
        }
        doc_ref = db.collection("aiInsights").add(insight_data)

        payload = {"id": doc_ref[1].id, "generatedAt": now.isoformat()}
        if analysis_type == "creative_copy":
            payload["copyVariations"] = json.loads(result).get("copyVariations", [])
        else:
            payload["content"] = result
        return _cors_response(json.dumps(payload))

    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return _cors_response(json.dumps({"error": f"Analysis failed: {str(e)}"}), 500)


def _gather_campaign_data(db, user_id: str, account_id: str) -> dict:
    """Gather campaign performance data for AI analysis."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )

    account_doc = base_ref.get()
    account_data = account_doc.to_dict() if account_doc.exists else {}

    campaigns = []
    for camp_doc in base_ref.collection("campaigns").stream():
        camp_data = {"id": camp_doc.id, **camp_doc.to_dict()}
        insight_doc = camp_doc.reference.collection("insights").document(today).get()
        if insight_doc.exists:
            camp_data["todayInsights"] = insight_doc.to_dict()
        campaigns.append(camp_data)

    return {
        "accountName": account_data.get("accountName", ""),
        "currency": account_data.get("currency", "USD"),
        "kpiSummary": account_data.get("kpiSummary", {}),
        "campaigns": campaigns,
        "date": today,
    }
