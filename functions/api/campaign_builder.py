"""API endpoints for AI Campaign Builder."""
from __future__ import annotations

import json
import logging

from api.accounts import _cors_response, verify_auth
from services.campaign_builder_service import CampaignBuilderService
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

            if len(parts) == 2 and parts[1] == "preflight" and request.method == "POST":
                return _preflight(request, user_id, draft_id)

            if len(parts) == 2 and parts[1] == "publish" and request.method == "POST":
                return _publish(request, user_id, draft_id)

        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 401)
    except ValueError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 400)
    except Exception as exc:
        logger.error("Campaign Builder API error: %s", exc, exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _create_draft(request, user_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    inputs = payload.get("inputs") if isinstance(payload.get("inputs"), dict) else {}

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

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
    instruction = payload.get("instruction", "")

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
    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    service = CampaignBuilderService(get_db())
    result = service.publish_draft(
        user_id=user_id,
        account_id=account_id,
        draft_id=draft_id,
        confirm_high_budget=confirm_high_budget,
    )
    return _cors_response(json.dumps(result))
