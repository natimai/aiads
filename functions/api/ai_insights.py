"""API endpoints for AI-powered campaign analysis."""
from __future__ import annotations

import json
import logging
import os
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from api.accounts import _cors_response, verify_auth
from utils.firestore_helpers import get_db, load_official_recommendations

logger = logging.getLogger(__name__)


def handle_ai_insights(request):
    """Route handler for /api/ai endpoints."""
    try:
        if request.method == "OPTIONS":
            return _cors_response("", 204)

        user_id = verify_auth(request)
        path = request.path.rstrip("/")

        if path.startswith("/api/ai/campaign-builder/"):
            from api.campaign_builder import handle_campaign_builder

            return handle_campaign_builder(request)

        if path.startswith("/api/ai/insights/") and request.method == "GET":
            account_id = path.split("/api/ai/insights/")[1]
            return _get_insights(user_id, account_id)
        if path == "/api/ai/analyze" and request.method == "POST":
            return _trigger_analysis(request, user_id)
        return _cors_response(json.dumps({"error": "Not found"}), 404)

    except PermissionError as exc:
        return _cors_response(json.dumps({"error": str(exc)}), 401)
    except Exception as exc:
        logger.error("AI Insights API error: %s", exc, exc_info=True)
        return _cors_response(json.dumps({"error": "Internal server error"}), 500)


def _get_insights(user_id: str, account_id: str):
    db = get_db()
    from google.cloud.firestore_v1.base_query import FieldFilter

    insights_ref = (
        db.collection("aiInsights")
        .where(filter=FieldFilter("userId", "==", user_id))
        .where(filter=FieldFilter("accountId", "==", account_id))
        .order_by("generatedAt", direction="DESCENDING")
        .limit(10)
    )

    insights = []
    for doc in insights_ref.stream():
        payload = {"id": doc.id, **(doc.to_dict() or {})}
        insights.append(_serialize(payload))

    return _cors_response(json.dumps({"insights": insights}))


def _trigger_analysis(request, user_id: str):
    payload = request.get_json(silent=True) or {}
    account_id = payload.get("accountId")
    analysis_type = str(payload.get("type") or "daily_summary")
    language = str(payload.get("language") or "en")

    if not account_id:
        return _cors_response(json.dumps({"error": "accountId required"}), 400)

    try:
        from services.ai_analyzer import AIAnalyzer
        from services.meta_ads_analyzer_v2 import MetaAdsAnalyzerV2

        db = get_db()
        now = datetime.now(timezone.utc)

        campaign_data = _gather_campaign_data(db, user_id, account_id)
        official_recommendations = campaign_data.get("officialRecommendations", [])

        analyzer = AIAnalyzer()
        analyzer_v2 = MetaAdsAnalyzerV2()

        v2_enabled = _env_bool("META_ANALYZER_V2_ENABLED", default=False)
        shadow_enabled = _env_bool("META_ANALYZER_V2_SHADOW", default=False)
        shadow_sample_rate = _env_float("META_ANALYZER_V2_SHADOW_SAMPLE_RATE", default=0.2)

        response_engine = "legacy"
        legacy_result: str | None = None
        legacy_latency_ms: float | None = None
        v2_structured: dict[str, Any] | None = None
        v2_text: str | None = None
        v2_latency_ms: float | None = None

        if analysis_type == "creative_copy":
            started = time.perf_counter()
            campaign_name = payload.get("campaignName", "")
            objective = payload.get("objective", "conversions")
            variations = analyzer.generate_creative_copy(campaign_data, campaign_name, objective)
            legacy_latency_ms = (time.perf_counter() - started) * 1000.0
            response_payload = {
                "copyVariations": variations,
                "generatedAt": now.isoformat(),
                "engineVersion": "legacy-ai-analyzer",
            }
            insight_doc = {
                "userId": user_id,
                "accountId": account_id,
                "insightType": analysis_type,
                "content": json.dumps({"copyVariations": variations}),
                "generatedAt": now,
                "expiresAt": now + timedelta(hours=1),
                "engineVersion": "legacy-ai-analyzer",
            }
            doc_ref = db.collection("aiInsights").add(insight_doc)
            response_payload["id"] = doc_ref[1].id
            return _cors_response(json.dumps(response_payload))

        if analysis_type == "meta_diagnosis":
            started = time.perf_counter()
            v2_structured = analyzer_v2.analyze(
                campaign_data,
                official_recommendations=official_recommendations,
                language=language,
            )
            v2_text = analyzer_v2.to_text_report(v2_structured)
            v2_latency_ms = (time.perf_counter() - started) * 1000.0
            response_engine = "v2"
        else:
            # Existing analysis types
            started = time.perf_counter()
            if analysis_type == "daily_summary":
                legacy_result = analyzer.daily_summary(campaign_data)
            elif analysis_type == "budget_optimization":
                legacy_result = analyzer.budget_optimization(campaign_data)
            elif analysis_type == "creative_recommendations":
                legacy_result = analyzer.creative_recommendations(campaign_data)
            else:
                return _cors_response(json.dumps({"error": f"Unknown analysis type: {analysis_type}"}), 400)
            legacy_latency_ms = (time.perf_counter() - started) * 1000.0

            if v2_enabled:
                started = time.perf_counter()
                v2_structured = analyzer_v2.analyze(
                    campaign_data,
                    official_recommendations=official_recommendations,
                    language=language,
                )
                v2_text = analyzer_v2.to_text_report(v2_structured)
                v2_latency_ms = (time.perf_counter() - started) * 1000.0
                response_engine = "v2"

        shadow_sampled = False
        if shadow_enabled and random.random() <= shadow_sample_rate:
            shadow_sampled = True
            if v2_structured is None:
                started = time.perf_counter()
                v2_structured = analyzer_v2.analyze(
                    campaign_data,
                    official_recommendations=official_recommendations,
                    language=language,
                )
                v2_text = analyzer_v2.to_text_report(v2_structured)
                v2_latency_ms = (time.perf_counter() - started) * 1000.0
            if legacy_result is None and analysis_type != "meta_diagnosis":
                # Should not happen; left for safety.
                legacy_result = ""

            _write_shadow_log(
                db,
                {
                    "userId": user_id,
                    "accountId": account_id,
                    "analysisType": analysis_type,
                    "sampled": True,
                    "responseEngine": response_engine,
                    "legacyLatencyMs": legacy_latency_ms,
                    "v2LatencyMs": v2_latency_ms,
                    "latencyDeltaMs": _safe_delta(v2_latency_ms, legacy_latency_ms),
                    "policyViolations": _count_blocked_policy_checks(v2_structured),
                    "parsingSuccess": _structured_parse_success(v2_structured),
                    "officialOverlap": _official_overlap_ratio(v2_structured, official_recommendations),
                    "createdAt": now,
                },
            )

        content = legacy_result
        structured = None
        engine_version = "legacy-ai-analyzer"
        policy_checks: list[dict[str, Any]] = []
        alignment: dict[str, Any] = {}

        if response_engine == "v2" and v2_structured is not None:
            content = v2_text or ""
            structured = v2_structured
            engine_version = str(v2_structured.get("engineVersion") or "meta-ads-analyzer-v2")
            if isinstance(v2_structured.get("policyChecks"), list):
                policy_checks = v2_structured.get("policyChecks")
            if isinstance(v2_structured.get("alignment"), dict):
                alignment = v2_structured.get("alignment")

        insight_data = {
            "userId": user_id,
            "accountId": account_id,
            "insightType": analysis_type,
            "content": content if isinstance(content, str) else json.dumps(content),
            "structured": structured,
            "generatedAt": now,
            "expiresAt": now + timedelta(hours=1),
            "engineVersion": engine_version,
            "policyChecks": policy_checks,
            "alignment": alignment,
            "language": language,
            "flags": {
                "v2Enabled": v2_enabled,
                "shadowEnabled": shadow_enabled,
                "shadowSampled": shadow_sampled,
            },
        }
        doc_ref = db.collection("aiInsights").add(insight_data)

        response_payload: dict[str, Any] = {
            "id": doc_ref[1].id,
            "generatedAt": now.isoformat(),
            "content": content,
            "structured": structured,
            "engineVersion": engine_version,
            "policyChecks": policy_checks,
            "alignment": alignment,
        }
        return _cors_response(json.dumps(_serialize(response_payload)))

    except Exception as exc:
        logger.error("AI analysis error: %s", exc, exc_info=True)
        return _cors_response(json.dumps({"error": f"Analysis failed: {str(exc)}"}), 500)


def _gather_campaign_data(db, user_id: str, account_id: str) -> dict[str, Any]:
    """Gather campaign performance data for AI analysis."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_ref = (
        db.collection("users")
        .document(user_id)
        .collection("metaAccounts")
        .document(account_id)
    )

    account_doc = base_ref.get()
    account_data = account_doc.to_dict() if account_doc.exists else {}

    campaigns: list[dict[str, Any]] = []
    for camp_doc in base_ref.collection("campaigns").stream():
        camp_data = {"id": camp_doc.id, **(camp_doc.to_dict() or {})}
        insight_doc = camp_doc.reference.collection("insights").document(today).get()
        if insight_doc.exists:
            camp_data["todayInsights"] = insight_doc.to_dict()
        campaigns.append(camp_data)

    breakdowns: list[dict[str, Any]] = []
    for b_doc in base_ref.collection("breakdowns").stream():
        raw = b_doc.to_dict() or {}
        breakdowns.append(
            {
                "id": b_doc.id,
                "type": raw.get("type"),
                "date": raw.get("date"),
                "data": raw.get("data", [])[:250] if isinstance(raw.get("data"), list) else [],
            }
        )
    breakdowns.sort(key=lambda item: str(item.get("date") or ""), reverse=True)

    official_recommendations = load_official_recommendations(db, user_id, account_id)

    return {
        "accountName": account_data.get("accountName", ""),
        "currency": account_data.get("currency", "USD"),
        "kpiSummary": account_data.get("kpiSummary", {}),
        "campaigns": campaigns,
        "breakdowns": breakdowns[:8],
        "officialRecommendations": official_recommendations,
        "date": today,
    }


def _write_shadow_log(db, payload: dict[str, Any]) -> None:
    collection_name = os.environ.get("META_ANALYZER_V2_LOG_COLLECTION", "aiAnalyzerShadowRuns")
    db.collection(collection_name).add(payload)


def _safe_delta(v2_value: float | None, legacy_value: float | None) -> float | None:
    if v2_value is None or legacy_value is None:
        return None
    return round(v2_value - legacy_value, 4)


def _count_blocked_policy_checks(structured: dict[str, Any] | None) -> int:
    if not isinstance(structured, dict):
        return 0
    checks = structured.get("policyChecks")
    if not isinstance(checks, list):
        return 0
    return sum(1 for item in checks if isinstance(item, dict) and item.get("status") == "blocked")


def _structured_parse_success(structured: dict[str, Any] | None) -> bool:
    if not isinstance(structured, dict):
        return False
    required = {
        "evaluationLevel",
        "aggregateFindings",
        "breakdownHypotheses",
        "recommendationExperiments",
        "alignment",
        "policyChecks",
    }
    return required.issubset(set(structured.keys()))


def _official_overlap_ratio(structured: dict[str, Any] | None, official_recommendations: list[dict[str, Any]]) -> float:
    if not isinstance(structured, dict) or not official_recommendations:
        return 0.0

    experiments = structured.get("recommendationExperiments")
    if not isinstance(experiments, list) or not experiments:
        return 0.0

    official_tokens: set[str] = set()
    for rec in official_recommendations:
        title = str(rec.get("title") or "")
        for token in title.lower().split():
            if len(token) >= 4:
                official_tokens.add(token)

    if not official_tokens:
        return 0.0

    experiment_tokens: set[str] = set()
    for exp in experiments:
        if not isinstance(exp, dict):
            continue
        text = f"{exp.get('hypothesis', '')} {exp.get('action', '')}".lower()
        for token in text.split():
            if len(token) >= 4:
                experiment_tokens.add(token)

    if not experiment_tokens:
        return 0.0

    overlap = official_tokens.intersection(experiment_tokens)
    return round(len(overlap) / len(official_tokens), 4)


def _env_bool(name: str, *, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, *, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return min(max(value, 0.0), 1.0)


def _serialize(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    return value
