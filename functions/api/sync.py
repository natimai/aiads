"""API endpoint for manual sync — triggers fetch of campaigns + insights from Meta API."""
import json
import logging
from datetime import datetime, timezone, timedelta
from api.accounts import verify_auth, _cors_response
from services.meta_api import MetaAPIService
from services.meta_auth import get_decrypted_token
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_sync(request):
    """Route handler for /api/sync endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/sync/all" and request.method == "POST":
            return _sync_all_accounts(user_id)

        if path.startswith("/api/sync/") and request.method == "POST":
            account_id = path.split("/api/sync/")[1]
            return _sync_account(user_id, account_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"Sync API error: {e}", exc_info=True)
        return _cors_response(json.dumps({"error": str(e)}), 500)


def _sync_all_accounts(user_id: str):
    db = get_db()
    accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")
    results = []

    logger.info(f"Starting sync for user {user_id}")
    all_docs = list(accounts_ref.stream())
    logger.info(f"Found {len(all_docs)} account docs")

    for acc_doc in all_docs:
        acc_data = acc_doc.to_dict()
        if not acc_data.get("isActive"):
            logger.info(f"Skipping inactive account {acc_doc.id}")
            continue
        if not acc_data.get("isManagedByPlatform"):
            logger.info(f"Skipping unmanaged account {acc_doc.id}")
            continue
        try:
            logger.info(f"Syncing account {acc_doc.id} ({acc_data.get('accountName')})")
            res = _do_sync(db, user_id, acc_doc.id)
            results.append({"accountId": acc_doc.id, "accountName": acc_data.get("accountName"), **res})
            logger.info(f"Synced {acc_doc.id}: {res.get('campaigns',0)} campaigns, {res.get('insights',0)} insights")
        except Exception as e:
            logger.error(f"Sync failed for {acc_doc.id}: {e}", exc_info=True)
            results.append({"accountId": acc_doc.id, "accountName": acc_data.get("accountName"), "error": str(e)})

    return _cors_response(json.dumps({"synced": results, "count": len(results)}))


def _sync_account(user_id: str, account_id: str):
    db = get_db()
    result = _do_sync(db, user_id, account_id)
    return _cors_response(json.dumps(result))


def _do_sync(db, user_id: str, account_id: str) -> dict:
    """Fetch campaigns + insights from Meta API and store in Firestore."""
    token, _ = get_decrypted_token(user_id, account_id)
    api = MetaAPIService(access_token=token, account_id=account_id)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    breakdown_start = (now - timedelta(days=6)).strftime("%Y-%m-%d")

    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )

    campaigns = api.get_campaigns()
    campaign_map = {}
    batch = db.batch()
    count = 0
    for c in campaigns:
        meta_id = c.get("metaCampaignId")
        if not meta_id:
            continue
        campaign_map[meta_id] = c.get("name", "")
        c["lastSynced"] = now
        batch.set(base_ref.collection("campaigns").document(meta_id), c, merge=True)
        count += 1
        if count >= 450:
            batch.commit()
            batch = db.batch()
            count = 0
    if count > 0:
        batch.commit()

    adsets = api.get_adsets()
    batch = db.batch()
    count = 0
    adset_count = 0
    for adset in adsets:
        adset_id = adset.get("metaAdsetId")
        campaign_id = adset.get("campaignId")
        if not adset_id or not campaign_id:
            continue
        adset["lastSynced"] = now
        adset_ref = (
            base_ref.collection("campaigns")
            .document(campaign_id)
            .collection("adsets")
            .document(adset_id)
        )
        batch.set(adset_ref, adset, merge=True)
        adset_count += 1
        count += 1
        if count >= 450:
            batch.commit()
            batch = db.batch()
            count = 0
    if count > 0:
        batch.commit()

    logger.info(f"Account {account_id}: wrote {len(campaigns)} campaigns. Fetching insights {start_date} -> {today}")

    insights = api.get_insights(date_from=start_date, date_to=today, level="campaign")
    logger.info(f"Account {account_id}: received {len(insights)} insight rows")

    total_spend = 0.0
    total_impressions = 0
    total_clicks = 0
    total_leads = 0
    total_link_clicks = 0
    total_installs = 0
    total_purchases = 0
    total_purchase_value = 0.0

    batch = db.batch()
    count = 0
    insight_count = 0
    for insight in insights:
        campaign_id = insight.get("campaignId")
        date = insight.get("date", today)

        insight["lastUpdated"] = now

        if campaign_id:
            insight_ref = (
                base_ref.collection("campaigns")
                .document(campaign_id)
                .collection("insights")
                .document(date)
            )
        else:
            insight_ref = base_ref.collection("insights").document(date)

        batch.set(insight_ref, insight, merge=True)
        count += 1
        insight_count += 1
        if count >= 450:
            batch.commit()
            batch = db.batch()
            count = 0

        total_spend += insight.get("spend", 0)
        total_impressions += insight.get("impressions", 0)
        total_clicks += insight.get("clicks", 0)
        total_leads += insight.get("leads", 0)
        total_link_clicks += insight.get("linkClicks", 0)
        total_installs += insight.get("installs", 0)
        total_purchases += insight.get("purchases", 0)
        total_purchase_value += insight.get("purchaseValue", 0)

    if count > 0:
        batch.commit()

    logger.info(f"Account {account_id}: wrote {insight_count} insights. Spend={total_spend}, Leads={total_leads}, Impressions={total_impressions}")

    kpi_summary = {
        "date": today,
        "totalSpend": total_spend,
        "totalImpressions": total_impressions,
        "totalClicks": total_clicks,
        "totalLeads": total_leads,
        "totalLinkClicks": total_link_clicks,
        "totalInstalls": total_installs,
        "totalPurchases": total_purchases,
        "totalPurchaseValue": total_purchase_value,
        "avgCostPerLead": round(total_spend / total_leads, 2) if total_leads > 0 else 0,
        "avgCPI": round(total_spend / total_installs, 2) if total_installs > 0 else 0,
        "avgCPM": round((total_spend / total_impressions) * 1000, 2) if total_impressions > 0 else 0,
        "avgCTR": round((total_clicks / total_impressions) * 100, 2) if total_impressions > 0 else 0,
        "roas": round(total_purchase_value / total_spend, 4) if total_spend > 0 else 0,
    }

    base_ref.update({"kpiSummary": kpi_summary, "kpiUpdatedAt": now})

    breakdown_count = 0
    for breakdown_type in ("age", "gender", "placement"):
        try:
            breakdown_rows = api.get_insights_with_breakdowns(
                breakdown_type=breakdown_type,
                date_from=breakdown_start,
                date_to=today,
                level="adset",
            )
            base_ref.collection("breakdowns").document(f"{today}_{breakdown_type}").set(
                {
                    "type": breakdown_type,
                    "date": today,
                    "dateFrom": breakdown_start,
                    "data": breakdown_rows,
                    "lastUpdated": now,
                },
                merge=True,
            )
            breakdown_count += len(breakdown_rows)
        except Exception as exc:
            logger.warning(
                "Account %s: failed syncing %s breakdowns: %s",
                account_id,
                breakdown_type,
                exc,
            )

    return {
        "campaigns": len(campaigns),
        "adsets": adset_count,
        "insights": insight_count,
        "breakdowns": breakdown_count,
        "kpiSummary": kpi_summary,
    }
