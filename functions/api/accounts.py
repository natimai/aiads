"""API endpoints for Meta account connection and management."""
import json
import logging
import os
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


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
        accounts.append({
            "id": doc.id,
            "accountName": data.get("accountName"),
            "currency": data.get("currency"),
            "businessName": data.get("businessName"),
            "isActive": data.get("isActive", False),
            "isManagedByPlatform": data.get("isManagedByPlatform", False),
            "tokenExpiry": data.get("tokenExpiry").isoformat() if data.get("tokenExpiry") else None,
            "kpiSummary": data.get("kpiSummary"),
            "kpiUpdatedAt": data.get("kpiUpdatedAt").isoformat() if data.get("kpiUpdatedAt") else None,
            "defaultPageId": data.get("defaultPageId"),
            "defaultPageName": data.get("defaultPageName"),
        })

    return _cors_response(json.dumps({"accounts": accounts}))


def _get_callback_uri(_request) -> str:
    """Build the OAuth callback URI — always through the frontend/proxy so Vite handles routing."""
    return f"{FRONTEND_URL}/api/accounts/callback"


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

    if error:
        error_desc = request.args.get("error_description", "Unknown error")
        logger.warning(f"OAuth denied: {error} — {error_desc}")
        redirect = f"{FRONTEND_URL}/settings/accounts?error={error}&error_description={error_desc}"
        return "", 302, {"Location": redirect}

    if not code or not state:
        return "", 302, {"Location": f"{FRONTEND_URL}/settings/accounts?error=missing_params"}

    try:
        from services.meta_auth import decode_state
        user_id = decode_state(state)
    except Exception as e:
        logger.error(f"Invalid OAuth state: {e}")
        return "", 302, {"Location": f"{FRONTEND_URL}/settings/accounts?error=invalid_state"}

    try:
        from services.meta_auth import exchange_code_for_token, fetch_ad_accounts, fetch_pages, store_account_with_token
        redirect_uri = _get_callback_uri(request)
        token_data = exchange_code_for_token(code, redirect_uri)
        access_token = token_data["access_token"]
        token_expiry = token_data["token_expiry"]

        ad_accounts = fetch_ad_accounts(access_token)

        # Auto-fetch Facebook Pages so we can store defaultPageId
        pages = fetch_pages(access_token)
        first_page_id = pages[0]["pageId"] if pages else ""
        first_page_name = pages[0]["pageName"] if pages else ""
        if pages:
            logger.info(f"Found {len(pages)} Facebook Pages, using '{first_page_name}' ({first_page_id}) as default")

        connected = []
        for account in ad_accounts:
            account_id = store_account_with_token(
                user_id,
                account,
                access_token,
                token_expiry,
                default_page_id=first_page_id,
                default_page_name=first_page_name,
            )
            connected.append(account_id)

        logger.info(f"Connected {len(connected)} accounts for user {user_id}")
        redirect = f"{FRONTEND_URL}/settings/accounts?success=true&count={len(connected)}"
        return "", 302, {"Location": redirect}

    except Exception as e:
        logger.error(f"OAuth token exchange failed: {e}", exc_info=True)
        return "", 302, {"Location": f"{FRONTEND_URL}/settings/accounts?error=token_exchange_failed"}


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
