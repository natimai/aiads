import os
import json
import logging
import re
import requests
from urllib.parse import quote
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet, InvalidToken
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v22.0"
PAGE_ACCESS_STATUSES = {"ok", "missing_permissions", "no_pages", "token_error"}
META_TOKEN_PREFIXES = ("EA", "IG")


def get_fernet(key: str | bytes | None = None):
    key = key or os.environ.get("TOKEN_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(token: str) -> str:
    return get_fernet().encrypt(token.encode()).decode()


def _get_fallback_encryption_keys() -> list[str]:
    raw = str(os.environ.get("TOKEN_ENCRYPTION_KEY_FALLBACKS") or "").strip()
    if not raw:
        return []
    return [k.strip() for k in re.split(r"[,\n;]+", raw) if k.strip()]


def _looks_like_plain_meta_token(value: str) -> bool:
    token = str(value or "").strip()
    if not token:
        return False
    return token.startswith(META_TOKEN_PREFIXES) and len(token) > 24


def decrypt_token(encrypted: str, *, return_source: bool = False) -> str | tuple[str, str]:
    token_payload = str(encrypted or "").strip()
    if not token_payload:
        raise ValueError("Missing Meta access token payload")

    primary_key = os.environ.get("TOKEN_ENCRYPTION_KEY")
    if not primary_key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY not configured")

    attempted_keys: list[tuple[str, str]] = [("primary", primary_key)]
    for fallback_key in _get_fallback_encryption_keys():
        if fallback_key != primary_key:
            attempted_keys.append(("fallback", fallback_key))

    last_error: Exception | None = None
    for key_type, key_value in attempted_keys:
        try:
            plain = get_fernet(key_value).decrypt(token_payload.encode()).decode()
            if return_source:
                return plain, key_type
            return plain
        except Exception as exc:
            last_error = exc

    if _looks_like_plain_meta_token(token_payload):
        logger.warning("Detected legacy plaintext Meta token payload; using compatibility fallback.")
        if return_source:
            return token_payload, "plaintext"
        return token_payload

    raise InvalidToken("Failed to decrypt Meta access token") from last_error


def encode_state(user_id: str) -> str:
    """Encrypt user_id into a state parameter for CSRF protection."""
    payload = json.dumps({"uid": user_id, "ts": datetime.now(timezone.utc).timestamp()})
    return get_fernet().encrypt(payload.encode()).decode()


def decode_state(state: str) -> str:
    """Decrypt state parameter and return user_id. Raises on tampered/expired state."""
    payload = json.loads(get_fernet().decrypt(state.encode()).decode())
    ts = payload.get("ts", 0)
    if datetime.now(timezone.utc).timestamp() - ts > 600:
        raise ValueError("OAuth state expired (>10 min)")
    return payload["uid"]


def get_oauth_url(redirect_uri: str, state: str) -> str:
    app_id = os.environ.get("META_APP_ID")
    scopes = "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement"
    return (
        f"https://www.facebook.com/v21.0/dialog/oauth"
        f"?client_id={app_id}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&scope={scopes}"
        f"&response_type=code"
        f"&state={quote(state, safe='')}"
    )


def exchange_code_for_token(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for a short-lived token, then for a long-lived one."""
    app_id = os.environ.get("META_APP_ID")
    app_secret = os.environ.get("META_APP_SECRET")

    resp = requests.get(
        f"{GRAPH_API_BASE}/oauth/access_token",
        params={
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
    )
    resp.raise_for_status()
    short_token = resp.json()["access_token"]

    return exchange_for_long_lived_token(short_token)


def exchange_for_long_lived_token(short_token: str) -> dict:
    """Exchange a short-lived token for a 60-day long-lived token."""
    app_id = os.environ.get("META_APP_ID")
    app_secret = os.environ.get("META_APP_SECRET")

    resp = requests.get(
        f"{GRAPH_API_BASE}/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_token,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    expires_in = data.get("expires_in", 5184000)  # default 60 days
    expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    return {
        "access_token": data["access_token"],
        "token_expiry": expiry,
        "expires_in": expires_in,
    }


def fetch_ad_accounts(access_token: str) -> list[dict]:
    """Fetch all ad accounts accessible with the given token."""
    resp = requests.get(
        f"{GRAPH_API_BASE}/me/adaccounts",
        params={
            "access_token": access_token,
            "fields": "id,name,account_id,currency,account_status,business",
            "limit": 100,
        },
    )
    resp.raise_for_status()
    accounts = resp.json().get("data", [])
    return [
        {
            "metaAccountId": acc.get("account_id"),
            "accountName": acc.get("name"),
            "currency": acc.get("currency", "USD"),
            "accountStatus": acc.get("account_status"),
            "businessId": acc.get("business", {}).get("id") if acc.get("business") else None,
            "businessName": acc.get("business", {}).get("name") if acc.get("business") else None,
        }
        for acc in accounts
    ]


def fetch_pages(access_token: str) -> list[dict]:
    """Fetch all Facebook Pages the user manages (needed for ad publishing)."""
    pages, _status = fetch_pages_with_status(access_token)
    return pages


def _is_missing_pages_permissions(error_payload: dict) -> bool:
    code = str(error_payload.get("code") or "").strip()
    subcode = str(error_payload.get("error_subcode") or "").strip()
    message = str(error_payload.get("message") or "").lower()
    permissions_keywords = (
        "pages_show_list",
        "pages_read_engagement",
        "permissions",
        "permission",
        "manage_pages",
        "requires",
    )
    if code in {"10", "200"}:
        return True
    if subcode in {"2108006", "2108008"}:
        return True
    return any(keyword in message for keyword in permissions_keywords)


def fetch_pages_with_status(access_token: str) -> tuple[list[dict], str]:
    """Fetch Facebook Pages with explicit access status."""
    try:
        resp = requests.get(
            f"{GRAPH_API_BASE}/me/accounts",
            params={
                "access_token": access_token,
                "fields": "id,name,access_token",
                "limit": 100,
            },
        )
        payload = resp.json()
        if resp.status_code >= 400:
            error_payload = payload.get("error", {}) if isinstance(payload, dict) else {}
            if isinstance(error_payload, dict) and _is_missing_pages_permissions(error_payload):
                return [], "missing_permissions"
            return [], "token_error"

        pages_raw = payload.get("data", []) if isinstance(payload, dict) else []
        pages = [
            {
                "pageId": page.get("id"),
                "pageName": page.get("name"),
            }
            for page in pages_raw
            if page.get("id")
        ]
        return pages, ("ok" if pages else "no_pages")
    except Exception as e:
        logger.warning("Failed to fetch Facebook Pages: %s", e)
        return [], "token_error"


def store_account_with_token(
    user_id: str,
    account: dict,
    access_token: str,
    token_expiry: datetime,
    *,
    default_page_id: str = "",
    default_page_name: str = "",
    page_access_status: str = "",
):
    """Store a connected Meta account with encrypted token in Firestore."""
    db = get_db()
    encrypted = encrypt_token(access_token)
    account_id = account["metaAccountId"]

    doc_data = {
        "accountName": account.get("accountName"),
        "currency": account.get("currency", "USD"),
        "businessId": account.get("businessId"),
        "businessName": account.get("businessName"),
        "accessToken": encrypted,
        "tokenExpiry": token_expiry,
        "isActive": True,
        "connectedAt": datetime.now(timezone.utc),
    }

    if default_page_id:
        doc_data["defaultPageId"] = default_page_id
        doc_data["defaultPageName"] = default_page_name
    if page_access_status in PAGE_ACCESS_STATUSES:
        doc_data["pageAccessStatus"] = page_access_status

    doc_ref = db.collection("users").document(user_id).collection("metaAccounts").document(account_id)
    doc_ref.set(doc_data, merge=True)
    return account_id


def get_decrypted_token(user_id: str, account_id: str) -> tuple[str, datetime]:
    """Retrieve and decrypt the access token for an account."""
    db = get_db()
    doc_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    doc = doc_ref.get()
    if not doc.exists:
        raise ValueError(f"Account {account_id} not found for user {user_id}")

    data = doc.to_dict()
    access_token_payload = str(data.get("accessToken") or "").strip()
    if not access_token_payload:
        raise ValueError("Meta access token missing. Reconnect this account.")

    try:
        token, source = decrypt_token(access_token_payload, return_source=True)
    except Exception as exc:
        raise ValueError("Meta access token could not be decrypted. Please reconnect this account.") from exc

    if source in {"fallback", "plaintext"}:
        try:
            now = datetime.now(timezone.utc)
            doc_ref.set(
                {
                    "accessToken": encrypt_token(token),
                    "tokenEncryptionMigratedAt": now,
                    "updatedAt": now,
                },
                merge=True,
            )
        except Exception as migrate_exc:
            logger.warning("Failed token re-encryption migration for %s/%s: %s", user_id, account_id, migrate_exc)

    expiry = data.get("tokenExpiry")
    return token, expiry


def check_and_refresh_tokens():
    """Check all accounts for expiring tokens and attempt refresh. Returns list of expiring accounts."""
    db = get_db()
    expiring_accounts = []
    threshold = datetime.now(timezone.utc) + timedelta(days=7)

    users = db.collection("users").stream()
    for user_doc in users:
        accounts_ref = user_doc.reference.collection("metaAccounts")
        for acc_doc in accounts_ref.stream():
            acc_data = acc_doc.to_dict()
            if not acc_data.get("isActive"):
                continue

            expiry = acc_data.get("tokenExpiry")
            if not expiry:
                continue

            if hasattr(expiry, "timestamp"):
                expiry_dt = expiry
            else:
                continue

            if expiry_dt <= threshold:
                expiring_accounts.append({
                    "userId": user_doc.id,
                    "accountId": acc_doc.id,
                    "accountName": acc_data.get("accountName"),
                    "tokenExpiry": expiry_dt,
                    "daysUntilExpiry": (expiry_dt - datetime.now(timezone.utc)).days,
                })

                try:
                    old_token = decrypt_token(acc_data["accessToken"])
                    result = exchange_for_long_lived_token(old_token)
                    new_encrypted = encrypt_token(result["access_token"])
                    acc_doc.reference.update({
                        "accessToken": new_encrypted,
                        "tokenExpiry": result["token_expiry"],
                    })
                    logger.info(f"Refreshed token for account {acc_doc.id}")
                except Exception as e:
                    logger.error(f"Failed to refresh token for {acc_doc.id}: {e}")

    return expiring_accounts
