"""Scheduled function: Fetch demographic and placement breakdowns every 6 hours."""
import logging
from datetime import datetime, timedelta, timezone
from services.meta_api import MetaAPIService
from services.meta_auth import get_decrypted_token
from utils.firestore_helpers import get_db, get_all_active_users

logger = logging.getLogger(__name__)


def run_fetch_breakdowns():
    """Fetch breakdowns (age, gender, placement) for all accounts."""
    db = get_db()
    users = get_all_active_users(db, managed_only=True)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    date_from = (now - timedelta(days=6)).strftime("%Y-%m-%d")
    breakdown_types = ["age", "gender", "placement"]

    for user in users:
        user_id = user["id"]
        for account in user.get("accounts", []):
            account_id = account["id"]
            try:
                token, _ = get_decrypted_token(user_id, account_id)
                api = MetaAPIService(access_token=token, account_id=account_id)

                breakdowns_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                    .collection("breakdowns")
                )

                for breakdown_type in breakdown_types:
                    try:
                        data = api.get_insights_with_breakdowns(
                            breakdown_type=breakdown_type,
                            date_from=date_from,
                            date_to=today,
                            level="adset",
                        )

                        doc_ref = breakdowns_ref.document(f"{today}_{breakdown_type}")
                        doc_ref.set(
                            {
                                "type": breakdown_type,
                                "date": today,
                                "dateFrom": date_from,
                                "data": data,
                                "lastUpdated": datetime.now(timezone.utc),
                            },
                            merge=True,
                        )

                        logger.info(
                            f"Fetched {len(data)} {breakdown_type} breakdowns for account {account_id}"
                        )

                    except Exception as e:
                        logger.error(
                            f"Error fetching {breakdown_type} breakdowns for {account_id}: {e}"
                        )

                # Update freshness timestamp on account doc
                account_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                )
                account_ref.update({"breakdownsSyncedAt": datetime.now(timezone.utc)})

            except Exception as e:
                logger.error(f"Error with account {account_id}: {e}")
