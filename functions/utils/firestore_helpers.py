from datetime import datetime, timezone


def get_db():
    import firebase_admin
    from firebase_admin import firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    return firestore.client()


def get_user_accounts(db, user_id: str, *, managed_only: bool = False) -> list[dict]:
    """Fetch active Meta accounts for a user. If managed_only, restrict to platform-managed."""
    from google.cloud.firestore_v1.base_query import FieldFilter

    accounts_ref = db.collection("users").document(user_id).collection("metaAccounts")
    query = accounts_ref.where(filter=FieldFilter("isActive", "==", True))
    if managed_only:
        query = query.where(filter=FieldFilter("isManagedByPlatform", "==", True))
    docs = query.stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


def get_all_active_users(db, *, managed_only: bool = False) -> list[dict]:
    """Fetch all users who have at least one active account."""
    users_ref = db.collection("users").stream()
    results = []
    for user_doc in users_ref:
        user_data = {"id": user_doc.id, **user_doc.to_dict()}
        accounts = get_user_accounts(db, user_doc.id, managed_only=managed_only)
        if accounts:
            user_data["accounts"] = accounts
            results.append(user_data)
    return results


def batch_write_documents(db, collection_path: str, documents: list[dict], id_field: str = "id"):
    """Write multiple documents in batches of 500 (Firestore limit)."""
    batch_size = 500
    for i in range(0, len(documents), batch_size):
        batch = db.batch()
        chunk = documents[i:i + batch_size]
        for doc in chunk:
            doc_id = str(doc.get(id_field, ""))
            if not doc_id:
                continue
            doc_ref = db.document(f"{collection_path}/{doc_id}")
            doc_data = {k: v for k, v in doc.items() if k != id_field}
            doc_data["lastSynced"] = datetime.now(timezone.utc)
            batch.set(doc_ref, doc_data, merge=True)
        batch.commit()


def get_insights_for_date_range(
    db, user_id: str, account_id: str, campaign_id: str, date_from: str, date_to: str
) -> list[dict]:
    """Fetch insights documents for a campaign within a date range."""
    from google.cloud.firestore_v1.base_query import FieldFilter

    insights_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("campaigns")
        .document(campaign_id)
        .collection("insights")
    )
    docs = (
        insights_ref
        .where(filter=FieldFilter("date", ">=", date_from))
        .where(filter=FieldFilter("date", "<=", date_to))
        .order_by("date")
        .stream()
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


def load_official_recommendations(db, user_id: str, account_id: str) -> list[dict]:
    """Load pending/approved recommendations as official baseline for alignment."""
    rec_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
        .collection("recommendations")
    )
    docs = rec_ref.stream()

    results: list[dict] = []
    for doc in docs:
        payload = doc.to_dict() or {}
        status = str(payload.get("status") or "").lower()
        if status not in {"pending", "approved"}:
            continue
        results.append(
            {
                "id": doc.id,
                "type": payload.get("type"),
                "title": payload.get("title"),
                "reasoning": payload.get("reasoning"),
                "entityId": payload.get("entityId"),
                "status": status,
                "createdAt": payload.get("createdAt"),
                "executionPlan": payload.get("executionPlan")
                if isinstance(payload.get("executionPlan"), dict)
                else {},
            }
        )
    results.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    return results[:60]


def update_account_kpi_summary(db, user_id: str, account_id: str, summary: dict):
    """Update denormalized KPI summary on the account document."""
    account_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )
    account_ref.update({"kpiSummary": summary, "kpiUpdatedAt": datetime.now(timezone.utc)})
