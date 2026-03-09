import logging
from datetime import datetime
from typing import Any
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.targetingsearch import TargetingSearch
from utils.rate_limiter import with_retry

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
    "id", "name", "status", "effective_status", "campaign_id",
    "daily_budget", "lifetime_budget", "bid_strategy", "bid_amount",
    "targeting", "optimization_goal", "billing_event", "promoted_object",
    "start_time", "end_time", "created_time", "updated_time",
]

AD_FIELDS = [
    "id", "name", "status", "effective_status",
    "creative", "created_time", "updated_time",
]

BREAKDOWN_TYPES = {
    "age": ["age"],
    "gender": ["gender"],
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
        ads = self.account.get_ads(fields=AD_FIELDS, params=params)
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
        self,
        breakdown_type: str,
        date_from: str = None,
        date_to: str = None,
        *,
        level: str = "campaign",
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
            "level": level,
            "breakdowns": breakdowns,
            "time_increment": 1,
        }
        insights = self.account.get_insights(fields=INSIGHT_FIELDS, params=params)
        return [self._serialize_insight(i, include_breakdowns=True) for i in insights]

    @with_retry
    def clone_adset_for_ab_test(
        self,
        *,
        control_adset_id: str,
        variant_settings: dict,
        recommended_test_budget: int,
        status: str = "ACTIVE",
    ) -> dict:
        """Duplicate an Ad Set, apply variant targeting, and publish it as active."""
        if not control_adset_id:
            raise ValueError("control_adset_id is required")

        base_adset = AdSet(control_adset_id)
        budget = max(1, int(recommended_test_budget or 1))
        variant_settings = variant_settings if isinstance(variant_settings, dict) else {}

        copy_method = getattr(base_adset, "create_copy", None)
        if callable(copy_method):
            try:
                copied = copy_method(params={"deep_copy": True})
                copied_id = self._extract_id(copied)
                if copied_id:
                    copy_obj = AdSet(copied_id)
                    source = dict(base_adset.api_get(fields=ADSET_FIELDS))
                    update_params = self._build_ab_test_update_params(
                        source=source,
                        variant_settings=variant_settings,
                        recommended_test_budget=budget,
                        status=status,
                    )
                    copy_obj.api_update(params=update_params)
                    return {
                        "controlAdsetId": control_adset_id,
                        "variantAdsetId": copied_id,
                        "recommendedTestBudget": budget,
                        "status": status,
                        "usedCopyEndpoint": True,
                    }
            except Exception as exc:
                logger.warning("AdSet copy endpoint failed for %s: %s", control_adset_id, exc)

        source = dict(base_adset.api_get(fields=ADSET_FIELDS))
        create_params = self._build_adset_clone_params(
            source=source,
            variant_settings=variant_settings,
            recommended_test_budget=budget,
            status=status,
        )
        created = self.account.create_ad_set(params=create_params)
        variant_adset_id = str(created.get("id"))
        return {
            "controlAdsetId": control_adset_id,
            "variantAdsetId": variant_adset_id,
            "recommendedTestBudget": budget,
            "status": status,
            "usedCopyEndpoint": False,
        }

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
    def create_campaign(
        self,
        *,
        name: str,
        objective: str,
        status: str = "PAUSED",
        is_adset_budget_sharing_enabled: bool = False,
    ) -> str:
        params = {
            "name": name,
            "objective": objective,
            "status": status,
            "special_ad_categories": [],
            "is_adset_budget_sharing_enabled": bool(is_adset_budget_sharing_enabled),
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
        resolved_targeting = self._resolve_targeting_interests(targeting)
        params = {
            "name": name,
            "campaign_id": campaign_id,
            "daily_budget": int(daily_budget),
            "targeting": resolved_targeting,
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
        targeting_summary = "Broad"
        interests = self._extract_interests_from_targeting(targeting)
        custom_audiences = self._extract_custom_audiences_from_targeting(targeting)
        if isinstance(targeting, dict):
            if interests:
                targeting_summary = ", ".join(interests[:3])
            geo = targeting.get("geo_locations", {})
            countries = geo.get("countries", []) if isinstance(geo, dict) else []
            if not interests and countries:
                targeting_summary = ", ".join(countries)

        return {
            "metaAdsetId": data.get("id"),
            "campaignId": data.get("campaign_id"),
            "name": data.get("name"),
            "status": data.get("effective_status", data.get("status")),
            "dailyBudget": self._safe_float(data.get("daily_budget")),
            "lifetimeBudget": self._safe_float(data.get("lifetime_budget")),
            "bidStrategy": data.get("bid_strategy"),
            "billingEvent": data.get("billing_event"),
            "targetingSummary": targeting_summary,
            "targeting": targeting if isinstance(targeting, dict) else {},
            "interests": interests,
            "customAudiences": custom_audiences,
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

    @staticmethod
    def _extract_id(payload: Any) -> str:
        if isinstance(payload, dict):
            return str(payload.get("id") or "")
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict) and item.get("id"):
                    return str(item.get("id"))
                if hasattr(item, "get") and item.get("id"):
                    return str(item.get("id"))
        if hasattr(payload, "get"):
            return str(payload.get("id") or "")
        return ""

    @staticmethod
    def _extract_interests_from_targeting(targeting: Any) -> list[str]:
        if not isinstance(targeting, dict):
            return []
        names: list[str] = []

        direct_interests = targeting.get("interests")
        if isinstance(direct_interests, list):
            for item in direct_interests:
                if isinstance(item, dict):
                    name = str(item.get("name") or "").strip()
                    if name:
                        names.append(name)
                elif isinstance(item, str) and item.strip():
                    names.append(item.strip())

        flexible_spec = targeting.get("flexible_spec")
        if isinstance(flexible_spec, list):
            for group in flexible_spec:
                if not isinstance(group, dict):
                    continue
                group_interests = group.get("interests")
                if isinstance(group_interests, list):
                    for item in group_interests:
                        if isinstance(item, dict):
                            name = str(item.get("name") or "").strip()
                            if name:
                                names.append(name)
                        elif isinstance(item, str) and item.strip():
                            names.append(item.strip())

        seen: set[str] = set()
        unique: list[str] = []
        for name in names:
            lowered = name.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            unique.append(name)
        return unique[:20]

    def _resolve_targeting_interests(self, targeting: dict[str, Any]) -> dict[str, Any]:
        payload = dict(targeting) if isinstance(targeting, dict) else {}
        interests_raw = payload.get("interests")
        if not isinstance(interests_raw, list) or not interests_raw:
            return payload

        resolved: list[dict[str, str]] = []
        unresolved: list[str] = []

        for item in interests_raw:
            if isinstance(item, dict):
                interest_id = str(item.get("id") or "").strip()
                interest_name = str(item.get("name") or "").strip()
                if interest_id:
                    resolved.append({"id": interest_id, "name": interest_name or interest_id})
                    continue
                lookup_name = interest_name
            else:
                lookup_name = str(item or "").strip()

            if not lookup_name:
                continue
            match = self._find_interest_by_name(lookup_name)
            if match:
                resolved.append(match)
            else:
                unresolved.append(lookup_name)

        if resolved:
            payload["interests"] = resolved
        else:
            payload.pop("interests", None)

        if unresolved:
            logger.warning("Dropping unresolved interests from targeting: %s", unresolved[:10])
        return payload

    @with_retry
    def _find_interest_by_name(self, interest_name: str) -> dict[str, str] | None:
        query = str(interest_name or "").strip()
        if not query:
            return None

        results = TargetingSearch.search(params={"q": query, "type": "adinterest", "limit": 25})
        if not isinstance(results, list) or not results:
            return None

        normalized_query = query.casefold()
        selected: dict[str, Any] | None = None

        for row in results:
            if isinstance(row, dict):
                candidate = row
            else:
                try:
                    candidate = dict(row)
                except Exception:
                    continue
            candidate_id = str(candidate.get("id") or "").strip()
            if not candidate_id:
                continue
            candidate_name = str(candidate.get("name") or "").strip()
            if candidate_name.casefold() == normalized_query:
                selected = candidate
                break
            if selected is None:
                selected = candidate

        if not selected:
            return None
        selected_id = str(selected.get("id") or "").strip()
        if not selected_id:
            return None
        return {
            "id": selected_id,
            "name": str(selected.get("name") or query).strip(),
        }

    @staticmethod
    def _extract_custom_audiences_from_targeting(targeting: Any) -> list[str]:
        if not isinstance(targeting, dict):
            return []
        custom = targeting.get("custom_audiences")
        if not isinstance(custom, list):
            return []
        values: list[str] = []
        for item in custom:
            if isinstance(item, dict):
                value = str(item.get("id") or "").strip()
                if value:
                    values.append(value)
            elif isinstance(item, str) and item.strip():
                values.append(item.strip())
        return values[:20]

    def _build_ab_test_update_params(
        self,
        *,
        source: dict[str, Any],
        variant_settings: dict[str, Any],
        recommended_test_budget: int,
        status: str,
    ) -> dict[str, Any]:
        targeting = self._apply_variant_to_targeting(source.get("targeting"), variant_settings)
        params: dict[str, Any] = {
            "name": f"{source.get('name', 'AdSet')} | AB Variant",
            "status": status,
            "targeting": targeting,
            "daily_budget": int(recommended_test_budget),
        }
        return params

    def _build_adset_clone_params(
        self,
        *,
        source: dict[str, Any],
        variant_settings: dict[str, Any],
        recommended_test_budget: int,
        status: str,
    ) -> dict[str, Any]:
        campaign_id = str(source.get("campaign_id") or "")
        if not campaign_id:
            raise ValueError("Source ad set missing campaign_id")

        targeting = self._apply_variant_to_targeting(source.get("targeting"), variant_settings)
        params: dict[str, Any] = {
            "name": f"{source.get('name', 'AdSet')} | AB Variant",
            "campaign_id": campaign_id,
            "targeting": targeting,
            "status": status,
            "daily_budget": int(recommended_test_budget),
            "optimization_goal": source.get("optimization_goal") or "OFFSITE_CONVERSIONS",
            "billing_event": source.get("billing_event") or "IMPRESSIONS",
        }

        if source.get("bid_strategy"):
            params["bid_strategy"] = source.get("bid_strategy")
        if source.get("bid_amount"):
            params["bid_amount"] = source.get("bid_amount")
        if source.get("promoted_object"):
            params["promoted_object"] = source.get("promoted_object")
        if source.get("start_time"):
            params["start_time"] = source.get("start_time")
        if source.get("end_time"):
            params["end_time"] = source.get("end_time")
        return params

    @staticmethod
    def _apply_variant_to_targeting(targeting: Any, variant_settings: dict[str, Any]) -> dict[str, Any]:
        base = dict(targeting) if isinstance(targeting, dict) else {}

        if "custom_audiences" in variant_settings:
            raw_custom = variant_settings.get("custom_audiences")
            custom_payload = []
            if isinstance(raw_custom, list):
                for item in raw_custom:
                    if isinstance(item, dict):
                        custom_payload.append(item)
                    elif isinstance(item, str) and item.strip():
                        custom_payload.append({"id": item.strip()})
            base["custom_audiences"] = custom_payload

        if "interests" in variant_settings:
            raw_interests = variant_settings.get("interests")
            if isinstance(raw_interests, list) and len(raw_interests) == 0:
                base.pop("interests", None)
                base.pop("flexible_spec", None)
            elif isinstance(raw_interests, list):
                interest_payload = []
                for item in raw_interests:
                    if isinstance(item, dict):
                        interest_payload.append(item)
                    elif isinstance(item, str) and item.strip():
                        interest_payload.append({"name": item.strip()})
                if interest_payload:
                    base["interests"] = interest_payload

        for key, value in variant_settings.items():
            if key in {"custom_audiences", "interests"}:
                continue
            base[key] = value
        return base
