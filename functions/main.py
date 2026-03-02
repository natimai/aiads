"""Firebase Cloud Functions entry point — registers all HTTP and scheduled functions."""
import os
from pathlib import Path

# Must be set before any fork() to prevent macOS crash with SSL in child processes
os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"

env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").strip().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            k, v = key.strip(), value.strip()
            if v.startswith('"') and v.endswith('"'):
                v = v[1:-1]
            os.environ[k] = v

import firebase_admin
from firebase_functions import https_fn, scheduler_fn, options

firebase_admin.initialize_app()

# ---------- HTTP API (single entry point, routes internally) ----------

@https_fn.on_request(
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]),
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def api(req: https_fn.Request) -> https_fn.Response:
    """Main API gateway — routes to sub-handlers based on path."""
    path = req.path.rstrip("/")

    if path.startswith("/api/accounts"):
        from api.accounts import handle_accounts
        body, status, headers = handle_accounts(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/campaigns") or path.startswith("/api/insights"):
        from api.campaigns import handle_campaigns
        body, status, headers = handle_campaigns(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/alerts"):
        from api.alerts import handle_alerts
        body, status, headers = handle_alerts(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/ai"):
        from api.ai_insights import handle_ai_insights
        body, status, headers = handle_ai_insights(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/reports"):
        from api.reports import handle_reports
        body, status, headers = handle_reports(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/recommendations"):
        from api.recommendations import handle_recommendations
        body, status, headers = handle_recommendations(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/sync"):
        from api.sync import handle_sync
        body, status, headers = handle_sync(req)
        return https_fn.Response(body, status=status, headers=headers)

    if path.startswith("/api/tasks"):
        from api.tasks import handle_tasks
        body, status, headers = handle_tasks(req)
        return https_fn.Response(body, status=status, headers=headers)

    return https_fn.Response('{"error": "Not found"}', status=404, headers={"Content-Type": "application/json"})


# ---------- Scheduled Functions ----------

@scheduler_fn.on_schedule(
    schedule="*/15 * * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_fetch_insights(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 15 minutes: fetch today's campaign insights."""
    from scheduled.fetch_insights import run_fetch_insights
    run_fetch_insights()


@scheduler_fn.on_schedule(
    schedule="0 * * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_fetch_structures(event: scheduler_fn.ScheduledEvent) -> None:
    """Every hour: sync campaign/adset/ad structures."""
    from scheduled.fetch_structures import run_fetch_structures
    run_fetch_structures()


@scheduler_fn.on_schedule(
    schedule="0 */6 * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_fetch_breakdowns(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 6 hours: fetch demographic and placement breakdowns."""
    from scheduled.fetch_breakdowns import run_fetch_breakdowns
    run_fetch_breakdowns()


@scheduler_fn.on_schedule(
    schedule="*/15 * * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,
)
def scheduled_check_alerts(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 15 minutes: run alert detection engine."""
    from scheduled.check_alerts import run_check_alerts
    run_check_alerts()


@scheduler_fn.on_schedule(
    schedule="0 8 * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,
)
def scheduled_daily_report(event: scheduler_fn.ScheduledEvent) -> None:
    """Daily at 8 AM: generate and send daily report."""
    from scheduled.daily_report import run_daily_report
    run_daily_report()


@scheduler_fn.on_schedule(
    schedule="0 8 * * 1",
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,
)
def scheduled_weekly_report(event: scheduler_fn.ScheduledEvent) -> None:
    """Monday at 8 AM: generate and send weekly report."""
    from scheduled.weekly_report import run_weekly_report
    run_weekly_report()


@scheduler_fn.on_schedule(
    schedule="0 */4 * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_generate_recommendations(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 4 hours: generate fresh AI recommendations for active accounts."""
    from scheduled.generate_recommendations import run_generate_recommendations
    run_generate_recommendations()


@scheduler_fn.on_schedule(
    schedule="0 7 * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_morning_strategist(event: scheduler_fn.ScheduledEvent) -> None:
    """Daily at 07:00 AM: Morning Strategist — growth, creative refresh, A/B testing."""
    from scheduled.morning_strategist import run_morning_strategist
    run_morning_strategist()


@scheduler_fn.on_schedule(
    schedule="0 18 * * *",
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
)
def scheduled_evening_guard(event: scheduler_fn.ScheduledEvent) -> None:
    """Daily at 18:00 PM: Evening Guard — budget pacing, bleeding ads, day-end safety."""
    from scheduled.evening_guard import run_evening_guard
    run_evening_guard()


@scheduler_fn.on_schedule(
    schedule="0 0 * * *",
    memory=options.MemoryOption.MB_256,
    timeout_sec=120,
)
def scheduled_token_refresh(event: scheduler_fn.ScheduledEvent) -> None:
    """Daily at midnight: check and refresh expiring Meta tokens."""
    from services.meta_auth import check_and_refresh_tokens
    from services.telegram_bot import TelegramNotifier

    expiring = check_and_refresh_tokens()
    if expiring:
        notifier = TelegramNotifier()
        for acc in expiring:
            msg = (
                f"⚠️ *Token Expiry Warning*\n\n"
                f"Account: {acc['accountName']}\n"
                f"Expires in: {acc['daysUntilExpiry']} days\n"
                f"Please reconnect if auto-refresh failed."
            )
            notifier.send_message(msg)
