"""Scheduled function: Generate and send daily report."""
import logging
from datetime import datetime, timezone
from services.report_generator import ReportGenerator
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def run_daily_report():
    """Generate and deliver daily report for all users with enabled report configs."""
    db = get_db()
    generator = ReportGenerator()

    from google.cloud.firestore_v1.base_query import FieldFilter
    configs = (
        db.collection("reportConfigs")
        .where(filter=FieldFilter("reportType", "==", "daily"))
        .where(filter=FieldFilter("enabled", "==", True))
        .stream()
    )

    user_ids_processed = set()

    for config_doc in configs:
        config = config_doc.to_dict()
        user_id = config.get("userId")
        if not user_id or user_id in user_ids_processed:
            continue

        try:
            result = generator.generate(db, user_id, "daily")

            db.collection("users").document(user_id).collection("reports").add({
                "type": "daily",
                "content": result.get("content", ""),
                "status": "completed",
                "createdAt": datetime.now(timezone.utc),
                "deliveredTo": result.get("deliveredTo", []),
            })

            user_ids_processed.add(user_id)
            logger.info(f"Daily report generated for user {user_id}")

        except Exception as e:
            logger.error(f"Daily report failed for user {user_id}: {e}")
