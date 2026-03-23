"""Load the deployable Meta Ads analyzer skill pack and references."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

SKILL_NAME = "meta-ads-analyzer"
SKILL_DIR = Path(__file__).resolve().parent.parent / "skills" / SKILL_NAME
SKILL_FILE = SKILL_DIR / "SKILL.md"
REFERENCES_DIR = SKILL_DIR / "references"


@lru_cache(maxsize=1)
def load_skill_markdown() -> str:
    """Return SKILL.md text, or empty string when not bundled."""
    if not SKILL_FILE.exists():
        return ""
    return SKILL_FILE.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def load_skill_references() -> dict[str, str]:
    """Return all bundled reference docs keyed by filename."""
    if not REFERENCES_DIR.exists():
        return {}

    docs: dict[str, str] = {}
    for ref in sorted(REFERENCES_DIR.glob("*.md")):
        docs[ref.name] = ref.read_text(encoding="utf-8")
    return docs


def get_metric_display_name(raw_metric: str) -> str:
    """Normalize metric names using the skill's contract."""
    normalized = {
        "impressions": "Impressions",
        "video_thruplay_watched_actions": "ThruPlays",
        "clicks": "Clicks (all)",
        "purchase_roas": "Purchase ROAS (return on ad spend)",
        "cost_per_lead": "Cost per Lead (CPL)",
        "cost_per_install": "Cost per Install (CPI)",
        "cost_per_action_type": "Cost per Action",
        "leads": "Leads",
        "installs": "Installs",
    }
    return normalized.get(str(raw_metric or "").strip(), str(raw_metric or "").strip())


def get_skill_bundle() -> dict[str, Any]:
    """Expose deployable skill content in one place for analyzer services."""
    return {
        "name": SKILL_NAME,
        "path": str(SKILL_DIR),
        "skill": load_skill_markdown(),
        "references": load_skill_references(),
        "metricDisplayMap": {
            "impressions": "Impressions",
            "video_thruplay_watched_actions": "ThruPlays",
            "clicks": "Clicks (all)",
            "purchase_roas": "Purchase ROAS (return on ad spend)",
            "cost_per_lead": "Cost per Lead (CPL)",
            "cost_per_install": "Cost per Install (CPI)",
            "leads": "Leads",
            "installs": "Installs",
        },
    }


@lru_cache(maxsize=1)
def build_ai_system_knowledge() -> str:
    """Build the full Meta Ads domain knowledge block for Gemini system instructions.

    Condensed from SKILL.md + breakdown_effect.md + core_concepts.md + learning_phase.md.
    Approximately 2500 tokens — use for Pro model calls.
    """
    return """## Meta Ads Domain Knowledge (MANDATORY)

### The Breakdown Effect (CRITICAL)

Breaking down aggregate performance data by segment (placement, age, gender, device) creates misleading conclusions. Meta's delivery system optimizes at the campaign or ad set level using MARGINAL cost, not average cost.

How it works:
1. The system captures the cheapest conversions across all segments first.
2. As cheap opportunities exhaust in one segment, budget moves to the next cheapest opportunity.
3. Early-targeted segments accumulate lower average CPA — but this is an artifact of sequencing, not superiority.
4. Later-targeted segments show higher average CPA, but their marginal CPA was STILL lower than alternatives.

CRITICAL RULE: NEVER recommend pausing or reducing budget for any segment based solely on higher average CPA/CPM in breakdown reports. Removing segments forces the system to find those conversions elsewhere — likely at HIGHER marginal cost. Always frame breakdown-based changes as testable hypotheses, not directives.

### Evaluation Level Rules

| Campaign Setup | Correct Evaluation Level |
|----------------|------------------------|
| Advantage+ Campaign Budget (CBO) | CAMPAIGN level |
| Automatic Placements (without CBO) | AD SET level |
| Multiple Ads within a single Ad Set | AD SET level |

Always determine the correct evaluation level BEFORE producing any analysis.

### Core Principles

- Holistic First: Evaluate at aggregate level before drilling down. The system optimizes for the whole, not the parts.
- Dynamic over Static: Analyze performance over time (trends), not single snapshots.
- Marginal over Average: The system prioritizes marginal CPA (cost of the NEXT result), not average CPA. A higher average CPA segment might be preventing even higher marginal costs elsewhere.

### Learning Phase Constraints

- New or significantly edited ad sets enter learning phase.
- Requires ~50 optimization events within 7 days to exit.
- Significant edits that reset learning: targeting changes, creative changes, optimization event changes, bid strategy changes, budget changes >20%, adding new ads, pausing 7+ days.
- During learning phase: performance is volatile, costs are not representative.
- Do NOT pause ad sets still in learning phase based on short-term performance.
- Do NOT judge performance during learning phase.

### Ad Auction Mechanics

Total Value = Bid × Estimated Action Rate + Ad Quality. The ad with highest total value wins. Lower bids can win with higher estimated action rates and quality.

### Pacing

Even pacing (default) spreads spend throughout the day. The pacing system adjusts bids in real-time based on remaining budget and time.

### Legal & Terminology Requirements

- Audience size: Use "Accounts Center accounts" or report the number without unit — NEVER use "people".
- When a specific number is used with "people" (e.g. "17,000 people"), replace with "person" (e.g. "17,000 person").
- Disambiguate clicks: Use "Clicks (all)" for total interactions OR "Link Clicks" for offsite clicks. NEVER use bare "clicks".

### Metric Naming (MANDATORY)

| Raw Name | Display Name |
|----------|-------------|
| impressions | Impressions |
| video_thruplay_watched_actions | ThruPlays |
| clicks | Clicks (all) |
| purchase_roas | Purchase ROAS (return on ad spend) |

### Analysis Guardrails

- EVERY insight must include data evidence and explanation.
- EVERY recommendation must be actionable and verifiable.
- ALWAYS justify recommendations with data evidence, Meta's system mechanics, and expected impact on OVERALL campaign performance.
- ALIGN with official Meta recommendations. If diverging, explicitly acknowledge and explain why.
- Frame changes as testable hypotheses when confidence is not high, not as directives."""


@lru_cache(maxsize=1)
def build_ai_system_knowledge_lite() -> str:
    """Build a condensed Meta Ads knowledge block for Flash model calls.

    Core principles + guardrails only. Approximately 400 tokens.
    """
    return """## Meta Ads Analysis Rules (MANDATORY)

Core Principles:
- Holistic First: Evaluate at aggregate level before drilling into segments.
- Marginal over Average: The system prioritizes marginal CPA, not average CPA. Higher average CPA in a segment does NOT mean poor performance.
- Dynamic over Static: Analyze trends over time, not snapshots.

Critical Guardrail — Breakdown Effect:
NEVER recommend pausing or reducing budget for any segment based solely on higher average CPA/CPM in breakdown reports. This violates how Meta's delivery system allocates budget. Always frame changes as testable hypotheses.

Terminology:
- Use "Accounts Center accounts" instead of "people" for audience metrics.
- Use "Clicks (all)" or "Link Clicks" — never bare "clicks".
- Use standardized metric names: Impressions, ThruPlays, Clicks (all), Purchase ROAS (return on ad spend).

Every recommendation must include data evidence, expected impact on overall performance, and a validation metric."""
