"""AI Campaign Builder service: draft generation, regeneration, preflight safety, and publish."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any

from services.ai_analyzer import AIAnalyzer

logger = logging.getLogger(__name__)

DEFAULT_OBJECTIVE = "OUTCOME_SALES"
BUDGET_SAFETY_ERROR = "Budget exceeds safety limits. Please edit the budget block."
ALLOWED_BLOCK_TYPES = {"campaignPlan", "audiencePlan", "creativePlan", "reasoning"}
CAMPAIGN_BUILDER_STRICT_RULES = (
    "RULE 1 (PRODUCT IS KING): You MUST write the campaign specifically for the PRODUCT/OFFER provided by the user. "
    "DO NOT write generic marketing copy. DO NOT talk about 'ROAS' or 'Performance' unless the product is a B2B marketing service.",
    "RULE 2 (LANGUAGE): If the LANGUAGE is set to 'עברית' (Hebrew) or any other language, ALL fields inside creative_plan "
    "(primary texts, headlines) MUST be 100% in that language. No English exceptions.",
    "RULE 3 (AUDIENCE LOGIC): The interests must directly relate to the specific product/offer. "
    "Do not suggest 'Online Shopping' for an Insurance campaign. When generating interests, use short, valid Meta targeting categories only.",
    "RULE 4 (NO PARROTING): DO NOT copy and paste the raw Product/Offer text into output fields. "
    "Understand the brief and write original, concise copy.",
    "RULE 5 (STRICT LANGUAGE ENFORCEMENT): The ENTIRE creative_plan output (every word in primaryTexts and headlines) "
    "MUST be natively written in the requested language.",
)
BLOCK_TYPE_ALIASES = {
    "campaignplan": "campaignPlan",
    "campaign_plan": "campaignPlan",
    "campaign": "campaignPlan",
    "setup": "campaignPlan",
    "strategy": "campaignPlan",
    "strategysetup": "campaignPlan",
    "audienceplan": "audiencePlan",
    "audience_plan": "audiencePlan",
    "audience": "audiencePlan",
    "creativeplan": "creativePlan",
    "creative_plan": "creativePlan",
    "creative": "creativePlan",
    "reasoning": "reasoning",
    "strategy_note": "reasoning",
}


class ValidationError(ValueError):
    """User-facing validation errors that should block publish."""


class CampaignBuilderService:
    def __init__(self, db):
        self.db = db
        self.ai = AIAnalyzer()

    def create_draft(
        self,
        *,
        user_id: str,
        account_id: str,
        inputs: dict[str, Any],
        origin: str = "manual",
        opportunity_theme: str = "",
    ) -> tuple[str, dict[str, Any]]:
        self._ensure_account_exists(user_id, account_id)
        inputs = self._normalize_inputs(inputs)
        context = self._build_context(user_id=user_id, account_id=account_id, inputs=inputs)
        blocks = self.ai.generate_campaign_builder_draft(context)
        blocks = self._repair_initial_full_draft_blocks_with_llm(
            context=context,
            blocks=blocks,
            inputs=inputs,
        )
        blocks = self._normalize_blocks(blocks, inputs)
        validation = self._validate_blocks(blocks, inputs)
        status = "ready_for_publish" if validation["isValid"] else "draft"

        now = datetime.now(timezone.utc)
        draft = {
            "userId": user_id,
            "accountId": account_id,
            "origin": origin,
            "opportunityTheme": opportunity_theme,
            "inputs": inputs,
            "blocks": blocks,
            "benchmarkSnapshot": context.get("benchmarkSnapshot", {}),
            "validation": validation,
            "safety": {},
            "status": status,
            "publishedMetaIds": {},
            "createdAt": now,
            "updatedAt": now,
        }

        draft_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("campaignDrafts")
            .document()
        )
        draft_ref.set(draft)
        return draft_ref.id, {"id": draft_ref.id, **self._serialize(draft)}

    def get_draft(self, *, user_id: str, account_id: str, draft_id: str) -> dict[str, Any]:
        self._ensure_account_exists(user_id, account_id)
        draft_doc = self._draft_ref(user_id, account_id, draft_id).get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")
        payload = draft_doc.to_dict() or {}
        payload["id"] = draft_doc.id
        return self._serialize(payload)

    def regenerate_block(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
        block_type: str,
        instruction: str = "",
    ) -> dict[str, Any]:
        self._ensure_account_exists(user_id, account_id)
        block_type = self._normalize_block_type(block_type)
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise ValueError(f"Unsupported blockType: {block_type}")

        draft_ref = self._draft_ref(user_id, account_id, draft_id)
        draft_doc = draft_ref.get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")

        draft = draft_doc.to_dict() or {}
        blocks = draft.get("blocks", {})
        inputs = self._normalize_inputs(draft.get("inputs", {}), blocks=blocks)
        context = self._build_context(user_id=user_id, account_id=account_id, inputs=inputs)

        regenerated = self.ai.regenerate_campaign_builder_block(
            context,
            current_blocks=blocks,
            block_type=block_type,
            instruction=instruction,
        )

        next_blocks = dict(blocks)
        next_blocks[block_type] = regenerated.get(block_type, blocks.get(block_type))
        next_blocks = self._normalize_blocks(next_blocks, inputs)
        validation = self._validate_blocks(next_blocks, inputs)

        update = {
            "inputs": inputs,
            "blocks": next_blocks,
            "validation": validation,
            "status": "ready_for_publish" if validation["isValid"] else "draft",
            "updatedAt": datetime.now(timezone.utc),
        }
        draft_ref.update(update)

        merged = {**draft, **update, "id": draft_id}
        return self._serialize(merged)

    def update_block(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
        block_type: str,
        value: Any,
    ) -> dict[str, Any]:
        """Persist manual block edits from UI without invoking AI regeneration."""
        self._ensure_account_exists(user_id, account_id)
        block_type = self._normalize_block_type(block_type)
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise ValueError(f"Unsupported blockType: {block_type}")

        draft_ref = self._draft_ref(user_id, account_id, draft_id)
        draft_doc = draft_ref.get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")

        draft = draft_doc.to_dict() or {}
        blocks = draft.get("blocks", {})
        if not isinstance(blocks, dict):
            blocks = {}
        inputs = self._normalize_inputs(draft.get("inputs", {}), blocks=blocks)

        next_blocks = dict(blocks)
        if block_type == "reasoning":
            next_blocks[block_type] = str(value or "").strip()
        else:
            if not isinstance(value, dict):
                raise ValueError(f"{block_type} payload must be an object")
            current = next_blocks.get(block_type, {})
            if not isinstance(current, dict):
                current = {}
            next_blocks[block_type] = {**current, **value}

        next_blocks = self._normalize_blocks(next_blocks, inputs)
        validation = self._validate_blocks(next_blocks, inputs)
        update = {
            "inputs": inputs,
            "blocks": next_blocks,
            "validation": validation,
            "status": "ready_for_publish" if validation["isValid"] else "draft",
            "updatedAt": datetime.now(timezone.utc),
        }
        draft_ref.update(update)

        merged = {**draft, **update, "id": draft_id}
        return self._serialize(merged)

    def preflight(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
    ) -> dict[str, Any]:
        self._ensure_account_exists(user_id, account_id)
        draft_doc = self._draft_ref(user_id, account_id, draft_id).get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")

        draft = draft_doc.to_dict() or {}
        inputs = draft.get("inputs", {})
        blocks = draft.get("blocks", {})
        validation = self._validate_blocks(blocks, inputs)

        avg_daily_budget = self._compute_account_avg_daily_budget(user_id, account_id)
        campaign_plan = blocks.get("campaignPlan", {}) if isinstance(blocks, dict) else {}
        proposed_budget = float(campaign_plan.get("dailyBudget", 0) or 0)
        high_budget_threshold = avg_daily_budget * 10 if avg_daily_budget > 0 else 1000.0
        high_budget = bool(high_budget_threshold and proposed_budget >= high_budget_threshold)

        warnings = list(validation.get("warnings", []))
        errors = list(validation.get("errors", []))

        if high_budget:
            warnings.append(
                f"Budget is unusually high for this account: {proposed_budget:.2f} (avg {avg_daily_budget:.2f})."
            )

        # Meta API does not expose a universal dry-run flow for this object chain,
        # so we apply strict local validation and surface that explicitly.
        warnings.append("Meta dry-run validation is not available for this publish chain; used strict internal preflight.")

        safety_status = "blocked" if errors or high_budget else "passed"
        result = {
            "safetyStatus": safety_status,
            "warnings": warnings,
            "errors": errors,
            "requiresExplicitConfirm": high_budget,
            "budgetCheck": {
                "avgDailyBudget": round(avg_daily_budget, 2),
                "proposedDailyBudget": round(proposed_budget, 2),
                "threshold": round(high_budget_threshold, 2),
                "isOver10x": high_budget,
            },
        }

        self._draft_ref(user_id, account_id, draft_id).update(
            {
                "validation": validation,
                "safety": result,
                "status": "ready_for_publish" if validation["isValid"] else "draft",
                "updatedAt": datetime.now(timezone.utc),
            }
        )
        return result

    def publish_draft(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
        confirm_high_budget: bool,
    ) -> dict[str, Any]:
        self._ensure_account_exists(user_id, account_id)
        draft_ref = self._draft_ref(user_id, account_id, draft_id)
        draft_doc = draft_ref.get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")

        draft = draft_doc.to_dict() or {}
        if draft.get("status") == "published":
            raise ValueError("Draft already published")

        safety = self.preflight(user_id=user_id, account_id=account_id, draft_id=draft_id)
        if safety.get("errors"):
            raise ValueError("Preflight failed")

        blocks = draft.get("blocks", {})
        inputs = draft.get("inputs", {})
        campaign_plan = blocks.get("campaignPlan", {})
        audience_plan = blocks.get("audiencePlan", {})
        creative_plan = blocks.get("creativePlan", {})

        publish_ids: dict[str, Any] = {}
        account_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
        )
        account_doc = account_ref.get()
        account_data = account_doc.to_dict() if account_doc.exists else {}
        proposed_budget = float(campaign_plan.get("dailyBudget", 0) or 0)
        self._enforce_publish_budget_guardrail(
            user_id=user_id,
            account_id=account_id,
            account_data=account_data if isinstance(account_data, dict) else {},
            proposed_daily_budget=proposed_budget,
        )

        page_id = str(
            inputs.get("pageId")
            or account_data.get("defaultPageId")
            or account_data.get("pageId")
            or account_data.get("metaPageId")
            or ""
        ).strip()
        destination_url = str(
            inputs.get("destinationUrl")
            or account_data.get("defaultDestinationUrl")
            or account_data.get("websiteUrl")
            or "https://example.com"
        ).strip()
        if not page_id:
            raise ValueError("pageId is required for publish (set it in Step 1 advanced fields or account defaults)")
        if not destination_url:
            raise ValueError("destinationUrl is required for publish")

        from services.meta_api import MetaAPIService
        from services.meta_auth import get_decrypted_token

        try:
            token, _ = get_decrypted_token(user_id, account_id)
            api = MetaAPIService(access_token=token, account_id=account_id)
            campaign_id = api.create_campaign(
                name=str(campaign_plan.get("name") or inputs.get("campaignName") or "AI Campaign"),
                objective=str(campaign_plan.get("objective") or DEFAULT_OBJECTIVE),
                status="PAUSED",
            )
            publish_ids["campaignId"] = campaign_id

            adset_id = api.create_adset(
                campaign_id=campaign_id,
                name=str(audience_plan.get("name") or f"{campaign_plan.get('name', 'AI')} - AdSet"),
                daily_budget=self._to_minor_units(float(campaign_plan.get("dailyBudget", 0) or 0)),
                targeting=self._build_targeting_payload(audience_plan),
                optimization_goal=str(audience_plan.get("optimizationGoal") or "OFFSITE_CONVERSIONS"),
                billing_event=str(audience_plan.get("billingEvent") or "IMPRESSIONS"),
                status="PAUSED",
            )
            publish_ids["adsetId"] = adset_id

            ad_ids: list[str] = []
            primary_texts = creative_plan.get("primaryTexts") if isinstance(creative_plan.get("primaryTexts"), list) else []
            headlines = creative_plan.get("headlines") if isinstance(creative_plan.get("headlines"), list) else []
            message = str((primary_texts[0] if primary_texts else "Check out our latest offer") or "Check out our latest offer")
            headline = str((headlines[0] if headlines else campaign_plan.get("name", "New offer")) or "New offer")

            creative_id = api.create_ad_creative(
                name=f"{campaign_plan.get('name', 'AI Campaign')} - Creative",
                page_id=page_id,
                message=message,
                link=destination_url,
                headline=headline,
            )
            ad_id = api.create_ad(
                adset_id=adset_id,
                name=f"{campaign_plan.get('name', 'AI Campaign')} - Ad 1",
                creative_id=creative_id,
                status="PAUSED",
            )
            ad_ids.append(ad_id)
            publish_ids["adIds"] = ad_ids

        except Exception as exc:  # pragma: no cover - depends on external API
            logger.error("Campaign draft publish failed for %s/%s: %s", user_id, draft_id, exc, exc_info=True)
            draft_ref.update(
                {
                    "status": "draft",
                    "publishError": str(exc),
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
            raise ValueError(f"Publish failed: {exc}") from exc

        now = datetime.now(timezone.utc)
        draft_ref.update(
            {
                "status": "published",
                "publishedMetaIds": publish_ids,
                "publishedAt": now,
                "updatedAt": now,
                "safety": safety,
            }
        )

        watch_card_id = self._create_launch_watch_card(
            user_id=user_id,
            account_id=account_id,
            draft_id=draft_id,
            campaign_id=publish_ids.get("campaignId", ""),
            campaign_name=str(campaign_plan.get("name") or "AI Campaign"),
            objective=str(campaign_plan.get("objective") or DEFAULT_OBJECTIVE),
        )

        return {
            "campaignId": publish_ids.get("campaignId"),
            "adsetId": publish_ids.get("adsetId"),
            "adIds": publish_ids.get("adIds", []),
            "watchCardId": watch_card_id,
            "warnings": safety.get("warnings", []),
        }

    def create_ghost_draft_for_theme(
        self,
        *,
        user_id: str,
        account_id: str,
        opportunity_theme: str,
    ) -> tuple[str, str]:
        """Create a ghost draft and matching feed card, returns (draft_id, recommendation_id)."""
        inputs = {
            "objective": "OUTCOME_SALES",
            "offer": opportunity_theme,
            "country": "US",
            "language": "he",
            "dailyBudget": 100,
            "campaignName": f"AI Ghost: {opportunity_theme}",
        }
        draft_id, draft = self.create_draft(
            user_id=user_id,
            account_id=account_id,
            inputs=inputs,
            origin="ghost",
            opportunity_theme=opportunity_theme,
        )

        rec_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("recommendations")
            .document()
        )
        now = datetime.now(timezone.utc)
        rec_ref.set(
            {
                "type": "ghost_draft",
                "entityLevel": "account",
                "entityId": account_id,
                "title": "Scale Opportunity: New AI Campaign Draft Ready",
                "priority": "high",
                "confidence": 0.84,
                "expectedImpact": {
                    "metric": "roas",
                    "direction": "up",
                    "magnitudePct": 15,
                    "summary": "Fresh audience testing can sustain profitable scale while reducing fatigue.",
                },
                "why": "Profitable delivery is starting to fatigue; this is a proactive scale play.",
                "reasoning": "Your current campaigns are profitable but fatiguing. I pre-built a fresh campaign targeting a new Broad Audience with Nano Banana creatives.",
                "actionsDraft": ["Review AI Draft", "Adjust budget", "Validate audience", "Publish when ready"],
                "status": "pending",
                "executionPlan": {"action": "none", "targetLevel": "account", "targetId": account_id},
                "suggestedContent": {
                    "campaignPlan": draft.get("blocks", {}).get("campaignPlan", {}),
                    "audienceSuggestions": draft.get("blocks", {}).get("audiencePlan", {}).get("interests", [])[:6],
                },
                "metricsSnapshot": {},
                "uiDisplayText": "Review AI Draft",
                "proposedAction": {"action": "MANUAL_REVIEW", "entity_id": account_id, "value": "open_draft"},
                "createdAt": now,
                "expiresAt": now + timedelta(hours=24),
                "review": {},
                "source": "campaign_builder_ghost",
                "batchType": "PROACTIVE_DRAFT",
                "metadata": {
                    "draftId": draft_id,
                    "opportunityTheme": opportunity_theme,
                },
            }
        )

        self._write_task_record(
            user_id=user_id,
            account_id=account_id,
            task_id=rec_ref.id,
            payload={
                "type": "GHOST_DRAFT",
                "priority": "HIGH",
                "status": "PENDING",
                "title": "Scale Opportunity: New AI Campaign Draft Ready",
                "reasoning": "Your current campaigns are profitable but fatiguing. I pre-built a fresh campaign targeting a new Broad Audience with Nano Banana creatives.",
                "ui_display_text": "Review AI Draft",
                "batchType": "PROACTIVE_DRAFT",
                "metadata": {
                    "draftId": draft_id,
                    "opportunityTheme": opportunity_theme,
                },
                "source": "campaign_builder_ghost",
            },
        )
        return draft_id, rec_ref.id

    def _create_launch_watch_card(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
        campaign_id: str,
        campaign_name: str,
        objective: str,
    ) -> str:
        rec_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("recommendations")
            .document()
        )

        now = datetime.now(timezone.utc)
        rec_ref.set(
            {
                "type": "monitor_launch",
                "entityLevel": "campaign",
                "entityId": campaign_id,
                "title": f"Monitor Launch: {campaign_name}",
                "priority": "high",
                "confidence": 0.94,
                "expectedImpact": {
                    "metric": "spend",
                    "direction": "down",
                    "magnitudePct": 0,
                    "summary": "Protect launch quality and budget during the first 24h",
                },
                "why": "This campaign was launched via AI Builder.",
                "reasoning": "This campaign was launched via AI Builder. Monitor the first 24 hours for CPM spikes and initial conversions.",
                "actionsDraft": [
                    "Check Meta review status",
                    "Verify delivery starts",
                    "Monitor spend pacing",
                    "Watch early CPA/CPM spikes",
                ],
                "status": "pending",
                "executionPlan": {"action": "none", "targetLevel": "campaign", "targetId": campaign_id},
                "suggestedContent": {
                    "campaignPlan": {"name": campaign_name, "objective": objective},
                    "audienceSuggestions": [
                        "Review status",
                        "Delivery pacing",
                        "CPA/CPM anomaly",
                    ],
                },
                "metricsSnapshot": {},
                "uiDisplayText": "Monitor launch performance over the first 24 hours.",
                "proposedAction": {
                    "action": "MANUAL_REVIEW",
                    "entity_id": campaign_id,
                    "entity_name": campaign_name,
                    "value": "launch_watch",
                },
                "createdAt": now,
                "expiresAt": now + timedelta(hours=24),
                "review": {},
                "source": "campaign_builder",
                "batchType": "LAUNCH_WATCH",
                "metadata": {
                    "draftId": draft_id,
                    "watchWindowHours": 24,
                },
            }
        )

        self._write_task_record(
            user_id=user_id,
            account_id=account_id,
            task_id=rec_ref.id,
            payload={
                "type": "MONITOR_LAUNCH",
                "priority": "HIGH",
                "status": "PENDING",
                "title": f"Monitor Launch: {campaign_name}",
                "reasoning": "This campaign was launched via AI Builder. Monitor the first 24 hours for CPM spikes and initial conversions.",
                "batchType": "LAUNCH_WATCH",
                "metadata": {
                    "draftId": draft_id,
                    "campaignId": campaign_id,
                    "watchWindowHours": 24,
                },
                "source": "campaign_builder",
            },
        )
        return rec_ref.id

    def _write_task_record(
        self,
        *,
        user_id: str,
        account_id: str,
        task_id: str,
        payload: dict[str, Any],
    ) -> None:
        now = datetime.now(timezone.utc)
        tasks_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("tasks")
            .document(task_id)
        )
        task_payload = {
            "createdAt": now,
            "updatedAt": now,
            **payload,
        }
        tasks_ref.set(task_payload, merge=True)

    def _enforce_publish_budget_guardrail(
        self,
        *,
        user_id: str,
        account_id: str,
        account_data: dict[str, Any],
        proposed_daily_budget: float,
    ) -> None:
        if proposed_daily_budget <= 0:
            raise ValidationError(BUDGET_SAFETY_ERROR)

        max_cap = self._extract_max_daily_spend_cap(account_data)
        avg_spend = self._compute_account_avg_daily_spend(user_id, account_id)
        over_absolute_limit = proposed_daily_budget > 1500.0
        over_cap_limit = bool(max_cap and proposed_daily_budget > max_cap)
        over_average_limit = bool(avg_spend and proposed_daily_budget > (avg_spend * 3.0))

        if over_absolute_limit or over_cap_limit or over_average_limit:
            logger.warning(
                "Publish blocked by budget guardrail for %s/%s: proposed=%s, avg_spend=%s, max_cap=%s",
                user_id,
                account_id,
                proposed_daily_budget,
                avg_spend,
                max_cap,
            )
            raise ValidationError(BUDGET_SAFETY_ERROR)

    @staticmethod
    def _extract_max_daily_spend_cap(account_data: dict[str, Any]) -> float:
        if not isinstance(account_data, dict):
            return 0.0
        candidates = [
            account_data.get("maxDailySpendCap"),
            account_data.get("max_daily_spend_cap"),
            ((account_data.get("kpiTargets") or {}) if isinstance(account_data.get("kpiTargets"), dict) else {}).get("maxDailySpendCap"),
            ((account_data.get("kpiTargets") or {}) if isinstance(account_data.get("kpiTargets"), dict) else {}).get("max_daily_spend_cap"),
            ((account_data.get("kpi_targets") or {}) if isinstance(account_data.get("kpi_targets"), dict) else {}).get("maxDailySpendCap"),
            ((account_data.get("kpi_targets") or {}) if isinstance(account_data.get("kpi_targets"), dict) else {}).get("max_daily_spend_cap"),
        ]
        for value in candidates:
            try:
                cap = float(value or 0)
                if cap > 0:
                    return cap
            except (TypeError, ValueError):
                continue
        return 0.0

    def _build_context(self, *, user_id: str, account_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
        normalized_inputs = self._normalize_inputs(inputs)
        account_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
        )
        account_doc = account_ref.get()
        account_data = account_doc.to_dict() if account_doc.exists else {}

        campaigns = []
        for camp_doc in account_ref.collection("campaigns").stream():
            c = camp_doc.to_dict() or {}
            signal = self._load_campaign_signal(camp_doc)
            campaigns.append(
                {
                    "id": camp_doc.id,
                    "name": c.get("name", ""),
                    "objective": c.get("objective", ""),
                    "dailyBudget": c.get("dailyBudget", 0),
                    "status": c.get("status", ""),
                    "performanceSignal": signal,
                }
            )

        benchmark_snapshot = self._build_benchmark_snapshot(user_id, account_id)
        user_request_text = self._format_user_request_section(normalized_inputs)
        account_context_text = self._format_account_context_section(benchmark_snapshot)

        return {
            "account": {
                "id": account_id,
                "name": account_data.get("accountName", ""),
                "currency": account_data.get("currency", "USD"),
                "kpiSummary": account_data.get("kpiSummary", {}),
            },
            "inputs": normalized_inputs,
            "campaigns": campaigns[:200],
            "benchmarkSnapshot": benchmark_snapshot,
            "promptPolicy": {
                "priorityOrder": "USER_REQUEST_OVER_ACCOUNT_BENCHMARKS",
                "strictRules": list(CAMPAIGN_BUILDER_STRICT_RULES),
            },
            "promptSections": {
                "userRequestText": user_request_text,
                "accountContextText": account_context_text,
                "fullPromptContext": f"{user_request_text}\n\n{account_context_text}",
            },
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def _build_benchmark_snapshot(self, user_id: str, selected_account_id: str) -> dict[str, Any]:
        accounts_ref = self.db.collection("users").document(user_id).collection("metaAccounts")
        selected = accounts_ref.document(selected_account_id).get().to_dict() or {}

        roas_values: list[float] = []
        ctr_values: list[float] = []
        cpm_values: list[float] = []
        peer_count = 0

        for acc_doc in accounts_ref.stream():
            if acc_doc.id == selected_account_id:
                continue
            data = acc_doc.to_dict() or {}
            if not data.get("isActive"):
                continue
            kpi = data.get("kpiSummary", {}) if isinstance(data.get("kpiSummary"), dict) else {}
            if not kpi:
                continue
            peer_count += 1
            if kpi.get("roas") is not None:
                roas_values.append(float(kpi.get("roas") or 0))
            if kpi.get("avgCTR") is not None:
                ctr_values.append(float(kpi.get("avgCTR") or 0))
            if kpi.get("avgCPM") is not None:
                cpm_values.append(float(kpi.get("avgCPM") or 0))

        selected_kpi = selected.get("kpiSummary", {}) if isinstance(selected.get("kpiSummary"), dict) else {}
        return {
            "selectedAccount": {
                "kpi": {
                    "roas": float(selected_kpi.get("roas", 0) or 0),
                    "avgCTR": float(selected_kpi.get("avgCTR", 0) or 0),
                    "avgCPM": float(selected_kpi.get("avgCPM", 0) or 0),
                }
            },
            "peerBenchmark": {
                "accountsCompared": peer_count,
                "medianRoas": round(median(roas_values), 4) if roas_values else 0.0,
                "medianCTR": round(median(ctr_values), 4) if ctr_values else 0.0,
                "medianCPM": round(median(cpm_values), 4) if cpm_values else 0.0,
            },
        }

    def _compute_account_avg_daily_budget(self, user_id: str, account_id: str) -> float:
        campaigns_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("campaigns")
        )
        budgets: list[float] = []
        for doc in campaigns_ref.stream():
            payload = doc.to_dict() or {}
            budget = float(payload.get("dailyBudget", 0) or 0)
            if budget > 0:
                budgets.append(budget)
        if not budgets:
            return 0.0
        return round(sum(budgets) / len(budgets), 4)

    def _compute_account_avg_daily_spend(self, user_id: str, account_id: str) -> float:
        insights_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("insights")
        )
        spends: list[float] = []
        try:
            for doc in insights_ref.stream():
                payload = doc.to_dict() or {}
                spend = float(payload.get("spend", 0) or 0)
                if spend > 0:
                    spends.append(spend)
        except Exception:
            spends = []

        if spends:
            return round(sum(spends) / len(spends), 4)

        # Fallback when account-level insights are not populated yet.
        return self._compute_account_avg_daily_budget(user_id, account_id)

    def _load_campaign_signal(self, campaign_doc) -> dict[str, Any]:
        """Load a compact last-7-days signal for AI context without huge payloads."""
        insights_ref = campaign_doc.reference.collection("insights")
        rows: list[dict[str, Any]] = []
        try:
            docs = insights_ref.order_by("date", direction="DESCENDING").limit(7).stream()
            for doc in docs:
                d = doc.to_dict() or {}
                rows.append(
                    {
                        "date": d.get("date"),
                        "spend": float(d.get("spend", 0) or 0),
                        "roas": float(d.get("roas", 0) or 0),
                        "ctr": float(d.get("ctr", 0) or 0),
                        "cpm": float(d.get("cpm", 0) or 0),
                        "cpa": float(d.get("cpa", 0) or 0),
                        "frequency": float(d.get("frequency", 0) or 0),
                    }
                )
        except Exception:
            rows = []

        if not rows:
            return {"days": 0, "avgSpend": 0, "avgRoas": 0, "avgCtr": 0, "avgCpm": 0, "avgCpa": 0, "avgFrequency": 0}

        n = len(rows)
        return {
            "days": n,
            "avgSpend": round(sum(r["spend"] for r in rows) / n, 4),
            "avgRoas": round(sum(r["roas"] for r in rows) / n, 4),
            "avgCtr": round(sum(r["ctr"] for r in rows) / n, 4),
            "avgCpm": round(sum(r["cpm"] for r in rows) / n, 4),
            "avgCpa": round(sum(r["cpa"] for r in rows) / n, 4),
            "avgFrequency": round(sum(r["frequency"] for r in rows) / n, 4),
            "latest": rows[0],
        }

    def _validate_blocks(self, blocks: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
        errors: list[str] = []
        warnings: list[str] = []

        campaign_plan = blocks.get("campaignPlan", {}) if isinstance(blocks.get("campaignPlan"), dict) else {}
        audience_plan = blocks.get("audiencePlan", {}) if isinstance(blocks.get("audiencePlan"), dict) else {}
        creative_plan = blocks.get("creativePlan", {}) if isinstance(blocks.get("creativePlan"), dict) else {}

        if not str(campaign_plan.get("name") or "").strip():
            errors.append("campaignPlan.name is required")

        budget = float(campaign_plan.get("dailyBudget", 0) or 0)
        if budget <= 0:
            errors.append("campaignPlan.dailyBudget must be > 0")
        elif budget < 5:
            warnings.append("Daily budget is very low and may limit delivery")

        geo = audience_plan.get("geo", {}) if isinstance(audience_plan.get("geo"), dict) else {}
        countries = geo.get("countries", []) if isinstance(geo.get("countries"), list) else []
        if not countries:
            errors.append("audiencePlan.geo.countries is required")

        primary_texts = creative_plan.get("primaryTexts", []) if isinstance(creative_plan.get("primaryTexts"), list) else []
        headlines = creative_plan.get("headlines", []) if isinstance(creative_plan.get("headlines"), list) else []
        if not primary_texts:
            errors.append("creativePlan.primaryTexts must include at least one variation")
        if not headlines:
            errors.append("creativePlan.headlines must include at least one variation")
        page_id = str(inputs.get("pageId") or "").strip()
        destination_url = str(inputs.get("destinationUrl") or "").strip()
        if not page_id:
            warnings.append("pageId is missing: publish will be blocked until provided")
        if not destination_url:
            warnings.append("destinationUrl is missing: publish will be blocked until provided")

        return {
            "isValid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }

    def _normalize_blocks(self, blocks: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
        normalized_inputs = self._normalize_inputs(inputs, blocks=blocks)
        campaign_name = str(normalized_inputs.get("campaignName") or "AI Campaign Launch")
        objective = str(normalized_inputs.get("objective") or DEFAULT_OBJECTIVE)
        budget = float(normalized_inputs.get("dailyBudget", 100) or 100)
        country = str(normalized_inputs.get("country") or "US")
        language = str(normalized_inputs.get("language") or "en")
        offer = str(normalized_inputs.get("offer") or campaign_name).strip()
        is_hebrew = self._is_hebrew_language(language)

        campaign_plan = blocks.get("campaignPlan") if isinstance(blocks.get("campaignPlan"), dict) else {}
        audience_plan = blocks.get("audiencePlan") if isinstance(blocks.get("audiencePlan"), dict) else {}
        creative_plan = blocks.get("creativePlan") if isinstance(blocks.get("creativePlan"), dict) else {}

        campaign_plan.setdefault("name", campaign_name)
        campaign_plan.setdefault("objective", objective)
        campaign_plan.setdefault("buyingType", "AUCTION")
        campaign_plan.setdefault("budgetType", "daily")
        campaign_plan.setdefault("dailyBudget", budget)

        geo = audience_plan.get("geo") if isinstance(audience_plan.get("geo"), dict) else {}
        geo.setdefault("countries", [country])
        audience_plan["geo"] = geo
        audience_plan.setdefault("ageRange", {"min": 21, "max": 55})
        audience_plan.setdefault("genders", ["all"])
        audience_plan.setdefault("interests", self._default_interests(is_hebrew))
        audience_plan.setdefault(
            "lookalikeHints",
            ["1% רוכשים", "3% רוכשים בעלי ערך גבוה"] if is_hebrew else ["1% purchasers", "3% high-value purchasers"],
        )
        interests = audience_plan.get("interests", [])
        if not isinstance(interests, list):
            audience_plan["interests"] = self._default_interests(is_hebrew)
        else:
            cleaned_interests = [self._clean_interest_value(x) for x in interests if self._clean_interest_value(x)]
            audience_plan["interests"] = cleaned_interests[:8] if cleaned_interests else self._default_interests(is_hebrew)

        creative_plan.setdefault(
            "angles",
            self._default_angles(is_hebrew),
        )
        creative_plan.setdefault(
            "primaryTexts",
            self._default_primary_texts(is_hebrew),
        )
        creative_plan.setdefault(
            "headlines",
            self._default_headlines(is_hebrew),
        )
        creative_plan.setdefault("cta", "LEARN_MORE")

        # Strict language fallback guardrail (only enforce hard for Hebrew requests).
        if is_hebrew:
            primary_texts = creative_plan.get("primaryTexts", []) if isinstance(creative_plan.get("primaryTexts"), list) else []
            headlines = creative_plan.get("headlines", []) if isinstance(creative_plan.get("headlines"), list) else []
            if self._creative_has_language_mismatch(primary_texts + headlines):
                creative_plan["primaryTexts"] = self._default_primary_texts(True)
                creative_plan["headlines"] = self._default_headlines(True)

        reasoning = blocks.get("reasoning")
        if not isinstance(reasoning, str) or not reasoning.strip():
            if is_hebrew:
                reasoning = f"הטיוטה נבנתה עבור ההצעה '{offer}' לפי בקשת המשתמש, עם שימוש בנתוני החשבון כהקשר משני בלבד."
            else:
                reasoning = (
                    f"This draft is built specifically for '{offer}' from the user request, "
                    "with account benchmarks used only as secondary context."
                )

        return {
            "campaignPlan": campaign_plan,
            "audiencePlan": audience_plan,
            "creativePlan": creative_plan,
            "reasoning": reasoning,
        }

    def _repair_initial_full_draft_blocks_with_llm(
        self,
        *,
        context: dict[str, Any],
        blocks: dict[str, Any] | Any,
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Initial full-draft quality pass.
        If core blocks are missing or violate anti-parroting/language rules,
        regenerate only those blocks via LLM (same robust path as manual regenerate).
        """
        candidate = dict(blocks) if isinstance(blocks, dict) else {}
        offer = str(inputs.get("offer") or "").strip()
        language = str(inputs.get("language") or "en")
        is_hebrew = self._is_hebrew_language(language)

        missing_or_invalid: list[str] = []
        if not isinstance(candidate.get("campaignPlan"), dict):
            missing_or_invalid.append("campaignPlan")
        if self._audience_block_needs_regen(candidate.get("audiencePlan"), offer):
            missing_or_invalid.append("audiencePlan")
        if self._creative_block_needs_regen(candidate.get("creativePlan"), offer, is_hebrew):
            missing_or_invalid.append("creativePlan")
        if not str(candidate.get("reasoning") or "").strip():
            missing_or_invalid.append("reasoning")

        if not missing_or_invalid:
            return candidate

        instructions = {
            "campaignPlan": "Generate a complete campaignPlan only. Keep objective and budget coherent with the user request.",
            "audiencePlan": (
                "Generate an audiencePlan only. Interests must be short Meta targeting categories (1-4 words each), "
                "not full sentences and not a pasted user brief."
            ),
            "creativePlan": (
                "Generate a creativePlan only. DO NOT parrot the raw user brief. "
                "Write original, concise, native-language copy. Avoid mixed-language output."
            ),
            "reasoning": "Generate a short reasoning string that references the user brief first and benchmarks second.",
        }

        for block_type in missing_or_invalid:
            try:
                regenerated = self.ai.regenerate_campaign_builder_block(
                    context,
                    current_blocks=candidate,
                    block_type=block_type,
                    instruction=instructions.get(block_type, ""),
                )
                if isinstance(regenerated, dict) and regenerated.get(block_type) is not None:
                    candidate[block_type] = regenerated[block_type]
            except Exception:
                logger.warning("Initial full-draft block repair failed for %s", block_type, exc_info=True)

        return candidate

    def _normalize_inputs(self, inputs: dict[str, Any], *, blocks: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(inputs or {}) if isinstance(inputs, dict) else {}
        blocks = blocks or {}

        def _pick(*keys: str) -> Any:
            for key in keys:
                value = payload.get(key)
                if value is not None and str(value).strip():
                    return value
            return ""

        objective = str(_pick("objective") or DEFAULT_OBJECTIVE).strip()
        language = str(_pick("language", "lang", "locale") or "en").strip()
        country = str(_pick("country", "targetGeo", "geo", "target_geo") or "US").strip()
        campaign_name = str(_pick("campaignName", "name") or "AI Campaign Launch").strip()
        offer = str(_pick("offer", "offerProduct", "product", "productOffer") or "").strip()

        if not offer and isinstance(blocks, dict):
            campaign_plan = blocks.get("campaignPlan", {}) if isinstance(blocks.get("campaignPlan"), dict) else {}
            offer = str(campaign_plan.get("name") or campaign_name).strip()

        daily_budget_raw = payload.get("dailyBudget", payload.get("budget", 0))
        try:
            daily_budget = float(daily_budget_raw or 0)
        except (TypeError, ValueError):
            daily_budget = 0.0

        return {
            "objective": objective,
            "offer": offer,
            "country": country or "US",
            "language": language or "en",
            "dailyBudget": daily_budget,
            "campaignName": campaign_name or "AI Campaign Launch",
            "pageId": str(payload.get("pageId") or "").strip(),
            "destinationUrl": str(payload.get("destinationUrl") or "").strip(),
            "brandVoice": str(payload.get("brandVoice") or "").strip(),
        }

    @staticmethod
    def _is_hebrew_language(language: str) -> bool:
        normalized = str(language or "").strip().lower()
        return (
            normalized.startswith("he")
            or "hebrew" in normalized
            or "עברית" in str(language or "").strip()
        )

    @staticmethod
    def _default_interests(is_hebrew: bool) -> list[str]:
        if is_hebrew:
            return ["צרכנות", "השוואת מחירים", "משפחה", "שירותים פיננסיים"]
        return ["Consumer services", "Price comparison", "Family", "Financial services"]

    @staticmethod
    def _default_angles(is_hebrew: bool) -> list[str]:
        if is_hebrew:
            return [
                "ערך ברור ופשוט עם קריאה לפעולה",
                "למה עכשיו זה הזמן הנכון לפעול",
                f"הוכחה חברתית + קריאה לפעולה ממוקדת",
            ]
        return [
            "Clear value proposition with direct CTA",
            "Why now is the right time to act",
            "Social proof with a direct CTA",
        ]

    @staticmethod
    def _default_primary_texts(is_hebrew: bool) -> list[str]:
        if is_hebrew:
            return [
                "רוצים פתרון שמתאים בדיוק לצרכים שלכם? התחילו עכשיו בתהליך קצר ופשוט.",
                "בדקו זכאות וקבלו הצעה מותאמת תוך דקות, בלי התחייבות.",
                "השאירו פרטים ונחזור אליכם עם אפשרויות ברורות ומשתלמות.",
            ]
        return [
            "Get a tailored option in minutes with a simple, guided flow.",
            "See clear choices and move forward with confidence today.",
            "Start now to receive a fast, relevant recommendation.",
        ]

    @staticmethod
    def _default_headlines(is_hebrew: bool) -> list[str]:
        if is_hebrew:
            return [
                "פתרון שמותאם לכם",
                "השוו ובחרו נכון",
                "בדקו זכאות עכשיו",
            ]
        return [
            "Find Your Best Option",
            "Compare and Choose Smart",
            "Check Eligibility Today",
        ]

    @staticmethod
    def _creative_has_language_mismatch(texts: list[str]) -> bool:
        for text in texts:
            if re.search(r"[A-Za-z]", str(text or "")):
                return True
        return False

    def _creative_block_needs_regen(self, creative_plan: Any, offer: str, is_hebrew: bool) -> bool:
        if not isinstance(creative_plan, dict):
            return True
        primary_texts = creative_plan.get("primaryTexts")
        headlines = creative_plan.get("headlines")
        if not isinstance(primary_texts, list) or not primary_texts:
            return True
        if not isinstance(headlines, list) or not headlines:
            return True

        texts = [str(x or "") for x in [*primary_texts, *headlines] if str(x or "").strip()]
        if not texts:
            return True

        normalized_offer = str(offer or "").strip()
        if normalized_offer and len(normalized_offer) > 35:
            if any(normalized_offer in text for text in texts):
                return True

        if is_hebrew:
            if self._creative_has_language_mismatch(texts):
                return True
            if any(("looking for" in text.lower()) for text in texts):
                return True

        return False

    @staticmethod
    def _clean_interest_value(value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if "\n" in text or "\r" in text:
            return ""
        text = re.sub(r"\s+", " ", text)
        if len(text) > 40:
            return ""
        words = text.split(" ")
        if len(words) > 5:
            return ""
        if re.search(r"[.!?;:]", text):
            return ""
        return text

    def _audience_block_needs_regen(self, audience_plan: Any, offer: str) -> bool:
        if not isinstance(audience_plan, dict):
            return True
        interests = audience_plan.get("interests")
        if not isinstance(interests, list) or not interests:
            return True
        normalized_offer = str(offer or "").strip()
        for raw_interest in interests:
            cleaned = self._clean_interest_value(raw_interest)
            if not cleaned:
                return True
            if normalized_offer and len(normalized_offer) > 35 and cleaned == normalized_offer:
                return True
        return False

    def _format_user_request_section(self, inputs: dict[str, Any]) -> str:
        return (
            "=== USER REQUEST (HIGHEST PRIORITY) ===\n"
            f"Product/Offer: {inputs.get('offer') or ''}\n"
            f"Objective: {inputs.get('objective') or DEFAULT_OBJECTIVE}\n"
            f"Language: {inputs.get('language') or 'en'}\n"
            f"Target Geo: {inputs.get('country') or 'US'}"
        )

    @staticmethod
    def _format_account_context_section(benchmark_snapshot: dict[str, Any]) -> str:
        benchmark_text = json.dumps(benchmark_snapshot or {}, ensure_ascii=False, default=str)
        return (
            "=== ACCOUNT CONTEXT (SECONDARY - USE ONLY FOR TONE/METRICS) ===\n"
            f"Account Benchmarks: {benchmark_text}"
        )

    def _build_targeting_payload(self, audience_plan: dict[str, Any]) -> dict[str, Any]:
        geo = audience_plan.get("geo", {}) if isinstance(audience_plan.get("geo"), dict) else {}
        countries = geo.get("countries", []) if isinstance(geo.get("countries"), list) else []
        age = audience_plan.get("ageRange", {}) if isinstance(audience_plan.get("ageRange"), dict) else {}
        genders = audience_plan.get("genders", ["all"])
        interests = (
            audience_plan.get("interests", [])
            if isinstance(audience_plan.get("interests"), list)
            else []
        )

        gender_map = {"male": 1, "female": 2}
        meta_genders = [gender_map[g.lower()] for g in genders if isinstance(g, str) and g.lower() in gender_map]

        payload = {
            "geo_locations": {"countries": countries or ["US"]},
            "age_min": int(age.get("min", 21) or 21),
            "age_max": int(age.get("max", 55) or 55),
        }
        if meta_genders:
            payload["genders"] = meta_genders
        if interests:
            payload["interests"] = [{"name": str(i)} for i in interests[:10] if str(i).strip()]
        return payload

    @staticmethod
    def _normalize_block_type(block_type: str) -> str:
        raw = str(block_type or "").strip()
        if raw in ALLOWED_BLOCK_TYPES:
            return raw
        key = raw.replace("-", "_").replace(" ", "_").strip("_").lower()
        mapped = BLOCK_TYPE_ALIASES.get(key)
        return mapped or raw

    @staticmethod
    def _to_minor_units(major: float) -> int:
        return max(100, int(round(major * 100)))

    def _ensure_account_exists(self, user_id: str, account_id: str) -> None:
        account_ref = (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
        )
        if not account_ref.get().exists:
            raise ValueError("Account not found")

    def _draft_ref(self, user_id: str, account_id: str, draft_id: str):
        return (
            self.db.collection("users")
            .document(user_id)
            .collection("metaAccounts")
            .document(account_id)
            .collection("campaignDrafts")
            .document(draft_id)
        )

    @classmethod
    def _serialize(cls, value: Any) -> Any:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        if isinstance(value, dict):
            return {k: cls._serialize(v) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._serialize(v) for v in value]
        return value
