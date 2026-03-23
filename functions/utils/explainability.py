"""Explainability trace builder — internal debug metadata for diagnosis runs.

This module produces a structured audit trail of the decisions made during
a diagnosis run.  It is gated behind the ENABLE_EXPLAINABILITY_LOGS feature
flag and is intended for internal debugging, not for end-user display.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ExplainabilityTrace:
    """Accumulates decision metadata during a single diagnosis run."""

    def __init__(self) -> None:
        self._inputs_used: list[str] = []
        self._evaluation_level_reason: str = ""
        self._root_cause_reason: str = ""
        self._confidence_adjustments: list[dict[str, Any]] = []
        self._guardrails_checked: list[str] = []
        self._official_recs_checked: bool = False
        self._fallback_used: bool = False
        self._fallback_reason: str | None = None

    # ------------------------------------------------------------------
    # Recording helpers
    # ------------------------------------------------------------------

    def record_inputs(self, inputs: list[str]) -> None:
        """Record which data inputs were available for this run."""
        self._inputs_used = [str(i) for i in inputs if i]

    def record_evaluation_level(self, level: str, reason: str) -> None:
        """Record why a particular evaluation level was chosen."""
        self._evaluation_level_reason = f"{level}: {reason}"

    def record_root_cause(self, cause: str, reason: str) -> None:
        """Record why a particular root cause was selected."""
        self._root_cause_reason = f"{cause}: {reason}"

    def record_confidence_adjustment(
        self, reason: str, from_value: float, to_value: float
    ) -> None:
        """Record a confidence adjustment step."""
        self._confidence_adjustments.append({
            "reason": reason,
            "from": round(from_value, 4),
            "to": round(to_value, 4),
        })

    def record_guardrail(self, guardrail_name: str) -> None:
        """Record that a guardrail was checked."""
        if guardrail_name and guardrail_name not in self._guardrails_checked:
            self._guardrails_checked.append(guardrail_name)

    def record_official_recs_checked(self, checked: bool) -> None:
        """Record whether official recommendations were checked."""
        self._official_recs_checked = checked

    def record_fallback(self, used: bool, reason: str | None = None) -> None:
        """Record whether a fallback path was taken."""
        self._fallback_used = used
        self._fallback_reason = reason

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialize the trace to a dict suitable for Firestore storage."""
        return {
            "inputsUsed": self._inputs_used,
            "evaluationLevelReason": self._evaluation_level_reason,
            "rootCauseReason": self._root_cause_reason,
            "confidenceAdjustments": self._confidence_adjustments,
            "guardrailsChecked": self._guardrails_checked,
            "officialRecsChecked": self._official_recs_checked,
            "fallbackUsed": self._fallback_used,
            "fallbackReason": self._fallback_reason,
        }


def build_trace() -> ExplainabilityTrace:
    """Factory function for creating a new trace instance."""
    return ExplainabilityTrace()
