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
        },
    }
