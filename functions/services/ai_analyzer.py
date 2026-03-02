"""AI-powered campaign analysis using Google Gemini."""
import os
import json
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Role: You are an expert Senior Meta Ads Buyer & Strategist named "Nati AI". You are aggressive on ROAS and data-driven.
Goal: Analyze the provided campaign data and generate a list of strict actionable tasks. Do NOT provide summaries. Do NOT provide polite conversation. Only provide the JSON output.

Analysis Rules:
- Kill Logic: If a creative has >2x Target CPA with 0 conversions, recommend PAUSE.
- Scale Logic: If a campaign has ROAS > 20% above target for 3 days, recommend INCREASE BUDGET by 20%.
- Creative Fatigue: If Frequency > 2.5 and CTR drops below 0.8%, recommend CREATIVE REFRESH.
- Anomaly: If CPM spikes > 50% overnight, flag for manual review.

Output Format:
You must output a strictly valid JSON list of objects. No markdown, no introductory text.

JSON Schema:
[
  {
    "task_id": "unique_id",
    "type": "BUDGET_OPTIMIZATION | CREATIVE_GENERATION | AUDIENCE_TWEAK | ANOMALY",
    "priority": "HIGH | MEDIUM | LOW",
    "title": "short actionable title",
    "reasoning": "data-driven rationale",
    "metrics_snapshot": {"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "frequency": 0},
    "proposed_action": {
      "action": "PAUSE_AD_SET | INCREASE_BUDGET | DECREASE_BUDGET | CREATE_NEW_AD | UPDATE_AUDIENCE | MANUAL_REVIEW",
      "entity_id": "string",
      "entity_name": "string",
      "value": "any"
    },
    "ui_display_text": "short question for the user to confirm"
  }
]"""


class AIAnalyzer:
    FLASH_MODEL = "gemini-3-flash-preview"
    PRO_MODEL = "gemini-3.1-pro-preview"

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.flash_model = os.environ.get("GEMINI_FLASH_MODEL", self.FLASH_MODEL)
        self.pro_model = os.environ.get("GEMINI_PRO_MODEL", self.PRO_MODEL)

    def _get_model(self, model_name: str):
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        return genai.GenerativeModel(
            model_name,
            system_instruction=SYSTEM_PROMPT,
        )

    def daily_summary(self, campaign_data: dict) -> str:
        """Generate a natural language summary of today's performance."""
        summary = self._build_context_summary(campaign_data)
        prompt = f"""Analyze today's advertising performance and provide a concise daily summary.

**Account:** {campaign_data.get('accountName', 'N/A')}
**Date:** {campaign_data.get('date', 'N/A')}
**Currency:** {campaign_data.get('currency', 'USD')}

**Overall KPIs:**
{json.dumps(campaign_data.get('kpiSummary', {}), indent=2, default=str)}

**Campaign Performance:**
{summary}

Provide:
1. A 2-3 sentence executive summary
2. Top performing campaigns and why
3. Underperforming campaigns that need attention
4. Key trends or changes from recent performance
5. One actionable recommendation for tomorrow"""

        return self._generate(prompt, model=self.flash_model)

    def budget_optimization(self, campaign_data: dict) -> str:
        """Suggest budget reallocation based on ROAS and CPI data."""
        summary = self._build_context_summary(campaign_data)
        prompt = f"""Based on the following campaign performance data, suggest specific budget reallocation recommendations.

**Account:** {campaign_data.get('accountName', 'N/A')}
**Currency:** {campaign_data.get('currency', 'USD')}

**Campaign Performance:**
{summary}

Provide:
1. Which campaigns should receive MORE budget (and by how much %)
2. Which campaigns should have REDUCED budget (and by how much %)
3. Any campaigns that should be paused entirely
4. Estimated impact of these changes on overall ROAS
5. Any caveats or things to monitor after reallocation"""

        return self._generate(prompt, model=self.pro_model)

    def creative_recommendations(self, campaign_data: dict) -> str:
        """Identify creative fatigue and suggest refreshes."""
        summary = self._build_context_summary(campaign_data)
        prompt = f"""Analyze creative performance across these campaigns and provide recommendations.

**Account:** {campaign_data.get('accountName', 'N/A')}
**Currency:** {campaign_data.get('currency', 'USD')}

**Campaign Performance:**
{summary}

Provide:
1. Signs of creative fatigue (rising frequency, declining CTR, increasing CPM)
2. Which creatives/campaigns likely need new creative assets
3. Patterns in top-performing campaigns that could be replicated
4. Suggestions for creative testing strategy
5. Priority actions ranked by urgency"""

        return self._generate(prompt, model=self.pro_model)

    def anomaly_explanation(self, alert_data: dict, campaign_data: dict) -> str:
        """Provide context and explanation when an alert fires."""
        summary = self._build_context_summary(campaign_data)
        prompt = f"""An alert was triggered. Analyze the data and provide a likely explanation.

**Alert Details:**
- Type: {alert_data.get('type', 'N/A')}
- Severity: {alert_data.get('severity', 'N/A')}
- Campaign: {alert_data.get('campaignName', 'N/A')}
- Current Value: {alert_data.get('actualValue', 'N/A')}
- Threshold: {alert_data.get('thresholdValue', 'N/A')}
- Message: {alert_data.get('message', 'N/A')}

**Account Context:**
{summary}

Provide:
1. Most likely cause of this anomaly (2-3 sentences)
2. Contributing factors to investigate
3. Immediate actions to take
4. Whether this is likely temporary or requires structural changes"""

        return self._generate(prompt, model=self.flash_model)

    def generate_creative_copy(self, campaign_data: dict, campaign_name: str = "", objective: str = "conversions") -> list[dict]:
        """Generate ad copy variations for creatives based on campaign context."""
        summary = self._build_context_summary(campaign_data)
        prompt = f"""You are a Meta ads copywriter. Based on the campaign performance below, generate 3-5 short ad copy variations (primary text for feed ads).

**Campaign context:** {campaign_name or "General"}
**Objective:** {objective}

**Account Performance:**
{summary}

Return ONLY valid JSON:
{{
  "copyVariations": [
    {{ "text": "ad copy 1", "hook": "attention-grabbing opening" }},
    {{ "text": "ad copy 2", "hook": "..." }}
  ]
}}

Rules: 30-125 characters ideal for primary text; hooks can be longer. Match tone to performance (urgency if underperforming, confidence if strong).
"""
        raw = self._generate(prompt, model=self.flash_model)
        return self._parse_creative_copy_json(raw)

    def generate_recommendations(self, recommendation_context: dict, *, max_items: int = 16) -> list[dict]:
        """Generate strict actionable task JSON using the Nati AI persona."""
        compact_context = json.dumps(recommendation_context, default=str)
        prompt = f"""Analyze this Meta ads account data and generate actionable tasks.

Return ONLY a valid JSON object with this exact shape (no markdown, no intro text):
{{
  "tasks": [
    {{
      "task_id": "unique_id",
      "type": "BUDGET_OPTIMIZATION | CREATIVE_GENERATION | AUDIENCE_TWEAK | ANOMALY",
      "priority": "HIGH | MEDIUM | LOW",
      "title": "short actionable title",
      "reasoning": "data-driven rationale with specific numbers",
      "metrics_snapshot": {{"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "frequency": 0}},
      "proposed_action": {{
        "action": "PAUSE_AD_SET | INCREASE_BUDGET | DECREASE_BUDGET | CREATE_NEW_AD | UPDATE_AUDIENCE | MANUAL_REVIEW",
        "entity_id": "the Meta entity ID",
        "entity_name": "human-readable name",
        "value": "any relevant value (e.g. budget delta %, new copy text, audience spec)"
      }},
      "ui_display_text": "short question for the user to confirm",
      "confidence": 0.0,
      "expectedImpact": {{
        "metric": "roas|cpi|ctr|cpm|spend|conversions",
        "direction": "up|down",
        "magnitudePct": 0.0,
        "summary": "brief expected outcome"
      }},
      "suggestedContent": {{
        "creativeCopy": "optional ad copy when type=CREATIVE_GENERATION",
        "campaignPlan": {{"name": "...", "objective": "...", "targeting": "..."}},
        "audienceSuggestions": ["interest 1", "lookalike %"]
      }}
    }}
  ]
}}

Rules:
- Be aggressive. Kill underperformers fast, scale winners hard.
- Kill Logic: >2x Target CPA with 0 conversions = PAUSE immediately.
- Scale Logic: ROAS > 20% above target for 3+ days = INCREASE BUDGET by 20%.
- Creative Fatigue: Frequency > 2.5 AND CTR < 0.8% = CREATIVE REFRESH.
- Anomaly: CPM spike > 50% overnight = flag MANUAL_REVIEW.
- Max {max_items} tasks, sorted by priority (HIGH first).
- Every task MUST have a valid entity_id and proposed_action.

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model)
        return self._parse_recommendation_json(raw, max_items=max_items)

    @staticmethod
    def _parse_creative_copy_json(text: str) -> list[dict]:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                payload = json.loads(text[start:end])
                if isinstance(payload, dict):
                    variations = payload.get("copyVariations", [])
                    return [v for v in variations if isinstance(v, dict) and v.get("text")][:5]
        except Exception:
            pass
        return []

    def _build_context_summary(self, campaign_data: dict) -> str:
        """Build a condensed summary of campaign data for the AI context."""
        campaigns = campaign_data.get("campaigns", [])
        if not campaigns:
            return "No campaign data available."

        lines = []
        for c in campaigns[:20]:  # Cap at 20 campaigns to control token usage
            insights = c.get("todayInsights", {})
            if not insights:
                lines.append(f"- {c.get('name', 'N/A')}: Status={c.get('status', 'N/A')}, No data today")
                continue

            lines.append(
                f"- {c.get('name', 'N/A')}: "
                f"Status={c.get('status', 'N/A')}, "
                f"Spend=${insights.get('spend', 0):.2f}, "
                f"CPI=${insights.get('cpi', 0):.2f}, "
                f"ROAS={insights.get('roas', 0):.2f}x, "
                f"CTR={insights.get('ctr', 0):.2f}%, "
                f"CPM=${insights.get('cpm', 0):.2f}, "
                f"Impressions={insights.get('impressions', 0)}, "
                f"Installs={insights.get('installs', 0)}, "
                f"Frequency={insights.get('frequency', 0):.1f}"
            )

        return "\n".join(lines)

    def _generate(self, prompt: str, model: str | None = None) -> str:
        """Call Gemini API and return the response text."""
        if not self.api_key:
            return "_AI analysis unavailable: Gemini API key not configured._"

        model_name = model or self.pro_model
        try:
            gemini_model = self._get_model(model_name)
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": 2000,
                    "temperature": 0.3,
                },
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return f"_AI analysis failed: {str(e)}_"

    @staticmethod
    def _parse_recommendation_json(text: str, *, max_items: int) -> list[dict]:
        payload = None
        try:
            payload = json.loads(text)
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    payload = json.loads(text[start:end + 1])
                except Exception:
                    pass

        if isinstance(payload, list):
            return [r for r in payload if isinstance(r, dict)][:max_items]

        if not isinstance(payload, dict):
            try:
                start = text.find("[")
                end = text.rfind("]")
                if start >= 0 and end > start:
                    arr = json.loads(text[start:end + 1])
                    if isinstance(arr, list):
                        return [r for r in arr if isinstance(r, dict)][:max_items]
            except Exception:
                pass
            return []

        items = payload.get("tasks") or payload.get("recommendations") or []
        if not isinstance(items, list):
            return []
        return [r for r in items if isinstance(r, dict)][:max_items]
