"""API endpoints for Meta account connection and management."""
import json
import logging
import os
import re
from datetime import datetime, timezone
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
PAGE_ACCESS_STATUSES = {"ok", "missing_permissions", "no_pages", "token_error"}


def _normalize_currency_code(raw_currency) -> str:
    raw = str(raw_currency or "").strip()
    if not raw:
        return "USD"

    aliases = {
        "NIS": "ILS",
        "SHEKEL": "ILS",
        "SHEKELS": "ILS",
        "ISRAELI SHEKEL": "ILS",
        "ISRAELI SHEKELS": "ILS",
        "NEW ISRAELI SHEKEL": "ILS",
        "NEW ISRAELI SHEKELS": "ILS",
        "₪": "ILS",
    }
    upper = raw.upper()
    if upper in aliases:
        return aliases[upper]
    if "₪" in raw:
        return "ILS"

    code_match = re.search(r"\b[A-Z]{3}\b", upper)
    if code_match:
        code = code_match.group(0)
        return "ILS" if code == "NIS" else code

    return "USD"


def verify_auth(request) -> str:
    """Extract and verify Firebase Auth token from request. Returns user ID."""
    from firebase_admin import auth as firebase_auth

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise PermissionError("Missing or invalid Authorization header")
    id_token = auth_header.split("Bearer ")[1]
    decoded = firebase_auth.verify_id_token(id_token)
    return decoded["uid"]


def handle_accounts(request):
    """Route handler for /api/accounts endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        path = request.path.rstrip("/")

        # OAuth callback comes from Facebook — no Firebase auth header available
        if path == "/api/accounts/callback" and request.method == "GET":
            return _handle_callback(request)

        user_id = verify_auth(request)

        if path == "/api/accounts" and request.method == "GET":
            return _get_accounts(user_id)
        elif path == "/api/accounts/connect" and request.method == "POST":
            return _initiate_connect(request, user_id)
        elif path.startswith("/api/accounts/") and path.endswith("/pages") and request.method == "GET":
            account_id = path.split("/api/accounts/")[1].split("/pages")[0]
            return _get_account_pages(user_id, account_id)
        elif path.startswith("/api/accounts/") and path.endswith("/defaults/page") and request.method == "POST":
            account_id = path.split("/api/accounts/")[1].split("/defaults/page")[0]
            return _set_default_page(request, user_id, account_id)
        elif path.startswith("/api/accounts/") and path.endswith("/defaults/page") and request.method == "DELETE":
            account_id = path.split("/api/accounts/")[1].split("/defaults/page")[0]
            return _clear_default_page(user_id, account_id)
        elif path.endswith("/managed") and request.method == "POST":
            account_id = path.split("/api/accounts/")[1].split("/managed")[0]
            return _toggle_managed(request, user_id, account_id)
        elif path.startswith("/api/accounts/") and request.method == "DELETE":
            account_id = path.split("/api/accounts/")[1]
            return _disconnect_account(user_id, account_id)
        else:
            return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as e:
        return _cors_response(json.dumps({"error": str(e)}), 401)
    except Exception as e:
        logger.error(f"Account API error: {e}", exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_accounts(user_id: str):
    db = get_db()
    accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")
    docs = accounts_ref.stream()

    accounts = []
    for doc in docs:
        data = doc.to_dict()
        currency = _normalize_currency_code(
            data.get("currency")
            or data.get("currencyCode")
            or data.get("accountCurrency")
            or data.get("account_currency")
            or data.get("currencySymbol")
        )
        accounts.append({
            "id": doc.id,
            "accountName": data.get("accountName"),
            "currency": currency,
            "businessName": data.get("businessName"),
            "isActive": data.get("isActive", False),
            "isManagedByPlatform": data.get("isManagedByPlatform", False),
            "tokenExpiry": data.get("tokenExpiry").isoformat() if data.get("tokenExpiry") else None,
            "kpiSummary": data.get("kpiSummary"),
            "kpiUpdatedAt": data.get("kpiUpdatedAt").isoformat() if data.get("kpiUpdatedAt") else None,
            "defaultPageId": data.get("defaultPageId"),
            "defaultPageName": data.get("defaultPageName"),
            "pageAccessStatus": data.get("pageAccessStatus"),
        })

    return _cors_response(json.dumps({"accounts": accounts}))


def _account_ref(user_id: str, account_id: str):
    db = get_db()
    return db.collection("users").document(user_id).collection("metaAccounts").document(account_id)


def _get_account_pages(user_id: str, account_id: str):
    doc_ref = _account_ref(user_id, account_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _cors_response(json.dumps({"error": "Account not found"}), 404)

    from services.meta_auth import fetch_pages_with_status, get_decrypted_token

    try:
        token, _ = get_decrypted_token(user_id, account_id)
        pages, page_access_status = fetch_pages_with_status(token)
    except Exception as exc:
        logger.warning("Failed to resolve pages for account %s/%s: %s", user_id, account_id, exc)
        pages = []
        page_access_status = "token_error"

    now = datetime.now(timezone.utc)
    update_payload = {
        "pageAccessStatus": page_access_status,
        "pageAccessCheckedAt": now,
        "updatedAt": now,
    }
    if page_access_status == "ok" and pages:
        stored = doc.to_dict() or {}
        if not str(stored.get("defaultPageId") or "").strip():
            update_payload["defaultPageId"] = pages[0].get("pageId")
            update_payload["defaultPageName"] = pages[0].get("pageName")
    doc_ref.set(update_payload, merge=True)

    logger.info(
        "Fetched account pages user=%s account=%s status=%s count=%s",
        user_id,
        account_id,
        page_access_status,
        len(pages),
    )
    return _cors_response(
        json.dumps(
            {
                "pages": pages,
                "pageAccessStatus": page_access_status,
            }
        )
    )


def _set_default_page(request, user_id: str, account_id: str):
    payload = request.get_json(silent=True) or {}
    page_id = str(payload.get("pageId") or "").strip()
    page_name = str(payload.get("pageName") or "").strip()
    clear_default = bool(payload.get("clear", False))
    if clear_default:
        return _clear_default_page(user_id, account_id)
    if not page_id:
        return _cors_response(json.dumps({"error": "pageId required"}), 400)

    doc_ref = _account_ref(user_id, account_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _cors_response(json.dumps({"error": "Account not found"}), 404)

    if not page_name:
        # Best effort lookup to display friendly defaultPageName.
        try:
            from services.meta_auth import fetch_pages_with_status, get_decrypted_token

            token, _ = get_decrypted_token(user_id, account_id)
            pages, page_access_status = fetch_pages_with_status(token)
            if page_access_status in PAGE_ACCESS_STATUSES:
                doc_ref.set(
                    {
                        "pageAccessStatus": page_access_status,
                        "pageAccessCheckedAt": datetime.now(timezone.utc),
                    },
                    merge=True,
                )
            match = next((p for p in pages if str(p.get("pageId") or "") == page_id), None)
            if match:
                page_name = str(match.get("pageName") or "").strip()
        except Exception as exc:
            logger.warning("Failed to lookup page name for default page %s/%s: %s", account_id, page_id, exc)

    now = datetime.now(timezone.utc)
    doc_ref.set(
        {
            "defaultPageId": page_id,
            "defaultPageName": page_name,
            "updatedAt": now,
        },
        merge=True,
    )
    logger.info("Default page set user=%s account=%s page=%s", user_id, account_id, page_id)
    return _cors_response(
        json.dumps(
            {
                "success": True,
                "defaultPageId": page_id,
                "defaultPageName": page_name,
            }
        )
    )


def _clear_default_page(user_id: str, account_id: str):
    doc_ref = _account_ref(user_id, account_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _cors_response(json.dumps({"error": "Account not found"}), 404)

    now = datetime.now(timezone.utc)
    doc_ref.set(
        {
            "defaultPageId": "",
            "defaultPageName": "",
            "updatedAt": now,
        },
        merge=True,
    )
    logger.info("Default page cleared user=%s account=%s", user_id, account_id)
    return _cors_response(
        json.dumps(
            {
                "success": True,
                "defaultPageId": "",
                "defaultPageName": "",
            }
        )
    )


def _normalize_base_url(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _resolve_frontend_base_url(request) -> str:
    """Resolve frontend base URL from request first, then fallback to configured env."""
    origin = _normalize_base_url(request.headers.get("Origin", ""))
    if origin:
        return origin

    forwarded_host = _normalize_base_url(request.headers.get("X-Forwarded-Host", ""))
    forwarded_proto = _normalize_base_url(request.headers.get("X-Forwarded-Proto", ""))
    if forwarded_host:
        return f"{forwarded_proto or 'https'}://{forwarded_host}"

    host = _normalize_base_url(request.headers.get("Host", ""))
    if host:
        proto = forwarded_proto or ("http" if host.startswith("localhost") or host.startswith("127.0.0.1") else "https")
        return f"{proto}://{host}"

    url_root = _normalize_base_url(getattr(request, "url_root", ""))
    if url_root:
        return url_root

    return _normalize_base_url(FRONTEND_URL) or "http://localhost:5173"


def _get_callback_uri(request) -> str:
    """Build OAuth callback URI from the current request domain to avoid localhost misrouting in production."""
    return f"{_resolve_frontend_base_url(request)}/api/accounts/callback"


def _initiate_connect(request, user_id: str):
    from services.meta_auth import encode_state, get_oauth_url

    redirect_uri = _get_callback_uri(request)
    state = encode_state(user_id)
    oauth_url = get_oauth_url(redirect_uri, state)
    return _cors_response(json.dumps({"authUrl": oauth_url, "redirectUri": redirect_uri}))


def _handle_callback(request):
    """Handle OAuth callback from Facebook. User is identified via encrypted state param."""
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")
    frontend_base = _resolve_frontend_base_url(request)

    if error:
        error_desc = request.args.get("error_description", "Unknown error")
        logger.warning(f"OAuth denied: {error} — {error_desc}")
        redirect = f"{frontend_base}/settings/accounts?error={error}&error_description={error_desc}"
        return "", 302, {"Location": redirect}

    if not code or not state:
        return "", 302, {"Location": f"{frontend_base}/settings/accounts?error=missing_params"}

    try:
        from services.meta_auth import decode_state
        user_id = decode_state(state)
    except Exception as e:
        logger.error(f"Invalid OAuth state: {e}")
        return "", 302, {"Location": f"{frontend_base}/settings/accounts?error=invalid_state"}

    try:
        from services.meta_auth import (
            exchange_code_for_token,
            fetch_ad_accounts,
            fetch_pages_with_status,
            store_account_with_token,
        )
        redirect_uri = _get_callback_uri(request)
        token_data = exchange_code_for_token(code, redirect_uri)
        access_token = token_data["access_token"]
        token_expiry = token_data["token_expiry"]

        ad_accounts = fetch_ad_accounts(access_token)

        # Auto-fetch Facebook Pages so we can store defaultPageId
        pages, page_access_status = fetch_pages_with_status(access_token)
        first_page_id = pages[0]["pageId"] if len(pages) == 1 else ""
        first_page_name = pages[0]["pageName"] if len(pages) == 1 else ""
        if len(pages) == 1:
            logger.info(f"Found {len(pages)} Facebook Pages, using '{first_page_name}' ({first_page_id}) as default")
        elif len(pages) > 1:
            logger.info(
                "Found %s Facebook Pages; skipping auto default page assignment to avoid cross-account mismatch",
                len(pages),
            )
        else:
            logger.info("No Facebook pages found during connect: status=%s", page_access_status)

        connected = []
        for account in ad_accounts:
            account_id = store_account_with_token(
                user_id,
                account,
                access_token,
                token_expiry,
                default_page_id=first_page_id,
                default_page_name=first_page_name,
                page_access_status=page_access_status,
            )
            connected.append(account_id)

        logger.info(f"Connected {len(connected)} accounts for user {user_id}")
        redirect = f"{frontend_base}/settings/accounts?success=true&count={len(connected)}"
        return "", 302, {"Location": redirect}

    except Exception as e:
        logger.error(f"OAuth token exchange failed: {e}", exc_info=True)
        return "", 302, {"Location": f"{frontend_base}/settings/accounts?error=token_exchange_failed"}


def _toggle_managed(request, user_id: str, account_id: str):
    payload = request.get_json(silent=True) or {}
    managed = bool(payload.get("isManagedByPlatform", False))
    db = get_db()
    doc_ref = db.collection("users").document(user_id).collection("metaAccounts").document(account_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _cors_response(json.dumps({"error": "Account not found"}), 404)
    doc_ref.update({"isManagedByPlatform": managed})
    return _cors_response(json.dumps({"success": True, "isManagedByPlatform": managed}))


def _disconnect_account(user_id: str, account_id: str):
    db = get_db()
    doc_ref = db.collection("users").document(user_id).collection("metaAccounts").document(account_id)
    doc = doc_ref.get()
    if not doc.exists:
        return _cors_response(json.dumps({"error": "Account not found"}), 404)

    doc_ref.update({"isActive": False})
    return _cors_response(json.dumps({"success": True}))


def _cors_response(body, status=200):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Content-Type": "application/json",
    }
    return body, status, headers
