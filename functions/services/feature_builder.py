"""Build normalized recommendation features from Firestore data."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


class FeatureBuilder:
    """Build campaign/account feature payload used by recommendation engines."""

    def __init__(self, db):
        self.db = db

    def build(self, user_id: str, account_id: str, date_from: str, date_to: str) -> dict[str, Any]:
        base_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
        )

        account_doc = base_ref.get()
        account_data = account_doc.to_dict() if account_doc.exists else {}

        campaigns = []
        for campaign_doc in base_ref.collection("campaigns").stream():
            campaign_data = {"id": campaign_doc.id, **(campaign_doc.to_dict() or {})}
            insights = self._load_campaign_insights(campaign_doc.reference, date_from, date_to)
            campaign_data["insights"] = insights
            campaign_data["aggregates"] = self._aggregate_insights(insights)
            campaigns.append(campaign_data)

        return {
            "userId": user_id,
            "accountId": account_id,
            "accountName": account_data.get("accountName", ""),
            "currency": account_data.get("currency", "USD"),
            "kpiSummary": account_data.get("kpiSummary", {}),
            "kpiUpdatedAt": self._serialize_ts(account_data.get("kpiUpdatedAt")),
            "dateRange": {"from": date_from, "to": date_to},
            "campaigns": campaigns,
            "breakdowns": self._load_breakdowns(base_ref, date_from),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def _load_campaign_insights(self, campaign_ref, date_from: str, date_to: str) -> list[dict[str, Any]]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        insights_ref = campaign_ref.collection("insights")
        docs = (
            insights_ref.where(filter=FieldFilter("date", ">=", date_from))
            .where(filter=FieldFilter("date", "<=", date_to))
            .order_by("date")
            .stream()
        )

        insights: list[dict[str, Any]] = []
        for doc in docs:
            payload = {"id": doc.id, **(doc.to_dict() or {})}
            for key, value in list(payload.items()):
                payload[key] = self._serialize_ts(value)
            insights.append(payload)
        return insights

    def _load_breakdowns(self, base_ref, date_from: str) -> list[dict[str, Any]]:
        """Load latest breakdown snapshots for coarse audience context."""
        breakdowns: list[dict[str, Any]] = []
        for doc in base_ref.collection("breakdowns").stream():
            data = doc.to_dict() or {}
            if not data.get("date") or data.get("date") < date_from:
                continue
            breakdowns.append(
                {
                    "id": doc.id,
                    "type": data.get("type"),
                    "date": data.get("date"),
                    "data": data.get("data", [])[:150],
                }
            )
        return breakdowns

    @staticmethod
    def _aggregate_insights(insights: list[dict[str, Any]]) -> dict[str, Any]:
        if not insights:
            return {
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "installs": 0,
                "purchases": 0,
                "purchaseValue": 0.0,
                "roas": 0.0,
                "ctr": 0.0,
                "cpi": 0.0,
                "frequency": 0.0,
                "daysWithData": 0,
            }

        totals = {
            "spend": sum(float(x.get("spend", 0) or 0) for x in insights),
            "impressions": sum(int(x.get("impressions", 0) or 0) for x in insights),
            "clicks": sum(int(x.get("clicks", 0) or 0) for x in insights),
            "installs": sum(float(x.get("installs", 0) or 0) for x in insights),
            "purchases": sum(float(x.get("purchases", 0) or 0) for x in insights),
            "purchaseValue": sum(float(x.get("purchaseValue", 0) or 0) for x in insights),
            "frequency": sum(float(x.get("frequency", 0) or 0) for x in insights),
            "daysWithData": len(insights),
        }
        totals["roas"] = round(totals["purchaseValue"] / totals["spend"], 4) if totals["spend"] > 0 else 0.0
        totals["ctr"] = round((totals["clicks"] / totals["impressions"]) * 100, 4) if totals["impressions"] > 0 else 0.0
        totals["cpi"] = round(totals["spend"] / totals["installs"], 4) if totals["installs"] > 0 else 0.0
        totals["frequency"] = round(totals["frequency"] / totals["daysWithData"], 4) if totals["daysWithData"] > 0 else 0.0
        return totals

    @staticmethod
    def _serialize_ts(value: Any) -> Any:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        if isinstance(value, dict):
            return {k: FeatureBuilder._serialize_ts(v) for k, v in value.items()}
        if isinstance(value, list):
            return [FeatureBuilder._serialize_ts(v) for v in value]
        return value
