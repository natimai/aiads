"""AI-powered campaign analysis using Google Gemini."""
import os
import json
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior User Acquisition (UA) campaign manager and data analyst specializing in Meta (Facebook/Instagram) advertising. You analyze campaign performance data and provide actionable, data-driven recommendations.

Guidelines:
- Be concise and specific with numbers
- Prioritize recommendations by potential impact
- Use professional UA terminology (ROAS, CPI, CPM, CTR, creative fatigue, etc.)
- Suggest concrete actions (e.g., "increase budget by 20%", "pause this adset")
- Consider seasonal patterns and competitive dynamics
- Flag any data anomalies or concerning trends
- Format your response in clear sections with markdown"""


class AIAnalyzer:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model_name = os.environ.get("GEMINI_MODEL", "gemini-1.5-pro")

    def _get_model(self):
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        return genai.GenerativeModel(
            self.model_name,
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

        return self._generate(prompt)

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

        return self._generate(prompt)

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

        return self._generate(prompt)

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

        return self._generate(prompt)

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
        raw = self._generate(prompt)
        return self._parse_creative_copy_json(raw)

    def generate_recommendations(self, recommendation_context: dict, *, max_items: int = 16) -> list[dict]:
        """Generate normalized recommendation JSON for budget/audience/creative/AB testing/campaign/audience build."""
        compact_context = json.dumps(recommendation_context, default=str)
        prompt = f"""You are an AI Campaign Manager. Generate actionable recommendations for this Meta ads account.
Prioritize high-impact, executable actions. Include diverse types: budget, audience, creative, A/B test, campaign ideas, audience ideas.

Return ONLY valid JSON with this exact shape:
{{
  "recommendations": [
    {{
      "type": "budget_optimization|audience_optimization|creative_optimization|ab_test|campaign_build|audience_build|creative_copy",
      "entityLevel": "account|campaign|adset|ad",
      "entityId": "string",
      "title": "short actionable title",
      "priority": "high|medium|low",
      "confidence": 0.0,
      "expectedImpact": {{
        "metric": "roas|cpi|ctr|cpm|spend|conversions",
        "direction": "up|down",
        "magnitudePct": 0.0,
        "summary": "brief expected outcome"
      }},
      "why": "1-2 sentence explanation",
      "reasoning": "data-driven rationale",
      "actionsDraft": ["step 1", "step 2"],
      "executionPlan": {{
        "action": "adjust_budget|set_status|none",
        "targetLevel": "campaign|adset|ad|account",
        "targetId": "string",
        "deltaPct": 0.0,
        "desiredStatus": "active|paused"
      }},
      "suggestedContent": {{
        "creativeCopy": "optional: ad copy text when type=creative_copy",
        "campaignPlan": {{ "name": "...", "objective": "...", "targeting": "..." }} when type=campaign_build,
        "audienceSuggestions": ["interest 1", "lookalike %"] when type=audience_build
      }}
    }}
  ]
}}

Rules:
- Prioritize by impact. Include budget/creative/ab_test plus at least one campaign_build or audience_build or creative_copy when data supports it.
- Keep to at most {max_items} recommendations.
- For creative_copy: include suggestedContent.creativeCopy with ready-to-use ad text.
- For campaign_build: include suggestedContent.campaignPlan with name, objective, targeting hints.
- For audience_build: include suggestedContent.audienceSuggestions array.

Data:
{compact_context}
"""
        raw = self._generate(prompt)
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

    def _generate(self, prompt: str) -> str:
        """Call Gemini API and return the response text."""
        if not self.api_key:
            return "_AI analysis unavailable: Gemini API key not configured._"

        try:
            model = self._get_model()
            response = model.generate_content(
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
                    payload = None

        if not isinstance(payload, dict):
            return []
        recommendations = payload.get("recommendations", [])
        if not isinstance(recommendations, list):
            return []
        return [r for r in recommendations if isinstance(r, dict)][:max_items]
