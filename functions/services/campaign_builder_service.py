"""AI Campaign Builder service: draft generation, regeneration, preflight safety, and publish."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import hashlib
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any

import requests

from services.ai_analyzer import AIAnalyzer
from services.nano_banana import NanaBananaArtDirector

logger = logging.getLogger(__name__)

DEFAULT_OBJECTIVE = "OUTCOME_SALES"
BUDGET_SAFETY_ERROR = "Budget exceeds safety limits. Please edit the budget block."
ALLOWED_BLOCK_TYPES = {"campaignPlan", "audiencePlan", "creativePlan", "reasoning", "imageConcepts"}
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
    "imageconcepts": "imageConcepts",
    "image_concepts": "imageConcepts",
    "images": "imageConcepts",
}
NANO_BANANA_PRO_IMAGE_MODEL = "gemini-3-pro-image-preview"
GEMINI_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_ART_DIRECTOR_IMAGES = 3


class ValidationError(ValueError):
    """User-facing validation errors that should block publish."""


class PublishResolutionError(ValidationError):
    """Raised when required publish entities (page/destination) cannot be resolved safely."""

    def __init__(self, message: str, *, code: str = "PAGE_ID_RESOLUTION_FAILED", diagnostics: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.diagnostics = diagnostics or {}


class CampaignBuilderService:
    def __init__(self, db):
        self.db = db
        self.ai = AIAnalyzer()
        self.art_director = NanaBananaArtDirector()

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
        blocks = self._generate_full_draft_via_agents(context=context)
        blocks = self._repair_initial_full_draft_blocks_with_llm(
            context=context,
            blocks=blocks,
            inputs=inputs,
        )
        blocks = self._normalize_blocks(blocks, inputs)
        if self._should_generate_images_on_create():
            blocks = self._run_art_director(blocks=blocks, context=context)
        else:
            blocks.setdefault(
                "imageConcepts",
                {
                    "creative_concept_reasoning": "",
                    "image_generation_prompts": [],
                    "imageUrls": [],
                },
            )
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

        next_blocks = dict(blocks)
        regenerated = self._regenerate_block_via_agent(
            context=context,
            current_blocks=blocks,
            block_type=block_type,
            instruction=instruction,
        )
        if block_type == "campaignPlan":
            next_blocks["campaignPlan"] = regenerated.get("campaignPlan", blocks.get("campaignPlan"))
            if isinstance(regenerated.get("reasoning"), str) and regenerated.get("reasoning", "").strip():
                next_blocks["reasoning"] = regenerated.get("reasoning")
        elif block_type == "reasoning":
            next_blocks["reasoning"] = regenerated.get("reasoning", blocks.get("reasoning"))
            if isinstance(regenerated.get("campaignPlan"), dict):
                next_blocks["campaignPlan"] = regenerated.get("campaignPlan")
        else:
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
        page_id_override: str = "",
        destination_url_override: str = "",
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
        account_data = account_data if isinstance(account_data, dict) else {}
        proposed_budget = float(campaign_plan.get("dailyBudget", 0) or 0)
        self._enforce_publish_budget_guardrail(
            user_id=user_id,
            account_id=account_id,
            account_data=account_data,
            proposed_daily_budget=proposed_budget,
        )

        override_page_id = str(page_id_override or "").strip()
        override_destination_url = str(destination_url_override or "").strip()
        page_id = ""
        page_resolution_source = "none"
        page_access_status = str(account_data.get("pageAccessStatus") or "").strip().lower()
        if override_page_id:
            page_id = override_page_id
            page_resolution_source = "override"
            page_access_status = "ok"
        elif str(inputs.get("pageId") or inputs.get("pageID") or "").strip():
            page_id = str(inputs.get("pageId") or inputs.get("pageID") or "").strip()
            page_resolution_source = "draft_inputs"
            page_access_status = "ok"
        else:
            account_default_page_id = self._resolve_page_id_from_account_defaults(account_data)
            if account_default_page_id:
                page_id = account_default_page_id
                page_resolution_source = "account_defaults"
                page_access_status = "ok"

        destination_url = (
            override_destination_url
            or self._resolve_destination_url(inputs, account_data)
        )

        if override_page_id or override_destination_url:
            draft_update: dict[str, Any] = {"updatedAt": datetime.now(timezone.utc)}
            if override_page_id:
                draft_update["inputs.pageId"] = override_page_id
            if override_destination_url:
                draft_update["inputs.destinationUrl"] = override_destination_url
            draft_ref.update(draft_update)

            account_update: dict[str, Any] = {"updatedAt": datetime.now(timezone.utc)}
            if override_page_id:
                account_update["defaultPageId"] = override_page_id
                account_update["pageAccessStatus"] = "ok"
            if override_destination_url:
                account_update["defaultDestinationUrl"] = override_destination_url
            account_ref.set(account_update, merge=True)

        token: str = ""
        if not page_id:
            try:
                from services.meta_auth import fetch_pages_with_status, get_decrypted_token

                token, _ = get_decrypted_token(user_id, account_id)
                pages, page_access_status = fetch_pages_with_status(token)
                account_ref.set(
                    {
                        "pageAccessStatus": page_access_status,
                        "pageAccessCheckedAt": datetime.now(timezone.utc),
                        "updatedAt": datetime.now(timezone.utc),
                    },
                    merge=True,
                )
                if pages:
                    page_id = str(pages[0].get("pageId") or "").strip()
                    if page_id:
                        page_resolution_source = "fetched_pages"
                        page_access_status = "ok"
                        account_ref.set(
                            {
                                "defaultPageId": page_id,
                                "defaultPageName": str(pages[0].get("pageName") or ""),
                                "pageAccessStatus": "ok",
                                "updatedAt": datetime.now(timezone.utc),
                            },
                            merge=True,
                        )
            except Exception as exc:  # pragma: no cover - external token/page fetch
                logger.warning("Failed to auto-resolve pageId for %s/%s: %s", user_id, account_id, exc)
                page_access_status = "token_error"
                account_ref.set(
                    {
                        "pageAccessStatus": page_access_status,
                        "pageAccessCheckedAt": datetime.now(timezone.utc),
                        "updatedAt": datetime.now(timezone.utc),
                    },
                    merge=True,
                )

        if not page_id:
            diagnostics = {
                "pageResolutionSource": page_resolution_source,
                "pageAccessStatus": page_access_status or "token_error",
                "publishDraftId": draft_id,
                "accountId": account_id,
            }
            logger.warning(
                "Publish page resolution failed user=%s account=%s draft=%s source=%s pageAccessStatus=%s",
                user_id,
                account_id,
                draft_id,
                page_resolution_source,
                page_access_status or "token_error",
            )
            raise PublishResolutionError(
                "Could not resolve Meta Page for publish. Reconnect account permissions or select a pageId manually.",
                diagnostics=diagnostics,
            )
        if not destination_url:
            raise ValueError("destinationUrl is required for publish")

        logger.info(
            "Publish page resolution success user=%s account=%s draft=%s source=%s pageAccessStatus=%s",
            user_id,
            account_id,
            draft_id,
            page_resolution_source,
            page_access_status or "ok",
        )

        from services.meta_api import MetaAPIService
        from services.meta_auth import get_decrypted_token

        try:
            if not token:
                token, _ = get_decrypted_token(user_id, account_id)
            api = MetaAPIService(access_token=token, account_id=account_id)
            campaign_id = api.create_campaign(
                name=str(campaign_plan.get("name") or inputs.get("campaignName") or "AI Campaign"),
                objective=str(campaign_plan.get("objective") or DEFAULT_OBJECTIVE),
                status="PAUSED",
            )
            publish_ids["campaignId"] = campaign_id
            objective = str(campaign_plan.get("objective") or DEFAULT_OBJECTIVE).strip().upper()
            preferred_event_type = "LEAD" if objective == "OUTCOME_LEADS" else "PURCHASE"

            adset_id = api.create_adset(
                campaign_id=campaign_id,
                name=str(audience_plan.get("name") or f"{campaign_plan.get('name', 'AI')} - AdSet"),
                daily_budget=self._to_minor_units(float(campaign_plan.get("dailyBudget", 0) or 0)),
                targeting=self._build_targeting_payload(audience_plan),
                optimization_goal=str(audience_plan.get("optimizationGoal") or "OFFSITE_CONVERSIONS"),
                billing_event=str(audience_plan.get("billingEvent") or "IMPRESSIONS"),
                status="PAUSED",
                promoted_object={"custom_event_type": preferred_event_type},
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
            publish_error = self._format_publish_exception(exc)
            logger.error(
                "Campaign draft publish failed for %s/%s: %s",
                user_id,
                draft_id,
                publish_error,
                exc_info=True,
            )
            draft_ref.update(
                {
                    "status": "draft",
                    "publishError": publish_error,
                    "publishErrorType": exc.__class__.__name__,
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
            raise ValueError(f"Publish failed: {publish_error}") from exc

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

    def _format_publish_exception(self, exc: Exception) -> str:
        """Extract stable, non-empty publish error details for API/UI diagnostics."""
        parts: list[str] = []

        def _append(value: Any, *, label: str = ""):
            text = str(value or "").strip()
            if not text:
                return
            parts.append(f"{label}: {text}" if label else text)

        _append(str(exc))

        meta_error_fields = (
            ("Meta message", "api_error_message"),
            ("Meta user title", "api_error_user_title"),
            ("Meta user message", "api_error_user_msg"),
            ("Meta code", "api_error_code"),
            ("Meta subcode", "api_error_subcode"),
            ("HTTP status", "http_status"),
        )
        for label, attr_name in meta_error_fields:
            attr = getattr(exc, attr_name, None)
            if callable(attr):
                try:
                    _append(attr(), label=label)
                except Exception:
                    continue
            elif attr is not None:
                _append(attr, label=label)

        api_error_data = getattr(exc, "api_error_data", None)
        if callable(api_error_data):
            try:
                data = api_error_data()
                if isinstance(data, (dict, list)):
                    _append(json.dumps(data, ensure_ascii=False), label="Meta data")
                else:
                    _append(data, label="Meta data")
            except Exception:
                pass

        if not parts:
            for arg in getattr(exc, "args", ()):
                _append(arg)

        cause = exc.__cause__ or exc.__context__
        if cause is not None:
            _append(str(cause) or repr(cause), label="Cause")

        if not parts:
            _append(repr(exc) or exc.__class__.__name__)
        if not parts:
            _append("Unknown publish error")

        deduped: list[str] = []
        seen: set[str] = set()
        for item in parts:
            key = item.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(key)

        return " | ".join(deduped)[:3000]

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
        account_data = account_data if isinstance(account_data, dict) else {}
        account_client_brief = str(
            account_data.get("clientBackgroundBrief")
            or account_data.get("clientBrief")
            or account_data.get("brandVoice")
            or ""
        ).strip()
        if not str(normalized_inputs.get("clientBackgroundBrief") or "").strip() and account_client_brief:
            normalized_inputs["clientBackgroundBrief"] = account_client_brief

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
        account_context_text = self._format_account_context_section(
            benchmark_snapshot,
            client_background_brief=str(normalized_inputs.get("clientBackgroundBrief") or ""),
        )

        return {
            "account": {
                "id": account_id,
                "name": account_data.get("accountName", ""),
                "currency": account_data.get("currency", "USD"),
                "kpiSummary": account_data.get("kpiSummary", {}),
                "clientBackgroundBrief": str(normalized_inputs.get("clientBackgroundBrief") or ""),
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
        offer_for_copy = self._sanitize_offer_for_copy(offer, is_hebrew)

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
            self._default_primary_texts(offer_for_copy, is_hebrew),
        )
        creative_plan.setdefault(
            "headlines",
            self._default_headlines(offer_for_copy, is_hebrew),
        )
        creative_plan.setdefault("cta", "LEARN_MORE")

        # Guard against creative fields that exist but are empty or all-whitespace
        if not creative_plan.get("primaryTexts") or all(not str(t).strip() for t in creative_plan["primaryTexts"]):
            creative_plan["primaryTexts"] = self._default_primary_texts(offer_for_copy, is_hebrew)
        if not creative_plan.get("headlines") or all(not str(h).strip() for h in creative_plan["headlines"]):
            creative_plan["headlines"] = self._default_headlines(offer_for_copy, is_hebrew)
        if not creative_plan.get("angles") or all(not str(a).strip() for a in creative_plan["angles"]):
            creative_plan["angles"] = self._default_angles(is_hebrew)
        elif is_hebrew:
            angle_texts = [str(a or "").strip() for a in creative_plan.get("angles", []) if str(a or "").strip()]
            if angle_texts and self._creative_has_language_mismatch(angle_texts):
                # Hooks must stay in the requested language.
                creative_plan["angles"] = self._default_angles(is_hebrew)

        # Do not overwrite model output with generic templates when there is mixed language.
        # We keep the generated copy for specificity and let explicit regenerate refine it.

        reasoning = blocks.get("reasoning")
        if not isinstance(reasoning, str) or not reasoning.strip():
            if is_hebrew:
                reasoning = f"הטיוטה נבנתה עבור ההצעה '{offer}' לפי בקשת המשתמש, עם שימוש בנתוני החשבון כהקשר משני בלבד."
            else:
                reasoning = (
                    f"This draft is built specifically for '{offer}' from the user request, "
                    "with account benchmarks used only as secondary context."
                )

        result = {
            "campaignPlan": campaign_plan,
            "audiencePlan": audience_plan,
            "creativePlan": creative_plan,
            "reasoning": reasoning,
        }
        # Preserve imageConcepts through normalization if present
        if isinstance(blocks.get("imageConcepts"), dict):
            result["imageConcepts"] = blocks["imageConcepts"]
        return result

    def _generate_full_draft_via_agents(self, *, context: dict[str, Any]) -> dict[str, Any]:
        """
        Fast first-pass draft generation.
        1) Try one-shot full-draft generation (single model call).
        2) If empty/invalid, fall back to sequential multi-agent chain.
        """
        try:
            single_pass = self.ai.generate_campaign_builder_draft(context)
        except Exception:
            logger.warning("One-shot draft generation failed", exc_info=True)
            single_pass = {}

        blocks: dict[str, Any] = {}
        if isinstance(single_pass, dict):
            for key in ("campaignPlan", "audiencePlan", "creativePlan", "reasoning"):
                value = single_pass.get(key)
                if key == "reasoning" and isinstance(value, str) and value.strip():
                    blocks[key] = value
                elif key != "reasoning" and isinstance(value, dict):
                    blocks[key] = value

        if blocks:
            return blocks

        # Keep fallback configurable to preserve reliability if one-shot parsing fails.
        if self._allow_multi_agent_fallback():
            return self._generate_full_draft_multi_agent(context=context)

        logger.warning("Draft generation returned no structured blocks; using normalization fallback")
        return {}

    def _generate_full_draft_multi_agent(self, *, context: dict[str, Any]) -> dict[str, Any]:
        """Sequential multi-agent fallback path."""
        blocks: dict[str, Any] = {}

        strategy_payload = self.ai.generate_strategy_plan(context)
        if isinstance(strategy_payload.get("campaignPlan"), dict):
            blocks["campaignPlan"] = strategy_payload["campaignPlan"]
        if isinstance(strategy_payload.get("reasoning"), str):
            blocks["reasoning"] = strategy_payload["reasoning"]

        audience_payload = self.ai.generate_audience_plan(
            context,
            current_blocks=blocks,
        )
        if isinstance(audience_payload.get("audiencePlan"), dict):
            blocks["audiencePlan"] = audience_payload["audiencePlan"]

        # Creative agent with retry — this is the most critical block.
        creative_plan = None
        for attempt in range(2):
            try:
                creative_payload = self.ai.generate_creative_plan(
                    context,
                    current_blocks=blocks,
                )
                if isinstance(creative_payload.get("creativePlan"), dict):
                    cp = creative_payload["creativePlan"]
                    if cp.get("primaryTexts") and cp.get("headlines"):
                        creative_plan = cp
                        break
                logger.warning("Creative agent attempt %d returned incomplete plan", attempt + 1)
            except Exception:
                logger.warning("Creative agent attempt %d failed", attempt + 1, exc_info=True)

        if creative_plan is not None:
            blocks["creativePlan"] = creative_plan
        else:
            logger.error("Creative agent failed after all attempts — no creativePlan in blocks")

        return blocks

    @staticmethod
    def _should_generate_images_on_create() -> bool:
        value = str(os.environ.get("CAMPAIGN_BUILDER_EAGER_IMAGES", "1")).strip().lower()
        return value in {"1", "true", "yes", "on"}

    @staticmethod
    def _allow_multi_agent_fallback() -> bool:
        value = str(os.environ.get("CAMPAIGN_BUILDER_MULTI_AGENT_FALLBACK", "1")).strip().lower()
        return value not in {"0", "false", "no", "off"}

    def _regenerate_block_via_agent(
        self,
        *,
        context: dict[str, Any],
        current_blocks: dict[str, Any],
        block_type: str,
        instruction: str,
    ) -> dict[str, Any]:
        if block_type in {"campaignPlan", "reasoning"}:
            return self.ai.generate_strategy_plan(
                context,
                current_blocks=current_blocks,
                instruction=instruction,
            )
        if block_type == "audiencePlan":
            return self.ai.generate_audience_plan(
                context,
                current_blocks=current_blocks,
                instruction=instruction,
            )
        if block_type == "creativePlan":
            return self.ai.generate_creative_plan(
                context,
                current_blocks=current_blocks,
                instruction=instruction,
            )
        if block_type == "imageConcepts":
            inputs = context.get("inputs", {}) if isinstance(context.get("inputs"), dict) else {}
            offer = str(inputs.get("offer") or "").strip()
            language = str(inputs.get("language") or "en").strip()
            acct = context.get("account") if isinstance(context.get("account"), dict) else {}
            account_id = str(acct.get("id") or "")
            cp = current_blocks.get("creativePlan", {})
            if isinstance(cp, dict) and cp:
                image_concepts = self.ai.generate_image_concepts(
                    offer=offer, language=language, creative_plan=cp,
                )
                prompts = self._ensure_image_prompts(
                    image_concepts=image_concepts,
                    creative_plan=cp,
                    offer=offer,
                    language=language,
                )
                image_urls = self._generate_images_from_prompts(prompts=prompts, account_id=account_id)
                return {
                    "imageConcepts": {
                        "creative_concept_reasoning": image_concepts.get("creative_concept_reasoning", ""),
                        "image_generation_prompts": prompts,
                        "imageUrls": image_urls,
                    }
                }
            return {}
        return {}

    def _run_art_director(self, *, blocks: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        """Run Art Director to generate image concepts + images. Requires creativePlan in blocks."""
        inputs = context.get("inputs", {}) if isinstance(context.get("inputs"), dict) else {}
        offer = str(inputs.get("offer") or "").strip()
        language = str(inputs.get("language") or "en").strip()
        acct = context.get("account") if isinstance(context.get("account"), dict) else {}
        account_id = str(acct.get("id") or "")

        cp = blocks.get("creativePlan")
        if not isinstance(cp, dict) or not cp:
            logger.warning("Art Director skipped — no creativePlan available")
            return blocks

        primary_texts = cp.get("primaryTexts") or []
        headlines = cp.get("headlines") or []
        if not primary_texts and not headlines:
            logger.warning("Art Director skipped — creativePlan has no texts or headlines")
            return blocks

        try:
            image_concepts = self.ai.generate_image_concepts(
                offer=offer,
                language=language,
                creative_plan=cp,
            )
            prompts = self._ensure_image_prompts(
                image_concepts=image_concepts,
                creative_plan=cp,
                offer=offer,
                language=language,
            )
            image_urls = self._generate_images_from_prompts(
                prompts=prompts,
                account_id=account_id,
            )
            blocks["imageConcepts"] = {
                "creative_concept_reasoning": image_concepts.get("creative_concept_reasoning", ""),
                "image_generation_prompts": prompts,
                "imageUrls": image_urls,
            }
            if prompts and not image_urls:
                blocks["imageConcepts"]["imageGenerationError"] = (
                    "Image generation completed but all images failed to render."
                )
                logger.warning(
                    "Art Director generated %d prompts but 0 images succeeded for account %s",
                    len(prompts), account_id,
                )
        except Exception as exc:
            logger.error("Art Director agent failed for account %s: %s", account_id, exc, exc_info=True)
            blocks["imageConcepts"] = {
                "creative_concept_reasoning": "",
                "image_generation_prompts": [],
                "imageUrls": [],
                "imageGenerationError": f"Image generation failed: {type(exc).__name__}",
            }

        return blocks

    def _ensure_image_prompts(
        self,
        *,
        image_concepts: dict[str, Any],
        creative_plan: dict[str, Any],
        offer: str,
        language: str,
    ) -> list[str]:
        raw_prompts = image_concepts.get("image_generation_prompts", []) if isinstance(image_concepts, dict) else []
        prompts = [str(p or "").strip() for p in raw_prompts if str(p or "").strip()]
        if prompts:
            return prompts[:MAX_ART_DIRECTOR_IMAGES]
        return self._build_fallback_image_prompts(
            creative_plan=creative_plan,
            offer=offer,
            language=language,
        )

    def _build_fallback_image_prompts(
        self,
        *,
        creative_plan: dict[str, Any],
        offer: str,
        language: str,
    ) -> list[str]:
        """Build deterministic backup prompts when Art Director output has no prompt list."""
        primary_texts = creative_plan.get("primaryTexts") if isinstance(creative_plan.get("primaryTexts"), list) else []
        headlines = creative_plan.get("headlines") if isinstance(creative_plan.get("headlines"), list) else []
        angles = creative_plan.get("angles") if isinstance(creative_plan.get("angles"), list) else []
        offer_text = str(offer or "the offer").strip() or "the offer"
        is_hebrew = self._is_hebrew_language(language)

        hook_1 = str(headlines[0] if headlines else "").strip()
        hook_2 = str(headlines[1] if len(headlines) > 1 else hook_1).strip()
        hook_3 = str(headlines[2] if len(headlines) > 2 else hook_2).strip()
        angle_1 = str(angles[0] if angles else "").strip()
        angle_2 = str(angles[1] if len(angles) > 1 else angle_1).strip()
        copy_1 = str(primary_texts[0] if primary_texts else "").strip()

        if is_hebrew:
            return [
                (
                    f"צילום פרסומי ריאליסטי, סצנת כאב דרמטית שקשורה ל-{offer_text}. "
                    f"תקריב רגשי, תאורה קולנועית, קומפוזיציה נקייה. "
                    f"טקסט בולט בעברית על התמונה: '{hook_1 or 'הצעה משתלמת יותר'}'. "
                    "ללא לוגואים וללא סימני מים."
                ),
                (
                    f"צילום רחב קולנועי של רגע צורך אמיתי עבור {offer_text}. "
                    f"הדגשת קונפליקט ופתרון עם אווירה אותנטית. "
                    f"טקסט עברי ברור על התמונה: '{hook_2 or 'חוסכים בזמן ובכסף'}'. "
                    f"סגנון: {angle_1 or 'פרימיום אמין'}, איכות גבוהה לפרסומת מטא."
                ),
                (
                    f"קונספט split-screen לפני/אחרי עבור {offer_text}: צד אחד תסכול, צד שני הקלה וביטחון. "
                    f"טקסט עברי קצר על התמונה: '{hook_3 or 'עוברים לפתרון חכם'}'. "
                    f"תת-מסר מהקופי: '{copy_1[:90] if copy_1 else 'יחס אישי ותוצאה טובה יותר'}'. "
                    f"סגנון משלים: {angle_2 or 'דרמטי וממוקד המרה'}."
                ),
            ][:MAX_ART_DIRECTOR_IMAGES]

        return [
            (
                f"Photorealistic ad scene focused on a real pain moment for {offer_text}. "
                f"Emotional close-up, cinematic lighting, clean composition. "
                f"Typography overlay reads exactly: '{hook_1 or 'Get a better deal now'}'. "
                "No logo, no watermark."
            ),
            (
                f"Cinematic wide shot showing context and urgency for {offer_text}. "
                f"Show contrast between stress and relief. "
                f"Typography overlay reads exactly: '{hook_2 or 'Save time and money'}'. "
                f"Visual angle: {angle_1 or 'high-converting direct response creative'}."
            ),
            (
                f"Split-screen before/after concept for {offer_text}. "
                f"Left side pain, right side positive outcome and confidence. "
                f"Typography overlay reads exactly: '{hook_3 or 'Switch to a smarter option'}'. "
                f"Supporting copy tone: {copy_1[:120] if copy_1 else 'fast and trusted solution'}."
            ),
        ][:MAX_ART_DIRECTOR_IMAGES]

    def _generate_images_from_prompts(
        self,
        *,
        prompts: list[str],
        account_id: str,
    ) -> list[str]:
        """
        Generate and upload up to 3 real ad images via Gemini Nano Banana Pro.
        Returns Firebase Storage URLs only.
        """
        prompt_batch = [str(p or "").strip() for p in prompts[:MAX_ART_DIRECTOR_IMAGES] if str(p or "").strip()]
        if not prompt_batch:
            return []

        try:
            asyncio.get_running_loop()
            # Runtime guard: Cloud Functions is sync; if an event loop exists, run sequentially.
            return [
                url
                for i, prompt_text in enumerate(prompt_batch)
                for url in [self._generate_single_prompt_image(prompt_text=prompt_text, account_id=account_id, index=i)]
                if url
            ]
        except RuntimeError:
            return asyncio.run(
                self._generate_images_from_prompts_async(
                    prompts=prompt_batch,
                    account_id=account_id,
                )
            )

    async def _generate_images_from_prompts_async(
        self,
        *,
        prompts: list[str],
        account_id: str,
    ) -> list[str]:
        semaphore = asyncio.Semaphore(MAX_ART_DIRECTOR_IMAGES)
        tasks = [
            self._generate_single_prompt_image_async(
                prompt_text=prompt_text,
                account_id=account_id,
                index=i,
                semaphore=semaphore,
            )
            for i, prompt_text in enumerate(prompts)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        urls: list[str] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Gemini image generation failed for prompt %d: %s", i, result)
                continue
            if isinstance(result, str) and result:
                urls.append(result)
        return urls

    async def _generate_single_prompt_image_async(
        self,
        *,
        prompt_text: str,
        account_id: str,
        index: int,
        semaphore: asyncio.Semaphore,
    ) -> str | None:
        async with semaphore:
            return await asyncio.to_thread(
                self._generate_single_prompt_image,
                prompt_text=prompt_text,
                account_id=account_id,
                index=index,
            )

    def _generate_single_prompt_image(
        self,
        *,
        prompt_text: str,
        account_id: str,
        index: int,
    ) -> str | None:
        image_bytes, mime_type = self._call_nano_banana_pro_image_api(prompt_text=prompt_text)
        if not image_bytes:
            logger.warning("Gemini Nano Banana Pro returned no image bytes for prompt %d", index)
            return None

        file_ext = self._mime_to_extension(mime_type)
        prompt_hash = hashlib.sha1(prompt_text.encode("utf-8")).hexdigest()[:10]
        now_stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        blob_path = (
            f"creative_assets/{account_id}/campaign_builder/"
            f"art_director_{now_stamp}_{index}_{prompt_hash}.{file_ext}"
        )
        url = self.art_director._upload_to_storage(image_bytes, blob_path, content_type=mime_type)
        if not url:
            logger.warning("Firebase upload failed for Gemini image prompt %d", index)
            return None
        return url

    def _call_nano_banana_pro_image_api(self, *, prompt_text: str) -> tuple[bytes | None, str]:
        api_key = str(self.art_director.api_key or "").strip()
        if not api_key:
            logger.warning("Nano Banana Pro skipped: GEMINI_API_KEY is not configured")
            return None, "image/jpeg"

        model_name = str(os.environ.get("GEMINI_IMAGE_MODEL", NANO_BANANA_PRO_IMAGE_MODEL)).strip() or NANO_BANANA_PRO_IMAGE_MODEL
        endpoint = GEMINI_GENERATE_CONTENT_URL.format(model=model_name)
        aspect_ratio = str(os.environ.get("CAMPAIGN_BUILDER_IMAGE_ASPECT_RATIO", "1:1")).strip() or "1:1"
        image_size = str(os.environ.get("CAMPAIGN_BUILDER_IMAGE_SIZE", "1K")).strip() or "1K"
        image_prompt = (
            "Create exactly one photorealistic Meta Ads image asset.\n"
            "Return visual output only, no long textual explanation.\n\n"
            f"{prompt_text}"
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": image_prompt}]}],
            "generationConfig": {
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": image_size,
                },
                "temperature": 0.7,
            },
        }

        try:
            response = requests.post(
                endpoint,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=120,
            )
            response.raise_for_status()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            body = exc.response.text[:500] if exc.response is not None else ""
            logger.warning("Nano Banana Pro HTTP error %s: %s", status, body)
            return None, "image/jpeg"
        except Exception as exc:
            logger.warning("Nano Banana Pro request failed: %s", exc)
            return None, "image/jpeg"

        image_bytes, mime_type = self._extract_image_bytes_from_gemini_response(response.json())
        if image_bytes:
            return image_bytes, mime_type

        # Retry once with explicit modality hint for compatibility across model versions.
        retry_payload = {
            "contents": [{"role": "user", "parts": [{"text": image_prompt}]}],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": image_size,
                },
            },
        }
        try:
            retry_response = requests.post(
                endpoint,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=retry_payload,
                timeout=120,
            )
            retry_response.raise_for_status()
            image_bytes_retry, mime_type_retry = self._extract_image_bytes_from_gemini_response(retry_response.json())
            if image_bytes_retry:
                return image_bytes_retry, mime_type_retry
        except Exception as exc:
            logger.warning("Nano Banana Pro retry failed: %s", exc)

        # Fallback: try Imagen endpoint that is already used by the Art Director pipeline.
        try:
            imagen_bytes = self.art_director._call_imagen_api(prompt_text, aspect_ratio=aspect_ratio)
            if imagen_bytes:
                logger.info("Nano Banana Pro fallback succeeded via Imagen endpoint")
                return imagen_bytes, "image/jpeg"
        except Exception as exc:
            logger.warning("Imagen fallback failed: %s", exc)

        return None, "image/jpeg"

    @staticmethod
    def _extract_image_bytes_from_gemini_response(payload: dict[str, Any]) -> tuple[bytes | None, str]:
        """Parse inline image bytes from Gemini generateContent responses."""
        if not isinstance(payload, dict):
            return None, "image/jpeg"

        candidates = payload.get("candidates")
        if isinstance(candidates, list):
            for candidate in candidates:
                content = candidate.get("content") if isinstance(candidate, dict) else {}
                parts = content.get("parts") if isinstance(content, dict) else []
                if not isinstance(parts, list):
                    continue
                for part in parts:
                    if not isinstance(part, dict):
                        continue
                    inline_data = part.get("inlineData") or part.get("inline_data")
                    if not isinstance(inline_data, dict):
                        continue
                    raw_b64 = (
                        inline_data.get("data")
                        or inline_data.get("bytesBase64Encoded")
                        or inline_data.get("bytes_base64_encoded")
                    )
                    if not raw_b64:
                        continue
                    mime_type = str(inline_data.get("mimeType") or inline_data.get("mime_type") or "image/jpeg")
                    try:
                        return base64.b64decode(raw_b64), mime_type
                    except Exception:
                        logger.warning("Failed to decode Gemini inline image bytes")
                        return None, mime_type

        # Defensive fallback for Imagen-like response shapes.
        predictions = payload.get("predictions")
        if isinstance(predictions, list) and predictions:
            first = predictions[0] if isinstance(predictions[0], dict) else {}
            raw_b64 = first.get("bytesBase64Encoded") or first.get("bytes_base64_encoded")
            if raw_b64:
                try:
                    return base64.b64decode(raw_b64), "image/jpeg"
                except Exception:
                    logger.warning("Failed to decode image bytes from predictions fallback")

        return None, "image/jpeg"

    @staticmethod
    def _mime_to_extension(mime_type: str) -> str:
        normalized = str(mime_type or "").strip().lower()
        if "png" in normalized:
            return "png"
        if "webp" in normalized:
            return "webp"
        return "jpg"

    def regenerate_images(
        self,
        *,
        user_id: str,
        account_id: str,
        draft_id: str,
        instruction: str = "",
    ) -> dict[str, Any]:
        """Re-run ONLY the Art Director agent and fetch new image URLs."""
        self._ensure_account_exists(user_id, account_id)
        draft_ref = self._draft_ref(user_id, account_id, draft_id)
        draft_doc = draft_ref.get()
        if not draft_doc.exists:
            raise ValueError("Draft not found")

        draft = draft_doc.to_dict() or {}
        blocks = draft.get("blocks", {})
        inputs = self._normalize_inputs(draft.get("inputs", {}), blocks=blocks)
        context = self._build_context(user_id=user_id, account_id=account_id, inputs=inputs)

        creative_plan = blocks.get("creativePlan", {})
        if not isinstance(creative_plan, dict) or not creative_plan:
            raise ValueError("Creative plan must exist before generating images")

        offer = str(inputs.get("offer") or "").strip()
        language = str(inputs.get("language") or "en").strip()

        image_concepts = self.ai.generate_image_concepts(
            offer=offer, language=language, creative_plan=creative_plan,
        )
        prompts = self._ensure_image_prompts(
            image_concepts=image_concepts,
            creative_plan=creative_plan,
            offer=offer,
            language=language,
        )
        image_urls = self._generate_images_from_prompts(prompts=prompts, account_id=account_id)

        next_blocks = dict(blocks)
        next_blocks["imageConcepts"] = {
            "creative_concept_reasoning": image_concepts.get("creative_concept_reasoning", ""),
            "image_generation_prompts": prompts,
            "imageUrls": image_urls,
        }

        validation = self._validate_blocks(next_blocks, inputs)
        update = {
            "blocks": next_blocks,
            "validation": validation,
            "status": "ready_for_publish" if validation["isValid"] else "draft",
            "updatedAt": datetime.now(timezone.utc),
        }
        draft_ref.update(update)

        merged = {**draft, **update, "id": draft_id}
        return self._serialize(merged)

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
        if not candidate:
            # Avoid multi-call repair when the model returned nothing;
            # normalization fallback will build a valid draft quickly.
            return candidate
        offer = str(inputs.get("offer") or "").strip()
        language = str(inputs.get("language") or "en")
        is_hebrew = self._is_hebrew_language(language)

        blocks_to_repair: list[str] = []
        if self._audience_block_needs_regen(candidate.get("audiencePlan"), offer):
            blocks_to_repair.append("audiencePlan")
        if self._creative_block_needs_regen(candidate.get("creativePlan"), offer, is_hebrew):
            blocks_to_repair.append("creativePlan")

        if not blocks_to_repair:
            return candidate

        instructions = {
            "audiencePlan": (
                "Generate an audiencePlan only. Interests must be short Meta targeting categories (1-4 words each), "
                "not full sentences and not a pasted user brief."
            ),
            "creativePlan": (
                "Generate a creativePlan only. DO NOT parrot the raw user brief. "
                "Write original, concise, native-language copy. Avoid mixed-language output."
            ),
        }

        # Keep generation latency bounded: repair up to 2 blocks (audience + creative).
        for block_type in blocks_to_repair[:2]:
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
            "clientBackgroundBrief": str(
                payload.get("clientBackgroundBrief")
                or payload.get("clientBrief")
                or ""
            ).strip(),
        }

    @staticmethod
    def _resolve_page_id(inputs: dict[str, Any], account_data: dict[str, Any]) -> str:
        defaults = account_data.get("defaults", {}) if isinstance(account_data.get("defaults"), dict) else {}
        settings = account_data.get("settings", {}) if isinstance(account_data.get("settings"), dict) else {}
        candidates = [
            inputs.get("pageId"),
            inputs.get("pageID"),
            account_data.get("defaultPageId"),
            account_data.get("defaultPageID"),
            account_data.get("pageId"),
            account_data.get("pageID"),
            account_data.get("metaPageId"),
            account_data.get("facebookPageId"),
            account_data.get("fbPageId"),
            defaults.get("pageId"),
            defaults.get("defaultPageId"),
            settings.get("pageId"),
            settings.get("defaultPageId"),
        ]
        for candidate in candidates:
            value = str(candidate or "").strip()
            if value:
                return value
        return ""

    @staticmethod
    def _resolve_page_id_from_account_defaults(account_data: dict[str, Any]) -> str:
        defaults = account_data.get("defaults", {}) if isinstance(account_data.get("defaults"), dict) else {}
        settings = account_data.get("settings", {}) if isinstance(account_data.get("settings"), dict) else {}
        candidates = [
            account_data.get("defaultPageId"),
            account_data.get("defaultPageID"),
            account_data.get("pageId"),
            account_data.get("pageID"),
            account_data.get("metaPageId"),
            account_data.get("facebookPageId"),
            account_data.get("fbPageId"),
            defaults.get("pageId"),
            defaults.get("defaultPageId"),
            settings.get("pageId"),
            settings.get("defaultPageId"),
        ]
        for candidate in candidates:
            value = str(candidate or "").strip()
            if value:
                return value
        return ""

    @staticmethod
    def _resolve_destination_url(inputs: dict[str, Any], account_data: dict[str, Any]) -> str:
        defaults = account_data.get("defaults", {}) if isinstance(account_data.get("defaults"), dict) else {}
        settings = account_data.get("settings", {}) if isinstance(account_data.get("settings"), dict) else {}
        candidates = [
            inputs.get("destinationUrl"),
            account_data.get("defaultDestinationUrl"),
            account_data.get("destinationUrl"),
            account_data.get("websiteUrl"),
            account_data.get("landingPageUrl"),
            defaults.get("destinationUrl"),
            defaults.get("defaultDestinationUrl"),
            settings.get("destinationUrl"),
        ]
        for candidate in candidates:
            value = str(candidate or "").strip()
            if value:
                return value
        return "https://example.com"

    @staticmethod
    def _is_hebrew_language(language: str) -> bool:
        raw = str(language or "").strip()
        normalized = raw.lower()
        has_hebrew_chars = bool(re.search(r"[\u0590-\u05FF]", raw))
        return (
            normalized.startswith("he")
            or "hebrew" in normalized
            or "עברית" in raw
            or "עבר" in raw
            or has_hebrew_chars
        )

    @staticmethod
    def _sanitize_offer_for_copy(offer: str, is_hebrew: bool) -> str:
        compact = re.sub(r"\s+", " ", str(offer or "")).strip()
        if compact:
            return compact[:80]
        return "הצעה חדשה" if is_hebrew else "your offer"

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
    def _default_primary_texts(offer: str, is_hebrew: bool) -> list[str]:
        """Offer-aware placeholder texts — used only as last resort."""
        if is_hebrew:
            return [
                f"מחפשים {offer}? השאירו פרטים ונחזור עם הצעה מותאמת.",
                f"קבלו הצעת מחיר ל{offer} — תהליך מהיר ובלי התחייבות.",
                f"{offer} — גלו למה אלפי לקוחות כבר בחרו בנו.",
            ]
        return [
            f"Looking for {offer}? Get a personalized quote in minutes.",
            f"Compare {offer} options and choose the best fit for you.",
            f"{offer} — find out why thousands already trust us.",
        ]

    @staticmethod
    def _default_headlines(offer: str, is_hebrew: bool) -> list[str]:
        """Offer-aware placeholder headlines — used only as last resort."""
        if is_hebrew:
            return [
                f"{offer} — התחילו עכשיו",
                f"הצעה מיוחדת ל{offer}",
                f"{offer} במחיר משתלם",
            ]
        return [
            f"{offer} — Get Started",
            f"Best {offer} Deal",
            f"{offer} — Act Now",
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
        angles = creative_plan.get("angles")
        if not isinstance(primary_texts, list) or not primary_texts:
            return True
        if not isinstance(headlines, list) or not headlines:
            return True
        if not isinstance(angles, list) or not angles:
            return True

        texts = [str(x or "") for x in [*primary_texts, *headlines] if str(x or "").strip()]
        angle_texts = [str(x or "") for x in angles if str(x or "").strip()]
        if not texts:
            return True
        if not angle_texts:
            return True

        normalized_offer = str(offer or "").strip()
        if normalized_offer and len(normalized_offer) > 35:
            if any(normalized_offer in text for text in texts):
                return True

        if is_hebrew:
            if self._creative_has_language_mismatch(texts):
                return True
            if self._creative_has_language_mismatch(angle_texts):
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
        client_background_brief = str(inputs.get("clientBackgroundBrief") or "").strip()
        client_background_line = (
            f"Client Background (persistent context): {client_background_brief}\n"
            if client_background_brief
            else ""
        )
        return (
            "=== USER REQUEST (HIGHEST PRIORITY) ===\n"
            f"Product/Offer: {inputs.get('offer') or ''}\n"
            f"Objective: {inputs.get('objective') or DEFAULT_OBJECTIVE}\n"
            f"Language: {inputs.get('language') or 'en'}\n"
            f"Target Geo: {inputs.get('country') or 'US'}\n"
            f"{client_background_line}"
            "Instruction: Use the client background only as stable business context, "
            "but tailor all output to the current Product/Offer."
        )

    @staticmethod
    def _format_account_context_section(
        benchmark_snapshot: dict[str, Any],
        *,
        client_background_brief: str = "",
    ) -> str:
        benchmark_text = json.dumps(benchmark_snapshot or {}, ensure_ascii=False, default=str)
        brief_text = str(client_background_brief or "").strip()
        brief_line = f"Client Background (reference): {brief_text}\n" if brief_text else ""
        return (
            "=== ACCOUNT CONTEXT (SECONDARY - USE ONLY FOR TONE/METRICS) ===\n"
            f"{brief_line}"
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
