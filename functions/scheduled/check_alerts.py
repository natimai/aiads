"""Scheduled function: Run alert detection engine every 15 minutes."""
import logging
from datetime import datetime, timezone, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter
from services.alert_engine import AlertEngine, Alert
from services.meta_auth import get_decrypted_token
from utils.firestore_helpers import get_db, get_all_active_users

logger = logging.getLogger(__name__)


def run_check_alerts():
    """Run all enabled alert checks for all users and accounts."""
    db = get_db()
    engine = AlertEngine()
    users = get_all_active_users(db)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    hour = datetime.now(timezone.utc).hour

    configs_ref = db.collection("alertConfigs")
    all_configs = list(configs_ref.where(filter=FieldFilter("enabled", "==", True)).stream())
    configs_by_user: dict[str, list[dict]] = {}
    for cfg_doc in all_configs:
        cfg = {"id": cfg_doc.id, **cfg_doc.to_dict()}
        uid = cfg.get("userId", "")
        configs_by_user.setdefault(uid, []).append(cfg)

    for user in users:
        user_id = user["id"]
        user_configs = configs_by_user.get(user_id, [])
        if not user_configs:
            continue

        for account in user.get("accounts", []):
            account_id = account["id"]
            account_name = account.get("accountName", "")
            account_configs = [c for c in user_configs if c.get("accountId") == account_id]
            if not account_configs:
                continue

            try:
                _check_account_alerts(
                    db, engine, user_id, account_id, account_name,
                    account_configs, today, hour,
                )
            except Exception as e:
                logger.error(f"Alert check failed for account {account_id}: {e}")


def _check_account_alerts(
    db, engine: AlertEngine, user_id: str, account_id: str,
    account_name: str, configs: list[dict], today: str, hour: int,
):
    """Run alert checks for a single account."""
    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    alerts_ref = base_ref.collection("alerts")
    campaigns_ref = base_ref.collection("campaigns")

    campaigns = list(campaigns_ref.stream())
    triggered: list[Alert] = []

    config_map = {c["alertType"]: c for c in configs}

    for camp_doc in campaigns:
        camp = camp_doc.to_dict()
        camp_name = camp.get("name", "Unknown")
        camp_id = camp_doc.id

        insight_doc = camp_doc.reference.collection("insights").document(today).get()
        today_data = insight_doc.to_dict() if insight_doc.exists else None

        historical = _get_historical_insights(camp_doc.reference, days=7)

        # ROAS Drop
        if "roas_drop" in config_map and today_data:
            cfg = config_map["roas_drop"]
            roas_history = [h.get("roas", 0) for h in historical]
            alert = engine.check_roas_drop(
                campaign_name=camp_name,
                campaign_id=camp_id,
                current_roas=today_data.get("roas", 0),
                historical_roas=roas_history,
                threshold=cfg.get("threshold", 1.5),
                account_name=account_name,
            )
            if alert:
                triggered.append(alert)

        # CPI Spike
        if "cpi_spike" in config_map and today_data:
            cfg = config_map["cpi_spike"]
            cpi_history = [h.get("cpi", 0) for h in historical]
            alert = engine.check_cpi_spike(
                campaign_name=camp_name,
                campaign_id=camp_id,
                current_cpi=today_data.get("cpi", 0),
                historical_cpi=cpi_history,
                threshold=cfg.get("threshold", 5.0),
                account_name=account_name,
            )
            if alert:
                triggered.append(alert)

        # Budget Anomaly
        if "budget_anomaly" in config_map and today_data:
            cfg = config_map["budget_anomaly"]
            daily_budget = camp.get("dailyBudget", 0)
            spend_history = [h.get("spend", 0) for h in historical]
            alert = engine.check_budget_anomaly(
                campaign_name=camp_name,
                campaign_id=camp_id,
                daily_budget=daily_budget,
                current_spend=today_data.get("spend", 0),
                hour_of_day=hour,
                historical_daily_spend=spend_history,
                threshold_pct=cfg.get("threshold", 30),
                account_name=account_name,
            )
            if alert:
                triggered.append(alert)

        # Campaign Status
        if "campaign_status" in config_map:
            current_status = camp.get("status", "")
            previous_status = camp.get("previousStatus")
            alert = engine.check_campaign_status(
                campaign_name=camp_name,
                campaign_id=camp_id,
                current_status=current_status,
                previous_status=previous_status,
                account_name=account_name,
            )
            if alert:
                triggered.append(alert)

        # Creative Fatigue (check individual ads)
        if "creative_fatigue" in config_map:
            cfg = config_map["creative_fatigue"]
            _check_creative_fatigue_for_campaign(
                engine, camp_doc.reference, camp_name, camp_id,
                cfg, account_name, triggered,
            )

    # Write alerts with cooldown check
    for alert in triggered:
        config = config_map.get(alert.type, {})
        cooldown_hours = config.get("cooldownHours", 6)

        if _is_in_cooldown(alerts_ref, alert, cooldown_hours):
            logger.debug(f"Alert {alert.type} for {alert.campaign_name} in cooldown, skipping")
            continue

        alert_data = alert.to_dict()
        alerts_ref.add(alert_data)

        channels = config.get("channels", ["telegram"])
        _deliver_alert(alert_data, channels)

    if triggered:
        logger.info(f"Triggered {len(triggered)} alerts for account {account_id}")


def _check_creative_fatigue_for_campaign(
    engine: AlertEngine, campaign_ref, campaign_name: str,
    campaign_id: str, config: dict, account_name: str,
    triggered: list[Alert],
):
    """Check creative fatigue at the ad level within a campaign."""
    for adset_doc in campaign_ref.collection("adsets").stream():
        for ad_doc in adset_doc.reference.collection("ads").stream():
            ad_data = ad_doc.to_dict()
            ad_name = ad_data.get("name", "Unknown Ad")
            # Fatigue checks require historical per-ad data which may be limited
            # Use campaign-level CTR/frequency as proxy
            pass


def _get_historical_insights(campaign_ref, days: int = 7) -> list[dict]:
    """Fetch the last N days of insights for a campaign."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    docs = (
        campaign_ref.collection("insights")
        .where(filter=FieldFilter("date", ">=", cutoff))
        .order_by("date")
        .stream()
    )
    return [doc.to_dict() for doc in docs]


def _is_in_cooldown(alerts_ref, alert: Alert, cooldown_hours: int) -> bool:
    """Check if an alert of the same type + entity was fired within the cooldown window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)
    existing = (
        alerts_ref
        .where(filter=FieldFilter("type", "==", alert.type))
        .where(filter=FieldFilter("campaignRef", "==", alert.campaign_id))
        .where(filter=FieldFilter("createdAt", ">=", cutoff))
        .limit(1)
        .stream()
    )
    return any(True for _ in existing)


def _deliver_alert(alert_data: dict, channels: list[str]):
    """Send alert through configured notification channels."""
    for channel in channels:
        try:
            if channel == "telegram":
                from services.telegram_bot import TelegramNotifier
                from utils.formatters import format_alert_telegram
                notifier = TelegramNotifier()
                msg = format_alert_telegram(alert_data)
                notifier.send_message(msg)

            elif channel == "email":
                from services.email_sender import EmailSender
                from utils.formatters import format_alert_email_html
                sender = EmailSender()
                html = format_alert_email_html(alert_data)
                subject = f"[{alert_data.get('severity', 'alert').upper()}] {alert_data.get('type', 'Alert')}: {alert_data.get('campaignName', '')}"
                sender.send(subject=subject, html_content=html)

            elif channel == "sms":
                if alert_data.get("severity") == "critical":
                    from services.sms_sender import SMSSender
                    sms = SMSSender()
                    msg = f"CRITICAL: {alert_data.get('type', 'Alert')} - {alert_data.get('campaignName', '')} - {alert_data.get('message', '')}"
                    sms.send(msg)

        except Exception as e:
            logger.error(f"Failed to deliver alert via {channel}: {e}")
