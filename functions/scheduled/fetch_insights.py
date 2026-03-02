"""Scheduled function: Fetch today's campaign insights every 15 minutes."""
import logging
from datetime import datetime, timezone
from services.meta_api import MetaAPIService
from services.meta_auth import get_decrypted_token
from utils.firestore_helpers import get_db, get_all_active_users

logger = logging.getLogger(__name__)


def run_fetch_insights():
    """Fetch today's incremental insights for all active accounts."""
    db = get_db()
    users = get_all_active_users(db, managed_only=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for user in users:
        user_id = user["id"]
        for account in user.get("accounts", []):
            account_id = account["id"]
            try:
                token, _ = get_decrypted_token(user_id, account_id)
                api = MetaAPIService(access_token=token, account_id=account_id)

                insights = api.get_insights(date_from=today, date_to=today, level="campaign")

                campaigns_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                    .collection("campaigns")
                )

                total_spend = 0.0
                total_impressions = 0
                total_clicks = 0
                total_installs = 0
                total_purchase_value = 0.0
                total_purchases = 0

                for insight in insights:
                    campaign_id = insight.get("campaignId")
                    if not campaign_id:
                        continue

                    insight_ref = (
                        campaigns_ref.document(campaign_id)
                        .collection("insights")
                        .document(today)
                    )
                    insight["lastUpdated"] = datetime.now(timezone.utc)
                    insight_ref.set(insight, merge=True)

                    total_spend += insight.get("spend", 0)
                    total_impressions += insight.get("impressions", 0)
                    total_clicks += insight.get("clicks", 0)
                    total_installs += insight.get("installs", 0)
                    total_purchases += insight.get("purchases", 0)
                    total_purchase_value += insight.get("purchaseValue", 0)

                kpi_summary = {
                    "date": today,
                    "totalSpend": total_spend,
                    "totalImpressions": total_impressions,
                    "totalClicks": total_clicks,
                    "totalInstalls": total_installs,
                    "totalPurchases": total_purchases,
                    "totalPurchaseValue": total_purchase_value,
                    "avgCPI": round(total_spend / total_installs, 2) if total_installs > 0 else 0,
                    "avgCPM": round((total_spend / total_impressions) * 1000, 2) if total_impressions > 0 else 0,
                    "avgCTR": round((total_clicks / total_impressions) * 100, 2) if total_impressions > 0 else 0,
                    "roas": round(total_purchase_value / total_spend, 4) if total_spend > 0 else 0,
                }

                account_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                )
                account_ref.update({
                    "kpiSummary": kpi_summary,
                    "kpiUpdatedAt": datetime.now(timezone.utc),
                })

                logger.info(f"Synced {len(insights)} insights for account {account_id}")

            except Exception as e:
                logger.error(f"Error fetching insights for {account_id}: {e}")
