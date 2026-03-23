"""Scheduled function: Sync campaign/adset/ad structures every hour."""
import logging
from datetime import datetime, timezone
from services.meta_api import MetaAPIService
from services.meta_auth import get_decrypted_token
from utils.firestore_helpers import get_db, get_all_active_users

logger = logging.getLogger(__name__)


def run_fetch_structures():
    """Sync campaign, adset, and ad structures for all active accounts."""
    db = get_db()
    users = get_all_active_users(db, managed_only=True)

    for user in users:
        user_id = user["id"]
        for account in user.get("accounts", []):
            account_id = account["id"]
            try:
                token, _ = get_decrypted_token(user_id, account_id)
                api = MetaAPIService(access_token=token, account_id=account_id)

                base_ref = (
                    db.collection("users")
                    .document(user_id)
                    .collection("metaAccounts")
                    .document(account_id)
                )

                campaigns = api.get_campaigns()
                now = datetime.now(timezone.utc)

                batch = db.batch()
                batch_count = 0

                for campaign in campaigns:
                    meta_id = campaign.get("metaCampaignId")
                    if not meta_id:
                        continue
                    campaign["lastSynced"] = now
                    campaign_ref = base_ref.collection("campaigns").document(meta_id)
                    batch.set(campaign_ref, campaign, merge=True)
                    batch_count += 1

                    if batch_count >= 450:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

                adsets = api.get_adsets()
                campaign_adsets: dict[str, list] = {}
                for adset in adsets:
                    adset["lastSynced"] = now

                ads = api.get_ads()
                for ad in ads:
                    ad["lastSynced"] = now

                if batch_count > 0:
                    batch.commit()

                batch = db.batch()
                batch_count = 0
                for adset in adsets:
                    meta_adset_id = adset.get("metaAdsetId")
                    if not meta_adset_id:
                        continue
                    campaign_id_for_adset = str(adset.get("campaignId") or "")
                    if not campaign_id_for_adset:
                        for campaign in campaigns:
                            if campaign.get("metaCampaignId"):
                                campaign_id_for_adset = campaign["metaCampaignId"]
                                break
                    if not campaign_id_for_adset:
                        continue

                    adset_ref = (
                        base_ref.collection("campaigns")
                        .document(campaign_id_for_adset)
                        .collection("adsets")
                        .document(meta_adset_id)
                    )
                    batch.set(adset_ref, adset, merge=True)
                    batch_count += 1
                    if batch_count >= 450:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

                if batch_count > 0:
                    batch.commit()

                base_ref.update({"structuresSyncedAt": now})

                logger.info(
                    f"Synced structures for account {account_id}: "
                    f"{len(campaigns)} campaigns, {len(adsets)} adsets, {len(ads)} ads"
                )

            except Exception as e:
                logger.error(f"Error syncing structures for {account_id}: {e}")
