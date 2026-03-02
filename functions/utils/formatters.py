from datetime import datetime


def format_currency(value: float, currency: str = "USD") -> str:
    symbols = {"USD": "$", "EUR": "€", "GBP": "£", "ILS": "₪"}
    symbol = symbols.get(currency, currency + " ")
    return f"{symbol}{value:,.2f}"


def format_percentage(value: float) -> str:
    return f"{value:.2f}%"


def format_number(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K"
    return f"{value:,.0f}"


def format_delta(current: float, previous: float) -> str:
    if previous == 0:
        return "N/A"
    delta = ((current - previous) / previous) * 100
    arrow = "↑" if delta > 0 else "↓" if delta < 0 else "→"
    return f"{arrow} {abs(delta):.1f}%"


def severity_emoji(severity: str) -> str:
    return {"critical": "🔴", "warning": "🟡", "info": "🔵"}.get(severity, "⚪")


def format_alert_telegram(alert: dict, dashboard_url: str = "") -> str:
    emoji = severity_emoji(alert.get("severity", "info"))
    lines = [
        f"{emoji} *{alert.get('type', 'Alert').replace('_', ' ').upper()}*",
        "",
        f"📊 *Campaign:* {alert.get('campaignName', 'N/A')}",
        f"📈 *Current Value:* {alert.get('actualValue', 'N/A')}",
        f"🎯 *Threshold:* {alert.get('thresholdValue', 'N/A')}",
        f"💼 *Account:* {alert.get('accountName', 'N/A')}",
        f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}",
    ]
    if dashboard_url:
        lines.append(f"\n[View Dashboard]({dashboard_url})")
    return "\n".join(lines)


def format_alert_email_html(alert: dict) -> str:
    severity = alert.get("severity", "info")
    color = {"critical": "#ef4444", "warning": "#eab308", "info": "#3b82f6"}.get(severity, "#6b7280")

    return f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: {color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">{alert.get('type', 'Alert').replace('_', ' ').upper()}</h2>
            <span style="opacity: 0.9;">{severity.upper()}</span>
        </div>
        <div style="background: #1e293b; color: #e2e8f0; padding: 24px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #94a3b8;">Campaign</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold;">{alert.get('campaignName', 'N/A')}</td></tr>
                <tr><td style="padding: 8px 0; color: #94a3b8;">Current Value</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold;">{alert.get('actualValue', 'N/A')}</td></tr>
                <tr><td style="padding: 8px 0; color: #94a3b8;">Threshold</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold;">{alert.get('thresholdValue', 'N/A')}</td></tr>
                <tr><td style="padding: 8px 0; color: #94a3b8;">Account</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold;">{alert.get('accountName', 'N/A')}</td></tr>
            </table>
            <p style="color: #94a3b8; margin-top: 16px; font-size: 14px;">{alert.get('message', '')}</p>
        </div>
    </div>
    """


def format_daily_report_telegram(report: dict) -> str:
    lines = [
        "📊 *Daily Performance Report*",
        f"📅 {report.get('date', 'N/A')}",
        "",
        "💰 *Spend Summary*",
        f"  Total Spend: {report.get('totalSpend', 'N/A')}",
        f"  vs Budget: {report.get('budgetUtilization', 'N/A')}",
        "",
        "📈 *Key Metrics*",
        f"  CPI: {report.get('cpi', 'N/A')}",
        f"  ROAS: {report.get('roas', 'N/A')}",
        f"  CTR: {report.get('ctr', 'N/A')}",
        f"  CPM: {report.get('cpm', 'N/A')}",
        "",
    ]

    top = report.get("topCampaigns", [])
    if top:
        lines.append("🏆 *Top Performers*")
        for i, c in enumerate(top[:3], 1):
            lines.append(f"  {i}. {c.get('name', '')} (ROAS: {c.get('roas', 'N/A')})")
        lines.append("")

    bottom = report.get("bottomCampaigns", [])
    if bottom:
        lines.append("⚠️ *Needs Attention*")
        for i, c in enumerate(bottom[:3], 1):
            lines.append(f"  {i}. {c.get('name', '')} (ROAS: {c.get('roas', 'N/A')})")
        lines.append("")

    alerts_count = report.get("alertsCount", 0)
    if alerts_count:
        lines.append(f"🚨 *Alerts Triggered:* {alerts_count}")
        lines.append("")

    ai_summary = report.get("aiSummary")
    if ai_summary:
        lines.append("🤖 *AI Summary*")
        lines.append(ai_summary)

    return "\n".join(lines)
