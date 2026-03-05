import os
import json
import logging
import requests
from urllib.parse import quote
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet
from utils.firestore_helpers import get_db

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v22.0"


def get_fernet():
    key = os.environ.get("TOKEN_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(token: str) -> str:
    return get_fernet().encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    return get_fernet().decrypt(encrypted.encode()).decode()


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
    scopes = "ads_management,ads_read,business_management"
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
    try:
        resp = requests.get(
            f"{GRAPH_API_BASE}/me/accounts",
            params={
                "access_token": access_token,
                "fields": "id,name,access_token",
                "limit": 100,
            },
        )
        resp.raise_for_status()
        pages = resp.json().get("data", [])
        return [
            {
                "pageId": page.get("id"),
                "pageName": page.get("name"),
            }
            for page in pages
            if page.get("id")
        ]
    except Exception as e:
        logger.warning("Failed to fetch Facebook Pages: %s", e)
        return []


def store_account_with_token(
    user_id: str,
    account: dict,
    access_token: str,
    token_expiry: datetime,
    *,
    default_page_id: str = "",
    default_page_name: str = "",
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

    doc_ref = db.collection("users").document(user_id).collection("metaAccounts").document(account_id)
    doc_ref.set(doc_data, merge=True)
    return account_id


def get_decrypted_token(user_id: str, account_id: str) -> tuple[str, datetime]:
    """Retrieve and decrypt the access token for an account."""
    db = get_db()
    doc = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .get()
    )
    if not doc.exists:
        raise ValueError(f"Account {account_id} not found for user {user_id}")

    data = doc.to_dict()
    token = decrypt_token(data["accessToken"])
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
