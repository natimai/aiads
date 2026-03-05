"""AI-powered campaign analysis using Google Gemini."""
from __future__ import annotations

import os
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Role: You are an expert Senior Meta Ads Buyer & Strategist named "Nati AI". You are aggressive on ROAS and data-driven.
Goal: Analyze the provided campaign data and generate a list of strict actionable tasks. Do NOT provide summaries. Do NOT provide polite conversation. Only provide the JSON output.

Analysis Rules:
- Never stay idle. If an ad set has been stable and at/under target CPA for 7 days, you MUST produce at least one SCALE_EXPERIMENT or AUDIENCE_EXPANSION style task.
- Kill Logic: If CPA is >1.6x target and conversions are 0-1, recommend PAUSE.
- Scale Logic: If ROAS is >10% above target for 2+ days, recommend INCREASE BUDGET by 15-20%.
- Creative Fatigue: If Frequency > 2.2 and CTR drops below 1.0%, recommend CREATIVE REFRESH.
- A/B Test Builder: If a winning creative exists but audience is fatiguing (Frequency > 2.5), output an AB_TEST_AUDIENCE task with a concrete test_setup block.
- Audience Discovery: Extract currently winning interests and propose lateral adjacent interests to discover cheaper CPMs.
- Breakdown Optimization: Analyze age, gender, and placement breakdowns. If one segment contributes >60% of results at lower CPA, create TARGETING_OPTIMIZATION to isolate that segment.
- Anomaly: If CPM spikes > 50% overnight, flag for manual review.

Output Format:
You must output a strictly valid JSON list of objects. No markdown, no introductory text.

JSON Schema:
[
  {
    "task_id": "unique_id",
    "type": "BUDGET_OPTIMIZATION | CREATIVE_GENERATION | AUDIENCE_TWEAK | ANOMALY | AUDIENCE_DISCOVERY | TARGETING_OPTIMIZATION | AB_TEST_AUDIENCE | SCALE_EXPERIMENT | AUDIENCE_EXPANSION",
    "priority": "HIGH | MEDIUM | LOW",
    "title": "short actionable title",
    "reasoning": "data-driven rationale",
    "metrics_snapshot": {"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "frequency": 0},
    "proposed_action": {
      "action": "PAUSE_AD_SET | INCREASE_BUDGET | DECREASE_BUDGET | CREATE_NEW_AD | UPDATE_AUDIENCE | MANUAL_REVIEW | BUILD_AB_TEST_AUDIENCE",
      "entity_id": "string",
      "entity_name": "string",
      "value": "any"
    },
    "test_setup": {
      "control_adset_id": "string",
      "variable_to_change": "targeting",
      "variant_settings": {
        "custom_audiences": ["lookalike_purchase_3pct"],
        "interests": []
      },
      "recommended_test_budget": 50
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

    def _get_model(self, model_name: str, *, system_instruction: str | None = None):
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        return genai.GenerativeModel(
            model_name,
            system_instruction=system_instruction if system_instruction is not None else SYSTEM_PROMPT,
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

    def generate_morning_tasks(self, recommendation_context: dict, *, max_items: int = 8) -> list[dict]:
        """Morning Strategist: growth, scale, creative refresh, A/B testing. Uses 7-day data."""
        compact_context = json.dumps(recommendation_context, default=str)
        prompt = f"""You are Nati AI — Morning Strategist mode. Analyze this account's 7-day performance.
FOCUS ONLY ON:
1. SCALE winners: campaigns with ROAS > 20% above target for 3+ days → INCREASE_BUDGET +20%
2. CREATIVE_REFRESH: Frequency > 2.5 AND CTR < 0.8% → recommend new creative
3. A/B_TEST: audiences showing saturation → draft AB_TEST_AUDIENCE with strict control vs variant settings
4. If an ad set is stable at target CPA for 7 days, you MUST output SCALE_EXPERIMENT or AUDIENCE_DISCOVERY
5. Growth opportunities missed yesterday

DO NOT generate budget-cut or kill recommendations (that's the Evening Guard's job).

Return ONLY a valid JSON object:
{{
  "tasks": [
    {{
      "task_id": "unique_id",
      "type": "BUDGET_OPTIMIZATION | CREATIVE_GENERATION | AUDIENCE_TWEAK | AB_TEST_AUDIENCE | AUDIENCE_DISCOVERY | SCALE_EXPERIMENT",
      "priority": "HIGH | MEDIUM",
      "title": "short actionable title",
      "reasoning": "data-driven rationale with specific numbers",
      "metrics_snapshot": {{"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "frequency": 0}},
      "proposed_action": {{
        "action": "INCREASE_BUDGET | CREATE_NEW_AD | UPDATE_AUDIENCE | BUILD_AB_TEST_AUDIENCE",
        "entity_id": "the Meta entity ID",
        "entity_name": "human-readable name",
        "value": "budget delta % or audience spec"
      }},
      "test_setup": {{
        "control_adset_id": "required when type=AB_TEST_AUDIENCE",
        "variable_to_change": "targeting",
        "variant_settings": {{"custom_audiences": ["lookalike_purchase_3pct"], "interests": []}},
        "recommended_test_budget": 50
      }},
      "ui_display_text": "short question for the user to confirm",
      "confidence": 0.0,
      "expectedImpact": {{
        "metric": "roas|ctr|reach",
        "direction": "up",
        "magnitudePct": 0.0,
        "summary": "brief expected growth outcome"
      }}
    }}
  ]
}}

Max {max_items} tasks, sorted HIGH priority first. Every task MUST have entity_id.

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model)
        return self._parse_recommendation_json(raw, max_items=max_items)

    def generate_evening_tasks(self, recommendation_context: dict, *, max_items: int = 6) -> list[dict]:
        """Evening Guard: budget pacing, bleeding ads, day-end safety. Uses today-so-far data."""
        compact_context = json.dumps(recommendation_context, default=str)
        prompt = f"""You are Nati AI — Evening Guard mode. Analyze TODAY's performance so far.
FOCUS ONLY ON:
1. BLEEDING ADS: today's CPA > 2x target with spend > $50 → PAUSE immediately (HIGH priority)
2. BUDGET UNDER-PACE: if spend < 50% of daily budget by end of day → INCREASE_BUDGET or raise bid
3. BUDGET OVER-SPEND: if projected to exceed daily budget → DECREASE_BUDGET
4. ANOMALIES: CPM spike > 50% vs yesterday, or sudden CTR drop > 40%

DO NOT generate long-term growth or creative recommendations (that's the Morning Strategist's job).

Return ONLY a valid JSON object:
{{
  "tasks": [
    {{
      "task_id": "unique_id",
      "type": "BUDGET_OPTIMIZATION | ANOMALY",
      "priority": "HIGH | MEDIUM",
      "title": "short actionable title",
      "reasoning": "specific today's numbers vs thresholds",
      "metrics_snapshot": {{"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "daily_budget": 0}},
      "proposed_action": {{
        "action": "PAUSE_AD_SET | INCREASE_BUDGET | DECREASE_BUDGET | MANUAL_REVIEW",
        "entity_id": "the Meta entity ID",
        "entity_name": "human-readable name",
        "value": "budget delta % or reason"
      }},
      "ui_display_text": "short question for the user to confirm",
      "confidence": 0.0,
      "expectedImpact": {{
        "metric": "cpa|spend|roas",
        "direction": "down",
        "magnitudePct": 0.0,
        "summary": "brief safety outcome"
      }}
    }}
  ]
}}

Max {max_items} tasks. HIGH priority items first. Every task MUST have entity_id.

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.flash_model)
        return self._parse_recommendation_json(raw, max_items=max_items)

    def generate_recommendations(self, recommendation_context: dict, *, max_items: int = 16) -> list[dict]:
        """Generate strict actionable task JSON using the Nati AI persona."""
        compact_context = json.dumps(recommendation_context, default=str)
        prompt = f"""Analyze this Meta ads account data and generate actionable tasks.

Return ONLY a valid JSON object with this exact shape (no markdown, no intro text):
{{
  "tasks": [
    {{
      "task_id": "unique_id",
      "type": "BUDGET_OPTIMIZATION | CREATIVE_GENERATION | AUDIENCE_TWEAK | ANOMALY | AUDIENCE_DISCOVERY | TARGETING_OPTIMIZATION | AB_TEST_AUDIENCE | SCALE_EXPERIMENT | AUDIENCE_EXPANSION",
      "priority": "HIGH | MEDIUM | LOW",
      "title": "short actionable title",
      "reasoning": "data-driven rationale with specific numbers",
      "metrics_snapshot": {{"spend": 0, "roas": 0, "cpa": 0, "ctr": 0, "cpm": 0, "frequency": 0}},
      "proposed_action": {{
        "action": "PAUSE_AD_SET | INCREASE_BUDGET | DECREASE_BUDGET | CREATE_NEW_AD | UPDATE_AUDIENCE | MANUAL_REVIEW | BUILD_AB_TEST_AUDIENCE",
        "entity_id": "the Meta entity ID",
        "entity_name": "human-readable name",
        "value": "any relevant value (e.g. budget delta %, new copy text, audience spec)"
      }},
      "test_setup": {{
        "control_adset_id": "required when type=AB_TEST_AUDIENCE",
        "variable_to_change": "targeting",
        "variant_settings": {{
          "custom_audiences": ["lookalike_purchase_3pct"],
          "interests": []
        }},
        "recommended_test_budget": 50
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
- Never stay idle. If any ad set is stable and meeting target CPA for 7 days, MUST emit SCALE_EXPERIMENT or AUDIENCE_DISCOVERY.
- Kill Logic: >1.6x Target CPA with 0-1 conversions = PAUSE immediately.
- Scale Logic: ROAS > 10% above target for 2+ days = INCREASE BUDGET by 15-20%.
- Creative Fatigue: Frequency > 2.2 AND CTR < 1.0% = CREATIVE REFRESH.
- A/B Test Builder: Winning creative + audience fatigue (Frequency > 2.5) => emit AB_TEST_AUDIENCE with a complete test_setup block.
- Audience Discovery: Use winning interests and suggest lateral interests.
- Breakdowns: If age/gender/placement segment contributes >60% of results with lower CPA, emit TARGETING_OPTIMIZATION.
- Anomaly: CPM spike > 50% overnight = flag MANUAL_REVIEW.
- Max {max_items} tasks, sorted by priority (HIGH first).
- Every task MUST have a valid entity_id and proposed_action.

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model)
        return self._parse_recommendation_json(raw, max_items=max_items)

    def generate_strategy_plan(
        self,
        context: dict,
        *,
        current_blocks: dict | None = None,
        instruction: str = "",
    ) -> dict:
        """Agent 1: Media Strategist - campaign plan and strategy reasoning only."""
        compact_context = json.dumps(context, default=str)
        compact_blocks = json.dumps(current_blocks or {}, default=str)
        strict_rules, user_request_text, account_context_text = self._campaign_builder_prompt_sections(context)
        system = (
            "You are a Senior Meta Ads Strategist. "
            "You analyze campaign briefs and output structured campaign planning JSON. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )
        prompt = f"""Analyze the user's brief and output ONLY campaign planning JSON.

{user_request_text}

{account_context_text}

Rules:
- Output ONLY valid JSON with top-level keys: "campaignPlan" and "reasoning".
- Do NOT output audiencePlan or creativePlan.
- Focus on objective selection, campaign naming convention, and budget structure.
- USER REQUEST is higher priority than benchmark context.
- Follow these strict rules:
{strict_rules}

Current blocks (for continuity, if provided):
{compact_blocks}

Extra instruction:
{instruction or "N/A"}

Expected JSON shape:
{{
  "campaignPlan": {{
    "name": "string",
    "objective": "OUTCOME_LEADS | OUTCOME_SALES | ...",
    "buyingType": "AUCTION",
    "budgetType": "daily",
    "dailyBudget": 0
  }},
  "reasoning": "short strategy reasoning"
}}

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)
        result: dict[str, Any] = {}
        campaign_plan = parsed.get("campaignPlan") or parsed.get("campaign_plan")
        if isinstance(campaign_plan, dict):
            result["campaignPlan"] = {
                "name": campaign_plan.get("name"),
                "objective": campaign_plan.get("objective"),
                "buyingType": campaign_plan.get("buyingType") or campaign_plan.get("buying_type"),
                "budgetType": campaign_plan.get("budgetType") or campaign_plan.get("budget_type"),
                "dailyBudget": campaign_plan.get("dailyBudget") or campaign_plan.get("daily_budget"),
            }
        reasoning = (
            parsed.get("reasoning")
            or parsed.get("strategyReasoning")
            or parsed.get("strategy_reasoning")
        )
        if isinstance(reasoning, str) and reasoning.strip():
            result["reasoning"] = reasoning.strip()
        return result

    def generate_audience_plan(
        self,
        context: dict,
        *,
        current_blocks: dict | None = None,
        instruction: str = "",
    ) -> dict:
        """Agent 2: Audience Expert - audience plan only."""
        compact_context = json.dumps(context, default=str)
        compact_blocks = json.dumps(current_blocks or {}, default=str)
        strict_rules, user_request_text, account_context_text = self._campaign_builder_prompt_sections(context)
        system = (
            "You are an elite Meta Ads Audience Specialist. "
            "You build precise audience targeting plans based on the product/offer brief. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )
        prompt = f"""Output ONLY the audiencePlan JSON block.

{user_request_text}

{account_context_text}

Rules:
- Output ONLY valid JSON with one top-level key: "audiencePlan".
- Rule 1: Extract 3-5 hyper-specific Meta Interests relevant to the product/offer.
- Rule 2: Interests must be short categories (1-4 words). NO full sentences. NO pasted user brief text.
- Rule 3: Suggest realistic Custom Audience hints (for example: "Website Visitors 30D", "Engaged Leads 90D").
- USER REQUEST is higher priority than benchmark context.
- Follow these strict rules:
{strict_rules}

Current blocks (for continuity, if provided):
{compact_blocks}

Extra instruction:
{instruction or "N/A"}

Expected JSON shape:
{{
  "audiencePlan": {{
    "name": "string",
    "geo": {{"countries": ["US"]}},
    "ageRange": {{"min": 21, "max": 55}},
    "genders": ["all"],
    "interests": ["Vehicle insurance", "Automobile", "Family"],
    "lookalikeHints": ["Website Visitors 30D", "Leads 90D"]
  }}
}}

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)
        audience_plan = parsed.get("audiencePlan") or parsed.get("audience_plan")
        if isinstance(audience_plan, dict):
            geo = audience_plan.get("geo") if isinstance(audience_plan.get("geo"), dict) else {}
            countries = (
                geo.get("countries")
                if isinstance(geo.get("countries"), list)
                else audience_plan.get("countries")
            )
            age_range = audience_plan.get("ageRange") or audience_plan.get("age_range") or {}
            lookalikes = (
                audience_plan.get("lookalikeHints")
                or audience_plan.get("lookalike_hints")
                or audience_plan.get("customAudiences")
                or audience_plan.get("custom_audiences")
            )
            return {
                "audiencePlan": {
                    "name": audience_plan.get("name"),
                    "geo": {"countries": countries if isinstance(countries, list) else ["US"]},
                    "ageRange": {
                        "min": age_range.get("min", 21) if isinstance(age_range, dict) else 21,
                        "max": age_range.get("max", 55) if isinstance(age_range, dict) else 55,
                    },
                    "genders": audience_plan.get("genders") if isinstance(audience_plan.get("genders"), list) else ["all"],
                    "interests": audience_plan.get("interests") if isinstance(audience_plan.get("interests"), list) else [],
                    "lookalikeHints": lookalikes if isinstance(lookalikes, list) else [],
                }
            }
        return {}

    def generate_creative_plan(
        self,
        context: dict,
        *,
        current_blocks: dict | None = None,
        instruction: str = "",
    ) -> dict:
        """Agent 3: Direct Response Copywriter - creative plan only."""
        compact_context = json.dumps(context, default=str)
        compact_blocks = json.dumps(current_blocks or {}, default=str)
        strict_rules, user_request_text, account_context_text = self._campaign_builder_prompt_sections(context)

        # Extract the offer for explicit injection into the prompt.
        inputs = context.get("inputs", {}) if isinstance(context.get("inputs"), dict) else {}
        offer = str(inputs.get("offer") or "").strip()
        language = str(inputs.get("language") or "en").strip()

        system = (
            "You are a ruthless Direct Response Copywriter for Meta Ads. "
            "You write highly specific, product-led ad copy that converts. "
            "You NEVER use generic filler like 'solution', 'service', 'tailored option', or 'check eligibility'. "
            "Every word must sell the SPECIFIC product the user gave you. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )

        prompt = f"""Write ad copy for this SPECIFIC product/offer:

PRODUCT/OFFER: "{offer}"
LANGUAGE: {language}

{user_request_text}

{account_context_text}

CRITICAL RULES:
- RULE 1 (PRODUCT NAME IN COPY): You MUST mention the specific product/brand name "{offer}" (or a clear reference to it) in EVERY primary text and headline. DO NOT use generic words like "solution", "service", "option", or "product".
- RULE 2 (STRICT LANGUAGE): Write 100% in {language}. No mixed languages.
- RULE 3 (NO GENERIC COPY): If your output could apply to ANY product, it is WRONG. The copy must ONLY make sense for "{offer}".
- RULE 4 (COPY STRUCTURE): Provide exactly 3 primary texts:
  1) Pain-point focused — what problem does "{offer}" solve?
  2) Benefit-driven — specific benefit of "{offer}" (price, speed, coverage, etc.)
  3) Short & punchy — urgency or social proof specific to "{offer}"
- RULE 5 (HEADLINES): Each headline must reference "{offer}" or its core benefit directly.
- USER REQUEST is higher priority than benchmark context.

Additional strict rules:
{strict_rules}

Current blocks (for continuity, if provided):
{compact_blocks}

Extra instruction:
{instruction or "N/A"}

Output ONLY valid JSON with this exact shape:
{{
  "creativePlan": {{
    "angles": ["angle 1", "angle 2", "angle 3"],
    "primaryTexts": ["text 1", "text 2", "text 3"],
    "headlines": ["headline 1", "headline 2", "headline 3"],
    "cta": "LEARN_MORE"
  }}
}}

Data:
{compact_context}
"""
        raw = self._generate(prompt, model=self.pro_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)
        creative_plan = parsed.get("creativePlan") or parsed.get("creative_plan")
        if isinstance(creative_plan, dict):
            primary_texts = creative_plan.get("primaryTexts") or creative_plan.get("primary_texts")
            headlines = creative_plan.get("headlines")
            angles = creative_plan.get("angles") or creative_plan.get("hooks")
            result = {
                "creativePlan": {
                    "angles": angles if isinstance(angles, list) else [],
                    "primaryTexts": primary_texts if isinstance(primary_texts, list) else [],
                    "headlines": headlines if isinstance(headlines, list) else [],
                    "cta": creative_plan.get("cta") or creative_plan.get("call_to_action") or "LEARN_MORE",
                }
            }
            # Validate the creative plan has actual content
            if result["creativePlan"]["primaryTexts"] and result["creativePlan"]["headlines"]:
                return result
            logger.warning("Creative agent returned empty primaryTexts or headlines")
        else:
            logger.warning("Creative agent failed to return a valid creativePlan. Raw: %s", raw[:500])
        return {}

    def generate_image_concepts(
        self,
        offer: str,
        language: str,
        creative_plan: dict,
    ) -> dict:
        """Agent 4: Conceptual Art Director — generates dramatic image prompts with text overlays."""
        primary_texts = creative_plan.get("primaryTexts") or creative_plan.get("primary_texts") or []
        headlines = creative_plan.get("headlines") or []
        angles = creative_plan.get("angles") or creative_plan.get("hooks") or []

        copy_block = (
            f"PRIMARY TEXTS:\n" + "\n".join(f"- {t}" for t in primary_texts) + "\n"
            f"HEADLINES:\n" + "\n".join(f"- {h}" for h in headlines) + "\n"
            f"ANGLES:\n" + "\n".join(f"- {a}" for a in angles)
        )

        system = (
            "You are an elite Conceptual Art Director for Direct Response Meta Ads. "
            "You do NOT generate generic, happy stock photos. You think in dramatic, "
            "realistic 'moment of need' scenes that make the viewer stop scrolling. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )

        prompt = f"""Analyze the product/offer and the ad copy below, then generate 3 cinematic image prompts.

PRODUCT/OFFER: "{offer}"
LANGUAGE: {language}

AD COPY:
{copy_block}

=== RULE 1 (DRAMATIC SITUATIONS & PAIN POINTS) ===
Do NOT generate generic, happy stock photos. Analyze the user's product and identify the exact "moment of need" or pain point.
Example: If the product is "24/7 Car Insurance", do NOT show a shiny car.
Show a stressed driver at night in the rain next to a fender bender, looking lost while holding a phone.
The image must evoke the EMOTION that makes someone click the ad.

=== RULE 2 (TYPOGRAPHY / TEXT OVERLAY) ===
You MUST extract a short, punchy 1-2 sentence hook from the generated ad copy to be explicitly written on the image.
If the requested language is Hebrew ({language}), the text MUST be in Hebrew.
Instruct the image model to render this text natively as a bold typography overlay on the image.
The text overlay should be large, legible, and positioned so it does not obstruct the main subject.

=== RULE 3 (VARIETY) ===
Each of the 3 prompts must use a DIFFERENT visual concept:
- Prompt 1: Close-up emotional moment (face/hands/detail that tells a story)
- Prompt 2: Wide establishing shot (environment, context, atmosphere)
- Prompt 3: Split-screen or before/after concept (contrast between pain and solution)

=== OUTPUT ===
Return ONLY valid JSON with this exact structure:
{{
  "creative_concept_reasoning": "Explanation of the pain point and why this visual scene works for the product.",
  "image_generation_prompts": [
    "Prompt 1: A cinematic shot of... typography overlay reads EXACTLY: '...'",
    "Prompt 2: Close up POV of... typography overlay reads EXACTLY: '...'",
    "Prompt 3: Split screen showing... typography overlay reads EXACTLY: '...'"
  ]
}}
"""
        raw = self._generate(prompt, model=self.pro_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)

        reasoning = (
            parsed.get("creative_concept_reasoning")
            or parsed.get("creativeConceptReasoning")
            or ""
        )
        prompts = (
            parsed.get("image_generation_prompts")
            or parsed.get("imageGenerationPrompts")
            or []
        )
        if not isinstance(prompts, list):
            prompts = []

        return {
            "creative_concept_reasoning": str(reasoning),
            "image_generation_prompts": [str(p) for p in prompts[:3]],
        }

    def generate_campaign_builder_draft(self, context: dict) -> dict:
        """Generate campaign builder blocks for a new draft."""
        compact_context = json.dumps(context, default=str)
        prompt_sections = context.get("promptSections", {}) if isinstance(context.get("promptSections"), dict) else {}
        user_request_text = str(prompt_sections.get("userRequestText") or "").strip()
        account_context_text = str(prompt_sections.get("accountContextText") or "").strip()
        strict_rules = self._campaign_builder_strict_rules(context)
        if not user_request_text:
            user_request_text = self._fallback_campaign_builder_user_request(context)
        if not account_context_text:
            account_context_text = self._fallback_campaign_builder_account_context(context)
        prompt = f"""You are an expert Meta ads strategist. Build a launch-ready campaign draft.

STRICT PRIORITY HIERARCHY:
- USER REQUEST is the highest priority and must override benchmark context.
- ACCOUNT CONTEXT is secondary and should only influence tone and numeric calibration.

STRICT RULES:
{strict_rules}

FULL_DRAFT HARD RULES:
- RULE 4 (NO PARROTING): DO NOT copy and paste the raw Product/Offer text into output fields. Write original copy.
- RULE 5 (STRICT LANGUAGE ENFORCEMENT): The ENTIRE creative_plan output must be written natively in the requested language.
- INTERESTS FORMAT: audiencePlan.interests must contain short Meta targeting categories (1-4 words each), not sentences.

{user_request_text}

{account_context_text}

Return ONLY valid JSON with this exact shape:
{{
  "campaignPlan": {{
    "name": "string",
    "objective": "string",
    "buyingType": "AUCTION",
    "budgetType": "daily",
    "dailyBudget": 0
  }},
  "audiencePlan": {{
    "name": "string",
    "geo": {{"countries": ["US"]}},
    "ageRange": {{"min": 21, "max": 55}},
    "genders": ["all"],
    "interests": ["interest 1", "interest 2"],
    "lookalikeHints": ["1% purchasers"]
  }},
  "creativePlan": {{
    "angles": ["angle 1", "angle 2", "angle 3"],
    "primaryTexts": ["text 1", "text 2", "text 3"],
    "headlines": ["headline 1", "headline 2", "headline 3"],
    "cta": "LEARN_MORE"
  }},
  "reasoning": "short reasoning with benchmark references"
}}

Rules:
- Follow the strict hierarchy and strict rules above.
- Prioritize clear direct-response messaging.
- Use language from input (if provided).
- Never return markdown.

Data:
{compact_context}
"""
        system = (
            "You are an expert Meta ads strategist. You build launch-ready campaign drafts. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )
        raw = self._generate(prompt, model=self.pro_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)
        return parsed if isinstance(parsed, dict) else {}

    def regenerate_campaign_builder_block(
        self,
        context: dict,
        *,
        current_blocks: dict,
        block_type: str,
        instruction: str = "",
    ) -> dict:
        """Regenerate a single campaign builder block while preserving others."""
        compact_context = json.dumps(context, default=str)
        compact_blocks = json.dumps(current_blocks, default=str)
        prompt_sections = context.get("promptSections", {}) if isinstance(context.get("promptSections"), dict) else {}
        user_request_text = str(prompt_sections.get("userRequestText") or "").strip()
        account_context_text = str(prompt_sections.get("accountContextText") or "").strip()
        strict_rules = self._campaign_builder_strict_rules(context)
        if not user_request_text:
            user_request_text = self._fallback_campaign_builder_user_request(context)
        if not account_context_text:
            account_context_text = self._fallback_campaign_builder_account_context(context)
        prompt = f"""You are an expert Meta ads strategist.
Regenerate only this block: {block_type}

STRICT PRIORITY HIERARCHY:
- USER REQUEST is the highest priority and must override benchmark context.
- ACCOUNT CONTEXT is secondary and should only influence tone and numeric calibration.

STRICT RULES:
{strict_rules}

{user_request_text}

{account_context_text}

Current blocks:
{compact_blocks}

Extra instruction:
{instruction or "N/A"}

Regeneration guardrails:
- Preserve product/offer relevance and language consistency from USER REQUEST.
- If block_type is creativePlan, all primaryTexts/headlines must stay in the requested language.
- If block_type is audiencePlan, interests must map directly to the user product/offer.
- If block_type is audiencePlan, interests must be short Meta categories (1-4 words), never full-sentence brief text.

Return ONLY valid JSON with exactly one top-level key named "{block_type}".
Do not include any other keys.

Data:
{compact_context}
"""
        system = (
            "You are an expert Meta ads strategist. "
            "Output ONLY valid JSON. No markdown, no intro text."
        )
        raw = self._generate(prompt, model=self.flash_model, system_instruction=system)
        parsed = self._parse_json_dict(raw)
        if not isinstance(parsed, dict):
            return {}
        if block_type not in parsed:
            return {}
        return {block_type: parsed.get(block_type)}

    def _campaign_builder_prompt_sections(self, context: dict) -> tuple[str, str, str]:
        prompt_sections = context.get("promptSections", {}) if isinstance(context.get("promptSections"), dict) else {}
        user_request_text = str(prompt_sections.get("userRequestText") or "").strip()
        account_context_text = str(prompt_sections.get("accountContextText") or "").strip()
        strict_rules = self._campaign_builder_strict_rules(context)
        if not user_request_text:
            user_request_text = self._fallback_campaign_builder_user_request(context)
        if not account_context_text:
            account_context_text = self._fallback_campaign_builder_account_context(context)
        return strict_rules, user_request_text, account_context_text

    @staticmethod
    def _campaign_builder_strict_rules(context: dict) -> str:
        policy = context.get("promptPolicy", {}) if isinstance(context, dict) else {}
        raw_rules = policy.get("strictRules", []) if isinstance(policy, dict) else []
        if isinstance(raw_rules, list):
            cleaned = [str(rule).strip() for rule in raw_rules if str(rule).strip()]
            if cleaned:
                return "\n".join(f"- {rule}" for rule in cleaned)
        return (
            "- RULE 1 (PRODUCT IS KING): You MUST write the campaign specifically for the PRODUCT/OFFER provided by the user. "
            "DO NOT write generic marketing copy. DO NOT talk about 'ROAS' or 'Performance' unless the product is a B2B marketing service.\n"
            "- RULE 2 (LANGUAGE): If the LANGUAGE is set to 'עברית' (Hebrew) or any other language, ALL fields inside creative_plan "
            "(primary texts, headlines) MUST be 100% in that language. No English exceptions.\n"
            "- RULE 3 (AUDIENCE LOGIC): The interests must directly relate to the specific product/offer. "
            "Do not suggest 'Online Shopping' for an Insurance campaign. Interests must be short valid Meta categories.\n"
            "- RULE 4 (NO PARROTING): DO NOT copy and paste the raw Product/Offer text into output fields. Write original concise copy.\n"
            "- RULE 5 (STRICT LANGUAGE ENFORCEMENT): The ENTIRE creative_plan output must be in the requested language, with no mixed-language wrappers."
        )

    @staticmethod
    def _fallback_campaign_builder_user_request(context: dict) -> str:
        inputs = context.get("inputs", {}) if isinstance(context, dict) else {}
        return (
            "=== USER REQUEST (HIGHEST PRIORITY) ===\n"
            f"Product/Offer: {inputs.get('offer', '')}\n"
            f"Objective: {inputs.get('objective', 'OUTCOME_SALES')}\n"
            f"Language: {inputs.get('language', 'en')}\n"
            f"Target Geo: {inputs.get('country', 'US')}"
        )

    @staticmethod
    def _fallback_campaign_builder_account_context(context: dict) -> str:
        benchmarks = context.get("benchmarkSnapshot", {}) if isinstance(context, dict) else {}
        return (
            "=== ACCOUNT CONTEXT (SECONDARY - USE ONLY FOR TONE/METRICS) ===\n"
            f"Account Benchmarks: {json.dumps(benchmarks, ensure_ascii=False, default=str)}"
        )

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

    @staticmethod
    def _parse_json_dict(text: str) -> dict:
        try:
            payload = json.loads(text)
            return payload if isinstance(payload, dict) else {}
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    payload = json.loads(text[start:end + 1])
                    return payload if isinstance(payload, dict) else {}
                except Exception:
                    return {}
        return {}

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

    def _generate(self, prompt: str, model: str | None = None, *, system_instruction: str | None = None) -> str:
        """Call Gemini API and return the response text."""
        if not self.api_key:
            return "_AI analysis unavailable: Gemini API key not configured._"

        model_name = model or self.pro_model
        try:
            gemini_model = self._get_model(model_name, system_instruction=system_instruction)
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
