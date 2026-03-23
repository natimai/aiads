"""Schema validation for core data contracts."""
from __future__ import annotations

from typing import Any

VALID_ROOT_CAUSES = {
    "learning_instability",
    "auction_cost_pressure",
    "creative_fatigue",
    "audience_saturation",
    "pacing_constraint",
    "restrictive_bidding",
    "post_click_funnel_issue",
    "signal_quality_issue",
    "auction_overlap",
    "breakdown_effect_risk",
    "healthy",
    "unknown",
}

VALID_EVALUATION_LEVELS = {"campaign", "adset"}
VALID_ACTION_FRAMINGS = {"hypothesis", "observation"}
VALID_DIRECTIVE_FRAMINGS = {"directive", "hypothesis", "observation"}
VALID_SOURCES = {"ai", "deterministic", "hybrid"}
VALID_ALIGNMENT_AGREES = {"yes", "partially", "no", "unchecked"}
VALID_BREAKDOWN_DIMENSIONS = {"age", "gender", "placement"}
VALID_RISK_LEVELS = {"high", "medium", "low"}


def validate_diagnosis_report(report: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate a DiagnosisReport dict against the schema contract.

    Returns ``(is_valid, error_messages)``.
    """
    errors: list[str] = []

    # Required top-level fields
    for field in ("id", "accountId", "evaluationLevel", "summary", "rootCause", "confidence", "generatedAt", "source"):
        if field not in report or report[field] is None:
            errors.append(f"Missing required field: {field}")

    # Enum validations
    if report.get("evaluationLevel") and report["evaluationLevel"] not in VALID_EVALUATION_LEVELS:
        errors.append(f"Invalid evaluationLevel: {report['evaluationLevel']}")

    if report.get("rootCause") and report["rootCause"] not in VALID_ROOT_CAUSES:
        errors.append(f"Invalid rootCause: {report['rootCause']}")

    if report.get("source") and report["source"] not in VALID_SOURCES:
        errors.append(f"Invalid source: {report['source']}")

    # Confidence range
    confidence = report.get("confidence")
    if confidence is not None:
        try:
            conf_val = float(confidence)
            if conf_val < 0 or conf_val > 1:
                errors.append(f"Confidence out of range [0, 1]: {conf_val}")
        except (TypeError, ValueError):
            errors.append(f"Confidence is not a number: {confidence}")

    # Findings list
    findings = report.get("findings")
    if findings is None:
        errors.append("Missing required field: findings")
    elif not isinstance(findings, list):
        errors.append("findings must be a list")
    else:
        for i, finding in enumerate(findings):
            finding_errors = _validate_finding(finding, i)
            errors.extend(finding_errors)

    # Breakdown hypotheses (optional but must be valid if present)
    hypotheses = report.get("breakdownHypotheses")
    if hypotheses is not None and isinstance(hypotheses, list):
        for i, hyp in enumerate(hypotheses):
            hyp_errors = _validate_breakdown_hypothesis(hyp, i)
            errors.extend(hyp_errors)

    # Official alignment
    alignment = report.get("officialAlignment")
    if alignment is not None:
        if not isinstance(alignment, dict):
            errors.append("officialAlignment must be a dict")
        else:
            agrees = alignment.get("agrees")
            if agrees and agrees not in VALID_ALIGNMENT_AGREES:
                errors.append(f"Invalid officialAlignment.agrees: {agrees}")

    # Data freshness
    freshness = report.get("dataFreshness")
    if freshness is not None and not isinstance(freshness, dict):
        errors.append("dataFreshness must be a dict")

    # Explainability trace (optional — valid when present)
    trace = report.get("explainabilityTrace")
    if trace is not None:
        if not isinstance(trace, dict):
            errors.append("explainabilityTrace must be a dict")
        else:
            if "inputsUsed" in trace and not isinstance(trace["inputsUsed"], list):
                errors.append("explainabilityTrace.inputsUsed must be a list")
            if "confidenceAdjustments" in trace and not isinstance(trace["confidenceAdjustments"], list):
                errors.append("explainabilityTrace.confidenceAdjustments must be a list")
            if "guardrailsChecked" in trace and not isinstance(trace["guardrailsChecked"], list):
                errors.append("explainabilityTrace.guardrailsChecked must be a list")

    return (len(errors) == 0, errors)


def _validate_finding(finding: Any, index: int) -> list[str]:
    """Validate a single DiagnosisFinding."""
    errors: list[str] = []
    prefix = f"findings[{index}]"

    if not isinstance(finding, dict):
        return [f"{prefix}: must be a dict"]

    for field in ("title", "interpretation", "actionFraming", "confidence"):
        if field not in finding or finding[field] is None:
            errors.append(f"{prefix}: missing required field: {field}")

    # Evidence must be a non-empty dict
    evidence = finding.get("evidence")
    if evidence is None:
        errors.append(f"{prefix}: missing required field: evidence")
    elif not isinstance(evidence, dict):
        errors.append(f"{prefix}: evidence must be a dict")

    # actionFraming enum
    framing = finding.get("actionFraming")
    if framing and framing not in VALID_ACTION_FRAMINGS:
        errors.append(f"{prefix}: invalid actionFraming: {framing} (directive not allowed in findings)")

    # Confidence range
    conf = finding.get("confidence")
    if conf is not None:
        try:
            conf_val = float(conf)
            if conf_val < 0 or conf_val > 1:
                errors.append(f"{prefix}: confidence out of range: {conf_val}")
        except (TypeError, ValueError):
            errors.append(f"{prefix}: confidence is not a number: {conf}")

    # riskLevel (optional)
    risk = finding.get("riskLevel")
    if risk is not None and risk not in VALID_RISK_LEVELS:
        errors.append(f"{prefix}: invalid riskLevel: {risk}")

    return errors


def _validate_breakdown_hypothesis(hyp: Any, index: int) -> list[str]:
    """Validate a single BreakdownHypothesis."""
    errors: list[str] = []
    prefix = f"breakdownHypotheses[{index}]"

    if not isinstance(hyp, dict):
        return [f"{prefix}: must be a dict"]

    for field in ("dimension", "segment", "observation", "hypothesis", "confidence"):
        if field not in hyp or hyp[field] is None:
            errors.append(f"{prefix}: missing required field: {field}")

    dimension = hyp.get("dimension")
    if dimension and dimension not in VALID_BREAKDOWN_DIMENSIONS:
        errors.append(f"{prefix}: invalid dimension: {dimension}")

    conf = hyp.get("confidence")
    if conf is not None:
        try:
            conf_val = float(conf)
            if conf_val < 0 or conf_val > 1:
                errors.append(f"{prefix}: confidence out of range: {conf_val}")
        except (TypeError, ValueError):
            errors.append(f"{prefix}: confidence is not a number: {conf}")

    return errors
