"""Report generation for daily and weekly campaign summaries."""
import logging
from datetime import datetime, timezone, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter
from utils.formatters import (
    format_currency,
    format_percentage,
    format_daily_report_telegram,
)

logger = logging.getLogger(__name__)


class ReportGenerator:
    def generate(self, db, user_id: str, report_type: str = "daily") -> dict:
        if report_type == "daily":
            return self._generate_daily(db, user_id)
        elif report_type == "weekly":
            return self._generate_weekly(db, user_id)
        raise ValueError(f"Unknown report type: {report_type}")

    def _generate_daily(self, db, user_id: str) -> dict:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")

        total_spend = 0.0
        total_budget = 0.0
        all_campaigns = []

        for acc_doc in accounts_ref.stream():
            acc = acc_doc.to_dict()
            if not acc.get("isActive"):
                continue

            currency = acc.get("currency", "USD")
            campaigns_ref = acc_doc.reference.collection("campaigns")

            for camp_doc in campaigns_ref.stream():
                camp = camp_doc.to_dict()
                insight_doc = camp_doc.reference.collection("insights").document(yesterday).get()
                if not insight_doc.exists:
                    continue

                insight = insight_doc.to_dict()
                daily_budget = camp.get("dailyBudget", 0)
                total_budget += daily_budget
                total_spend += insight.get("spend", 0)

                all_campaigns.append({
                    "name": camp.get("name", "Unknown"),
                    "spend": insight.get("spend", 0),
                    "roas": insight.get("roas", 0),
                    "cpi": insight.get("cpi", 0),
                    "ctr": insight.get("ctr", 0),
                    "cpm": insight.get("cpm", 0),
                    "impressions": insight.get("impressions", 0),
                    "installs": insight.get("installs", 0),
                })

        sorted_by_roas = sorted(all_campaigns, key=lambda c: c["roas"], reverse=True)
        top_campaigns = sorted_by_roas[:3]
        bottom_campaigns = sorted_by_roas[-3:] if len(sorted_by_roas) > 3 else []

        avg_cpi = sum(c["cpi"] for c in all_campaigns) / len(all_campaigns) if all_campaigns else 0
        avg_ctr = sum(c["ctr"] for c in all_campaigns) / len(all_campaigns) if all_campaigns else 0
        avg_cpm = sum(c["cpm"] for c in all_campaigns) / len(all_campaigns) if all_campaigns else 0
        total_purchases_value = sum(c.get("roas", 0) * c.get("spend", 0) for c in all_campaigns)
        overall_roas = total_purchases_value / total_spend if total_spend > 0 else 0

        alerts_count = 0
        for acc_doc in accounts_ref.stream():
            alerts_ref = acc_doc.reference.collection("alerts")
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            alerts_count += sum(
                1 for _ in alerts_ref.where(
                    filter=FieldFilter("createdAt", ">=", cutoff)
                ).stream()
            )

        ai_summary = ""
        try:
            from services.meta_ads_analyzer_v2 import MetaAdsAnalyzerV2

            analyzer = MetaAdsAnalyzerV2()
            acc_doc = next(accounts_ref.stream(), None)
            if acc_doc:
                acc_data = acc_doc.to_dict()
                kpi_summary = acc_data.get("kpiSummary", {})
                campaigns_for_ai = [
                    {
                        "name": c.get("name", ""),
                        "status": "ACTIVE",
                        "todayInsights": {
                            "spend": c.get("spend", 0),
                            "roas": c.get("roas", 0),
                            "cpa": c.get("cpi", 0),
                            "ctr": c.get("ctr", 0),
                            "cpm": c.get("cpm", 0),
                            "impressions": c.get("impressions", 0),
                        },
                    }
                    for c in all_campaigns
                ]
                ai_data = {
                    "accountName": acc_data.get("accountName", ""),
                    "currency": acc_data.get("currency", "USD"),
                    "kpiSummary": kpi_summary,
                    "campaigns": campaigns_for_ai,
                    "breakdowns": [],
                    "officialRecommendations": [],
                    "date": yesterday,
                }
                structured = analyzer.analyze(ai_data, official_recommendations=[], language="en")
                ai_summary = analyzer.to_text_report(structured)
        except Exception as e:
            logger.warning(f"AI summary failed: {e}")

        report_data = {
            "date": yesterday,
            "totalSpend": format_currency(total_spend),
            "budgetUtilization": format_percentage((total_spend / total_budget * 100) if total_budget > 0 else 0),
            "cpi": format_currency(avg_cpi),
            "roas": f"{overall_roas:.2f}x",
            "ctr": format_percentage(avg_ctr),
            "cpm": format_currency(avg_cpm),
            "topCampaigns": [{"name": c["name"], "roas": f"{c['roas']:.2f}x"} for c in top_campaigns],
            "bottomCampaigns": [{"name": c["name"], "roas": f"{c['roas']:.2f}x"} for c in bottom_campaigns],
            "alertsCount": alerts_count,
            "aiSummary": ai_summary,
        }

        telegram_message = format_daily_report_telegram(report_data)

        delivered_to = []
        try:
            from services.telegram_bot import TelegramNotifier
            notifier = TelegramNotifier()
            if notifier.send_message(telegram_message):
                delivered_to.append("telegram")
        except Exception as e:
            logger.error(f"Telegram delivery failed: {e}")

        try:
            from services.email_sender import EmailSender
            sender = EmailSender()
            html = self._daily_report_html(report_data)
            if sender.send(f"Daily Report - {yesterday}", html):
                delivered_to.append("email")
        except Exception as e:
            logger.error(f"Email delivery failed: {e}")

        return {
            "content": telegram_message,
            "deliveredTo": delivered_to,
        }

    def _generate_weekly(self, db, user_id: str) -> dict:
        today = datetime.now(timezone.utc)
        week_end = (today - timedelta(days=1)).strftime("%Y-%m-%d")
        week_start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        prev_week_end = (today - timedelta(days=8)).strftime("%Y-%m-%d")
        prev_week_start = (today - timedelta(days=14)).strftime("%Y-%m-%d")

        accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")

        message = (
            f"📊 *Weekly Performance Report*\n"
            f"📅 {week_start} to {week_end}\n\n"
            f"_Detailed weekly analysis available in the dashboard._"
        )

        delivered_to = []
        try:
            from services.telegram_bot import TelegramNotifier
            notifier = TelegramNotifier()
            if notifier.send_message(message):
                delivered_to.append("telegram")
        except Exception as e:
            logger.error(f"Weekly report Telegram delivery failed: {e}")

        return {"content": message, "deliveredTo": delivered_to}

    def _daily_report_html(self, report_data: dict) -> str:
        top_rows = "".join(
            f"<tr><td style='padding:8px;color:#e2e8f0;'>{c['name']}</td>"
            f"<td style='padding:8px;text-align:right;color:#22c55e;'>{c['roas']}</td></tr>"
            for c in report_data.get("topCampaigns", [])
        )
        bottom_rows = "".join(
            f"<tr><td style='padding:8px;color:#e2e8f0;'>{c['name']}</td>"
            f"<td style='padding:8px;text-align:right;color:#ef4444;'>{c['roas']}</td></tr>"
            for c in report_data.get("bottomCampaigns", [])
        )

        return f"""
        <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:#3b82f6;padding:24px;text-align:center;">
                <h1 style="margin:0;color:white;font-size:20px;">Daily Performance Report</h1>
                <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">{report_data.get('date','')}</p>
            </div>
            <div style="padding:24px;">
                <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                    <tr>
                        <td style="padding:12px;background:#1e293b;border-radius:8px;text-align:center;width:50%;">
                            <div style="font-size:12px;color:#94a3b8;">Total Spend</div>
                            <div style="font-size:20px;font-weight:bold;">{report_data.get('totalSpend','')}</div>
                        </td>
                        <td style="width:12px;"></td>
                        <td style="padding:12px;background:#1e293b;border-radius:8px;text-align:center;width:50%;">
                            <div style="font-size:12px;color:#94a3b8;">ROAS</div>
                            <div style="font-size:20px;font-weight:bold;">{report_data.get('roas','')}</div>
                        </td>
                    </tr>
                </table>
                <h3 style="color:#22c55e;font-size:14px;margin-bottom:8px;">Top Performers</h3>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">{top_rows}</table>
                <h3 style="color:#ef4444;font-size:14px;margin-bottom:8px;">Needs Attention</h3>
                <table style="width:100%;border-collapse:collapse;">{bottom_rows}</table>
            </div>
        </div>
        """
