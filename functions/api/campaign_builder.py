"""API endpoints for AI Campaign Builder."""
from __future__ import annotations

import json
import logging

from api.accounts import _cors_response, verify_auth
from services.campaign_builder_service import (
    CampaignBuilderService,
    DEFAULT_OBJECTIVE,
    ValidationError,
)
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)


def handle_campaign_builder(request):
    """Route handler for /api/ai/campaign-builder endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path == "/api/ai/campaign-builder/drafts" and request.method == "POST":
            return _create_draft(request, user_id)

        if path.startswith("/api/ai/campaign-builder/drafts/"):
            suffix = path.split("/api/ai/campaign-builder/drafts/")[1]
            parts = [p for p in suffix.split("/") if p]
            if not parts:
                return _cors_response(json.dumps({"error": "Draft id missing"}), 400)
            draft_id = parts[0]

            if len(parts) == 1 and request.method == "GET":
                return _get_draft(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "regenerate" and request.method == "POST":
                return _regenerate_block(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "update" and request.method == "POST":
                return _update_block(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "preflight" and request.method == "POST":
                return _preflight(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "regenerate-images" and request.method == "POST":
                return _regenerate_images(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "publish" and request.method == "POST":
                return _publish(request, user_id, draft_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 401)
    except ValidationError as exc:
        return _cors_response(json.dumps({"error": str(exc), "code": "VALIDATION_ERROR"}), 422)
    except ValueError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 400)
    except Exception as exc:
        logger.error("Campaign Builder API error: %s", exc, exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _create_draft(request, user_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    inputs = _coerce_generate_inputs(payload)

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)
    missing = []
    if not str(inputs.get("objective") or "").strip():
        missing.append("objective")
    if not str(inputs.get("offer") or "").strip():
        missing.append("offer/product")
    if float(inputs.get("dailyBudget", 0) or 0) <= 0:
        missing.append("budget")
    if not str(inputs.get("language") or "").strip():
        missing.append("language")
    if missing:
        return _cors_response(
            json.dumps({"error": f"Missing required draft fields: {', '.join(missing)}"}),
            400,
        )

    service = CampaignBuilderService(get_db())
    draft_id, draft = service.create_draft(
        user_id=user_id,
        account_id=account_id,
        inputs=inputs,
        origin="manual",
    )
    return _cors_response(
        json.dumps(
            {
                "draftId": draft_id,
                "draft": draft,
                "validation": draft.get("validation", {}),
                "benchmarkSnapshot": draft.get("benchmarkSnapshot", {}),
            }
        )
    )


def _get_draft(request, user_id: str, draft_id: str):
    account_id = request.args.get("accountId", "")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    service = CampaignBuilderService(get_db())
    draft = service.get_draft(user_id=user_id, account_id=account_id, draft_id=draft_id)
    return _cors_response(json.dumps({"draft": draft}))


def _regenerate_block(request, user_id: str, draft_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    block_type = payload.get("blockType")
    instruction = payload.get("userInstructions", payload.get("instruction", ""))

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)
    if not block_type:
        return _cors_response(json.dumps({"error": "blockType required"}), 400)

    service = CampaignBuilderService(get_db())
    draft = service.regenerate_block(
        user_id=user_id,
        account_id=account_id,
        draft_id=draft_id,
        block_type=str(block_type),
        instruction=str(instruction or ""),
    )
    return _cors_response(json.dumps({"draft": draft, "validation": draft.get("validation", {})}))


def _update_block(request, user_id: str, draft_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    block_type = payload.get("blockType")
    value = payload.get("value")

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)
    if not block_type:
        return _cors_response(json.dumps({"error": "blockType required"}), 400)

    service = CampaignBuilderService(get_db())
    draft = service.update_block(
        user_id=user_id,
        account_id=account_id,
        draft_id=draft_id,
        block_type=str(block_type),
        value=value,
    )
    return _cors_response(json.dumps({"draft": draft, "validation": draft.get("validation", {})}))


def _preflight(request, user_id: str, draft_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    service = CampaignBuilderService(get_db())
    result = service.preflight(user_id=user_id, account_id=account_id, draft_id=draft_id)
    return _cors_response(json.dumps(result))


def _publish(request, user_id: str, draft_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    confirm_high_budget = bool(payload.get("confirmHighBudget", False))
    page_id_override = str(payload.get("pageId") or "").strip()
    destination_url_override = str(payload.get("destinationUrl") or "").strip()
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    service = CampaignBuilderService(get_db())
    result = service.publish_draft(
        user_id=user_id,
        account_id=account_id,
        draft_id=draft_id,
        confirm_high_budget=confirm_high_budget,
        page_id_override=page_id_override,
        destination_url_override=destination_url_override,
    )
    return _cors_response(json.dumps(result))


def _regenerate_images(request, user_id: str, draft_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    instruction = payload.get("userInstructions", payload.get("instruction", ""))

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    service = CampaignBuilderService(get_db())
    draft = service.regenerate_images(
        user_id=user_id,
        account_id=account_id,
        draft_id=draft_id,
        instruction=str(instruction or ""),
    )
    return _cors_response(json.dumps({"draft": draft, "validation": draft.get("validation", {})}))


def _coerce_generate_inputs(payload: dict) -> dict:
    """Accept both legacy nested inputs and new flat request shape."""
    if isinstance(payload.get("inputs"), dict):
        inputs = dict(payload["inputs"])
    else:
        objective_raw = str(payload.get("objective") or payload.get("campaignObjective") or "").strip().lower()
        if objective_raw in {"lead", "leads", "lead_gen", "lead generation", "outcome_leads"}:
            objective = "OUTCOME_LEADS"
        elif objective_raw in {"sales", "sale", "outcome_sales"}:
            objective = "OUTCOME_SALES"
        else:
            objective = str(payload.get("objective") or DEFAULT_OBJECTIVE)

        offer = (
            payload.get("offer")
            or payload.get("product")
            or payload.get("offerProduct")
            or payload.get("productOffer")
            or ""
        )
        country = payload.get("targetGeo") or payload.get("country") or "US"
        budget = payload.get("budget") if payload.get("budget") is not None else payload.get("dailyBudget")
        language = payload.get("language") or "en"
        campaign_name = payload.get("campaignName") or f"{str(offer or 'AI Campaign')[:36]} - {objective}"

        inputs = {
            "objective": objective,
            "offer": offer,
            "country": country,
            "language": language,
            "dailyBudget": budget or 0,
            "campaignName": campaign_name,
            "pageId": payload.get("pageId") or "",
            "destinationUrl": payload.get("destinationUrl") or "",
            "brandVoice": payload.get("brandVoice") or "",
        }

    try:
        inputs["dailyBudget"] = float(inputs.get("dailyBudget", 0) or 0)
    except (TypeError, ValueError):
        inputs["dailyBudget"] = 0
    inputs["offer"] = str(inputs.get("offer") or "")
    inputs["language"] = str(inputs.get("language") or "")
    inputs["country"] = str(inputs.get("country") or "US")
    inputs["objective"] = str(inputs.get("objective") or DEFAULT_OBJECTIVE)
    inputs["campaignName"] = str(inputs.get("campaignName") or "AI Campaign Launch")
    return inputs
