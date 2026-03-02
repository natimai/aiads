import logging
from datetime import datetime, timedelta
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from utils.rate_limiter import with_retry, rate_limiter

logger = logging.getLogger(__name__)

INSIGHT_FIELDS = [
    "campaign_id", "campaign_name",
    "adset_id", "adset_name",
    "ad_id", "ad_name",
    "spend", "impressions", "clicks", "ctr", "cpm", "cpc",
    "actions", "action_values", "cost_per_action_type",
    "frequency", "reach",
]

CAMPAIGN_FIELDS = [
    "id", "name", "status", "effective_status", "objective",
    "daily_budget", "lifetime_budget", "budget_remaining",
    "start_time", "stop_time", "created_time", "updated_time",
]

ADSET_FIELDS = [
    "id", "name", "status", "effective_status",
    "daily_budget", "lifetime_budget", "bid_strategy", "bid_amount",
    "targeting", "optimization_goal",
    "start_time", "end_time", "created_time", "updated_time",
]

AD_FIELDS = [
    "id", "name", "status", "effective_status",
    "creative", "created_time", "updated_time",
]

BREAKDOWN_TYPES = {
    "demographic": ["age", "gender"],
    "platform": ["publisher_platform"],
    "placement": ["platform_position"],
    "device": ["device_platform"],
    "hourly": ["hourly_stats_aggregated_by_advertiser_time_zone"],
    "country": ["country"],
}


class MetaAPIService:
    """Wrapper around the Meta Marketing API with rate limiting and batch support."""

    def __init__(self, access_token: str, account_id: str, app_id: str = None, app_secret: str = None):
        self.account_id = account_id
        self.access_token = access_token
        if app_id and app_secret:
            FacebookAdsApi.init(app_id, app_secret, access_token)
        else:
            FacebookAdsApi.init(access_token=access_token)
        self.account = AdAccount(f"act_{account_id}")

    @with_retry
    def get_campaigns(self) -> list[dict]:
        campaigns = self.account.get_campaigns(fields=CAMPAIGN_FIELDS)
        return [self._serialize_campaign(c) for c in campaigns]

    @with_retry
    def get_adsets(self, campaign_id: str = None) -> list[dict]:
        params = {}
        if campaign_id:
            params["filtering"] = [{"field": "campaign.id", "operator": "EQUAL", "value": campaign_id}]
        adsets = self.account.get_ad_sets(fields=ADSET_FIELDS, params=params)
        return [self._serialize_adset(a) for a in adsets]

    @with_retry
    def get_ads(self, adset_id: str = None) -> list[dict]:
        params = {}
        if adset_id:
            params["filtering"] = [{"field": "adset.id", "operator": "EQUAL", "value": adset_id}]
        ads = self.account.get_ads(fields=AD_FIELDS)
        return [self._serialize_ad(a) for a in ads]

    @with_retry
    def get_insights(
        self, date_from: str = None, date_to: str = None, level: str = "campaign"
    ) -> list[dict]:
        if not date_from:
            date_from = datetime.utcnow().strftime("%Y-%m-%d")
        if not date_to:
            date_to = date_from

        params = {
            "time_range": {"since": date_from, "until": date_to},
            "level": level,
            "time_increment": 1,
        }
        insights = self.account.get_insights(fields=INSIGHT_FIELDS, params=params)
        return [self._serialize_insight(i) for i in insights]

    @with_retry
    def get_insights_with_breakdowns(
        self, breakdown_type: str, date_from: str = None, date_to: str = None
    ) -> list[dict]:
        if not date_from:
            date_from = datetime.utcnow().strftime("%Y-%m-%d")
        if not date_to:
            date_to = date_from

        breakdowns = BREAKDOWN_TYPES.get(breakdown_type, [])
        if not breakdowns:
            raise ValueError(f"Unknown breakdown type: {breakdown_type}")

        params = {
            "time_range": {"since": date_from, "until": date_to},
            "level": "campaign",
            "breakdowns": breakdowns,
            "time_increment": 1,
        }
        insights = self.account.get_insights(fields=INSIGHT_FIELDS, params=params)
        return [self._serialize_insight(i, include_breakdowns=True) for i in insights]

    @with_retry
    def get_ad_creative_preview(self, ad_id: str) -> dict | None:
        try:
            ad = Ad(ad_id)
            previews = ad.get_previews(params={"ad_format": "DESKTOP_FEED_STANDARD"})
            if previews:
                return {"ad_id": ad_id, "preview_html": previews[0].get("body", "")}
        except Exception as e:
            logger.warning(f"Failed to get preview for ad {ad_id}: {e}")
        return None

    @with_retry
    def pause_campaign(self, campaign_id: str) -> bool:
        campaign = Campaign(campaign_id)
        campaign.api_update(params={"status": Campaign.Status.paused})
        return True

    @with_retry
    def resume_campaign(self, campaign_id: str) -> bool:
        campaign = Campaign(campaign_id)
        campaign.api_update(params={"status": Campaign.Status.active})
        return True

    @with_retry
    def pause_adset(self, adset_id: str) -> bool:
        adset = AdSet(adset_id)
        adset.api_update(params={"status": AdSet.Status.paused})
        return True

    @with_retry
    def resume_adset(self, adset_id: str) -> bool:
        adset = AdSet(adset_id)
        adset.api_update(params={"status": AdSet.Status.active})
        return True

    @with_retry
    def update_campaign_daily_budget(self, campaign_id: str, daily_budget: int) -> bool:
        campaign = Campaign(campaign_id)
        campaign.api_update(params={"daily_budget": int(daily_budget)})
        return True

    @with_retry
    def update_adset_daily_budget(self, adset_id: str, daily_budget: int) -> bool:
        adset = AdSet(adset_id)
        adset.api_update(params={"daily_budget": int(daily_budget)})
        return True

    @with_retry
    def create_campaign(self, *, name: str, objective: str, status: str = "PAUSED") -> str:
        params = {
            "name": name,
            "objective": objective,
            "status": status,
            "special_ad_categories": [],
        }
        created = self.account.create_campaign(params=params)
        return str(created.get("id"))

    @with_retry
    def create_adset(
        self,
        *,
        campaign_id: str,
        name: str,
        daily_budget: int,
        targeting: dict,
        optimization_goal: str = "OFFSITE_CONVERSIONS",
        billing_event: str = "IMPRESSIONS",
        status: str = "PAUSED",
    ) -> str:
        params = {
            "name": name,
            "campaign_id": campaign_id,
            "daily_budget": int(daily_budget),
            "targeting": targeting,
            "optimization_goal": optimization_goal,
            "billing_event": billing_event,
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
            "status": status,
        }
        created = self.account.create_ad_set(params=params)
        return str(created.get("id"))

    @with_retry
    def create_ad_creative(
        self,
        *,
        name: str,
        page_id: str,
        message: str,
        link: str,
        headline: str,
    ) -> str:
        params = {
            "name": name,
            "object_story_spec": {
                "page_id": page_id,
                "link_data": {
                    "message": message,
                    "link": link,
                    "name": headline,
                },
            },
        }
        created = self.account.create_ad_creative(params=params)
        return str(created.get("id"))

    @with_retry
    def create_ad(self, *, adset_id: str, name: str, creative_id: str, status: str = "PAUSED") -> str:
        params = {
            "name": name,
            "adset_id": adset_id,
            "creative": {"creative_id": creative_id},
            "status": status,
        }
        created = self.account.create_ad(params=params)
        return str(created.get("id"))

    def _serialize_campaign(self, c) -> dict:
        data = dict(c)
        return {
            "metaCampaignId": data.get("id"),
            "name": data.get("name"),
            "status": data.get("effective_status", data.get("status")),
            "objective": data.get("objective"),
            "dailyBudget": self._safe_float(data.get("daily_budget")),
            "lifetimeBudget": self._safe_float(data.get("lifetime_budget")),
            "budgetRemaining": self._safe_float(data.get("budget_remaining")),
            "startTime": data.get("start_time"),
            "stopTime": data.get("stop_time"),
        }

    def _serialize_adset(self, a) -> dict:
        data = dict(a)
        targeting = data.get("targeting", {})
        targeting_summary = ""
        if isinstance(targeting, dict):
            geo = targeting.get("geo_locations", {})
            countries = geo.get("countries", []) if isinstance(geo, dict) else []
            targeting_summary = ", ".join(countries) if countries else "Broad"

        return {
            "metaAdsetId": data.get("id"),
            "name": data.get("name"),
            "status": data.get("effective_status", data.get("status")),
            "dailyBudget": self._safe_float(data.get("daily_budget")),
            "lifetimeBudget": self._safe_float(data.get("lifetime_budget")),
            "bidStrategy": data.get("bid_strategy"),
            "targetingSummary": targeting_summary,
            "optimizationGoal": data.get("optimization_goal"),
        }

    def _serialize_ad(self, a) -> dict:
        data = dict(a)
        creative = data.get("creative", {})
        return {
            "metaAdId": data.get("id"),
            "name": data.get("name"),
            "status": data.get("effective_status", data.get("status")),
            "creativeId": creative.get("id") if isinstance(creative, dict) else None,
            "creativeThumbnailUrl": None,
        }

    def _serialize_insight(self, i, include_breakdowns: bool = False) -> dict:
        data = dict(i)
        result = {
            "date": data.get("date_start"),
            "spend": self._safe_float(data.get("spend")),
            "impressions": int(data.get("impressions", 0)),
            "clicks": int(data.get("clicks", 0)),
            "ctr": self._safe_float(data.get("ctr")),
            "cpm": self._safe_float(data.get("cpm")),
            "cpc": self._safe_float(data.get("cpc")),
            "frequency": self._safe_float(data.get("frequency")),
            "reach": int(data.get("reach", 0)),
            "campaignId": data.get("campaign_id"),
            "campaignName": data.get("campaign_name"),
            "adsetId": data.get("adset_id"),
            "adsetName": data.get("adset_name"),
            "adId": data.get("ad_id"),
            "adName": data.get("ad_name"),
        }

        actions = data.get("actions", [])
        action_values = data.get("action_values", [])
        cost_per_action = data.get("cost_per_action_type", [])

        result["leads"] = self._extract_action(actions, "lead") or self._extract_action(actions, "onsite_conversion.lead_grouped")
        result["linkClicks"] = self._extract_action(actions, "link_click")
        result["pageEngagement"] = self._extract_action(actions, "page_engagement")
        result["postEngagement"] = self._extract_action(actions, "post_engagement")
        result["installs"] = self._extract_action(actions, "app_install")
        result["purchases"] = self._extract_action(actions, "purchase")
        result["purchaseValue"] = self._extract_action(action_values, "purchase")

        result["costPerLead"] = self._extract_action(cost_per_action, "lead") or self._extract_action(cost_per_action, "onsite_conversion.lead_grouped")
        result["costPerLinkClick"] = self._extract_action(cost_per_action, "link_click")
        result["cpi"] = self._extract_action(cost_per_action, "app_install")
        result["cpa"] = self._extract_action(cost_per_action, "purchase")

        spend = result["spend"]
        purchase_value = result["purchaseValue"]
        result["roas"] = round(purchase_value / spend, 4) if spend and spend > 0 else 0.0

        result["actionsJson"] = actions

        if include_breakdowns:
            for key in ["age", "gender", "publisher_platform", "platform_position", "device_platform",
                        "hourly_stats_aggregated_by_advertiser_time_zone", "country"]:
                if key in data:
                    result[key] = data[key]

        return result

    @staticmethod
    def _extract_action(actions: list, action_type: str) -> float:
        if not actions or not isinstance(actions, list):
            return 0.0
        for action in actions:
            if isinstance(action, dict) and action.get("action_type") == action_type:
                return float(action.get("value", 0))
        return 0.0

    @staticmethod
    def _safe_float(val) -> float:
        try:
            return float(val) if val is not None else 0.0
        except (ValueError, TypeError):
            return 0.0
