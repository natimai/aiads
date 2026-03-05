"""Nano Banana — AI Art Director for Meta Ads creative generation.

Pipeline:
  1. Gemini Flash  →  extracts "Winning Angle" from the fatigued ad copy
  2. Art Director  →  builds 3 distinct Meta-native Imagen prompts
  3. Imagen 3      →  generates images via Google AI REST API
  4. Firebase Storage → stores images, returns 7-day signed URLs

Triggered by the Morning Strategist whenever creative_fatigue is detected
(Frequency > 2.5 AND CTR < 0.8%).
"""
from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Imagen 3 API constants
# ---------------------------------------------------------------------------
IMAGEN_MODEL = "imagen-3.0-generate-002"
IMAGEN_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{IMAGEN_MODEL}:predict"
)

# 3 distinct visual styles for Meta Ads
VISUAL_STYLES = [
    {
        "name": "ugc",
        "description": "Authentic UGC feel — raw, relatable, hand-held camera aesthetic with professional quality",
        "lighting": "Natural, slightly imperfect ambient lighting. Warm undertones.",
        "composition": "Slightly off-center, handheld feel, tight crop. Real-world environment.",
        "color": "Natural, desaturated palette with one warm accent color.",
    },
    {
        "name": "minimalist",
        "description": "High-end minimalist — clean, premium brand aesthetic. Think Apple or Rolex ads.",
        "lighting": "Studio soft-box lighting. Perfect shadows. White or near-white background.",
        "composition": "Perfect center frame. Rule of thirds. Extreme negative space.",
        "color": "Monochromatic with one bold accent. Deep navy or slate grey dominant.",
    },
    {
        "name": "lifestyle",
        "description": "Lifestyle in-context — real human situation, the product in its natural environment",
        "lighting": "Golden hour or late afternoon natural light. Cinematic warm tones.",
        "composition": "Wide establishing shot or environmental portrait. Depth of field.",
        "color": "Warm, inviting tones. Sunset oranges, earthy greens, creamy whites.",
    },
]


class NanaBananaArtDirector:
    """Two-step AI pipeline: Gemini Flash (angle extraction) → Imagen 3 (image generation)."""

    def __init__(self):
        self.api_key: str = os.environ.get("GEMINI_API_KEY", "")
        self.flash_model: str = os.environ.get(
            "GEMINI_FLASH_MODEL", "gemini-3-flash-preview"
        )
        self.storage_bucket: str = os.environ.get(
            "FIREBASE_STORAGE_BUCKET",
            f"{os.environ.get('FIREBASE_PROJECT_ID', '')}.appspot.com",
        )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def generate_for_task(
        self,
        task: dict[str, Any],
        account_id: str,
        *,
        ad_format: str = "SQUARE",
    ) -> list[str]:
        """
        Main entry point called by the Morning Strategist.

        Given a CREATIVE_REFRESH task (with metrics + entity info),
        runs the full pipeline and returns a list of signed image URLs.
        Returns [] on any error so the task is still saved without images.
        """
        if not self.api_key:
            logger.warning("Nano Banana skipped — GEMINI_API_KEY not set")
            return []

        try:
            # Pull the best ad copy we have from the task
            ad_copy = self._extract_ad_copy_from_task(task)
            campaign_name = task.get("proposed_action", {}).get("entity_name", "")
            task_id = task.get("task_id") or task.get("id") or "unknown"

            # Step A — extract marketing angle
            angle = self.extract_winning_angle(ad_copy, campaign_name)
            marketing_angle = angle.get("angle", "Brand value proposition")
            visual_hook = angle.get("visual_hook", "Product in use")

            logger.info(
                "Nano Banana angle: '%s' | hook: '%s' | account: %s",
                marketing_angle,
                visual_hook,
                account_id,
            )

            # Step B + C — generate 3 image variations (one per style)
            urls = self.generate_creative_images(
                marketing_angle=marketing_angle,
                visual_hook=visual_hook,
                account_id=account_id,
                task_id=task_id,
                ad_format=ad_format,
            )
            return urls

        except Exception as exc:
            logger.error("Nano Banana pipeline failed: %s", exc, exc_info=True)
            return []

    # ------------------------------------------------------------------
    # Step A — Extract Winning Angle
    # ------------------------------------------------------------------

    def extract_winning_angle(self, ad_copy: str, campaign_name: str = "") -> dict:
        """
        Gemini Flash extracts the core marketing angle and visual hook.

        Returns: {"angle": "...", "visual_hook": "..."}
        """
        if not ad_copy.strip():
            return {"angle": "Product value and quality", "visual_hook": "Product close-up"}

        prompt = f"""You are a creative strategist specializing in Meta Ads.
Extract the core marketing angle and visual hook from this ad copy.

Campaign: {campaign_name or "Unknown"}
Ad Copy: {ad_copy}

Return ONLY valid JSON (no markdown, no extra text):
{{
  "angle": "2-5 words describing the core emotional or rational appeal",
  "visual_hook": "2-4 words describing the ideal visual concept"
}}

Examples:
- Angle: "Frustration with high cost vs. smart saving" | Visual Hook: "Car + Money saving"
- Angle: "Home comfort and relaxation" | Visual Hook: "Armchair + Cozy atmosphere"
- Angle: "Professional results made easy" | Visual Hook: "Before/after transformation"
"""
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.flash_model)
            response = model.generate_content(
                prompt,
                generation_config={"max_output_tokens": 200, "temperature": 0.2},
            )
            raw = response.text or ""
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(raw[start:end])
                return {
                    "angle": str(data.get("angle", "Product value")),
                    "visual_hook": str(data.get("visual_hook", "Product close-up")),
                }
        except Exception as exc:
            logger.warning("Angle extraction failed: %s", exc)

        return {"angle": "Product value and quality", "visual_hook": "Product in use"}

    # ------------------------------------------------------------------
    # Step B — Build Art Direction Prompt
    # ------------------------------------------------------------------

    @staticmethod
    def build_art_direction_prompt(
        marketing_angle: str,
        visual_hook: str,
        style: dict,
        *,
        ad_format: str = "SQUARE",
    ) -> str:
        """
        Constructs a highly detailed art direction prompt optimised for Meta Ads CTR.
        Each of the 3 calls uses a different visual style (ugc / minimalist / lifestyle).
        """
        ratio_guidance = (
            "Aspect ratio 1:1, square format optimised for Facebook/Instagram Feed."
            if ad_format == "SQUARE"
            else "Aspect ratio 9:16, vertical format optimised for Instagram Reels and Stories."
        )

        prompt = f"""A high-quality commercial photograph for a Meta social media ad.

CREATIVE BRIEF
Marketing Angle: {marketing_angle}
Visual Concept: {visual_hook}

STYLE DIRECTION — {style["name"].upper()}
{style["description"]}

TECHNICAL SPECIFICATIONS
Lighting: {style["lighting"]}
Composition: {style["composition"]}
Colour Palette: {style["color"]}
{ratio_guidance}

HARD RULES (non-negotiable)
- NO text, letters, numbers, logos, watermarks, or typography anywhere in the image
- NO people's faces (faces cause Meta policy rejections)
- NO graphic violence, nudity, or controversial content
- Clean, uncluttered background — maximum 2 main subjects in frame
- Photo-realistic, not illustrated or cartoon
- Image must work standalone without any caption — tell the story visually
- Professional commercial photography quality, suitable for premium brand advertising"""

        return prompt

    # ------------------------------------------------------------------
    # Step C — Call Imagen 3 & Upload to Firebase Storage
    # ------------------------------------------------------------------

    def generate_creative_images(
        self,
        marketing_angle: str,
        visual_hook: str,
        account_id: str,
        task_id: str,
        *,
        ad_format: str = "SQUARE",
        count: int = 3,
    ) -> list[str]:
        """
        Generates `count` image variations using Imagen 3 (one per visual style)
        and uploads each to Firebase Storage.  Returns signed URLs (7-day expiry).
        """
        urls: list[str] = []
        styles = VISUAL_STYLES[:count]

        for i, style in enumerate(styles):
            try:
                image_prompt = self.build_art_direction_prompt(
                    marketing_angle, visual_hook, style, ad_format=ad_format
                )
                image_bytes = self._call_imagen_api(image_prompt, aspect_ratio="1:1" if ad_format == "SQUARE" else "9:16")
                if not image_bytes:
                    logger.warning("Imagen returned no bytes for style '%s'", style["name"])
                    continue

                blob_path = f"creative_assets/{account_id}/{task_id}/variation_{i}_{style['name']}.jpg"
                url = self._upload_to_storage(image_bytes, blob_path)
                if url:
                    urls.append(url)

            except Exception as exc:
                logger.error(
                    "Failed to generate image variation %d (%s): %s",
                    i,
                    style["name"],
                    exc,
                    exc_info=True,
                )

        logger.info(
            "Nano Banana generated %d/%d images for task %s",
            len(urls),
            count,
            task_id,
        )
        return urls

    def _call_imagen_api(self, prompt: str, aspect_ratio: str = "1:1") -> bytes | None:
        """
        Calls the Imagen 3 REST endpoint (Google AI Studio).
        Returns raw JPEG bytes or None on failure.
        """
        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
                "safetyFilterLevel": "BLOCK_ONLY_HIGH",
                "personGeneration": "DONT_ALLOW",
                "outputMimeType": "image/jpeg",
            },
        }
        try:
            resp = requests.post(
                IMAGEN_API_URL,
                params={"key": self.api_key},
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            predictions = data.get("predictions", [])
            if not predictions:
                logger.warning("Imagen returned empty predictions. Prompt: %s", prompt[:100])
                return None
            b64 = predictions[0].get("bytesBase64Encoded", "")
            if not b64:
                return None
            return base64.b64decode(b64)
        except requests.HTTPError as exc:
            logger.error("Imagen API HTTP error %s: %s", exc.response.status_code, exc.response.text[:300])
            return None
        except Exception as exc:
            logger.error("Imagen API call failed: %s", exc)
            return None

    def _upload_to_storage(
        self,
        image_bytes: bytes,
        blob_path: str,
        *,
        content_type: str = "image/jpeg",
    ) -> str | None:
        """
        Uploads image bytes to Firebase Storage and returns a 7-day signed URL.
        Falls back to a public URL if signing fails (e.g. local emulator).
        """
        try:
            from firebase_admin import storage as fb_storage

            bucket = fb_storage.bucket(self.storage_bucket or None)
            blob = bucket.blob(blob_path)
            blob.upload_from_string(image_bytes, content_type=content_type or "image/jpeg")

            # Try signed URL first (works without public bucket ACLs)
            try:
                expiry = datetime.now(timezone.utc) + timedelta(days=7)
                url = blob.generate_signed_url(
                    expiration=expiry,
                    method="GET",
                    version="v4",
                )
                return url
            except Exception:
                # Fall back to public URL (requires public bucket access)
                blob.make_public()
                return blob.public_url

        except Exception as exc:
            logger.error("Firebase Storage upload failed for '%s': %s", blob_path, exc)
            return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_ad_copy_from_task(task: dict[str, Any]) -> str:
        """Extract the best available ad copy from a task dict."""
        # Try suggestedContent.creativeCopy first (AI-generated copy)
        suggested = task.get("suggestedContent") or {}
        if isinstance(suggested, dict) and suggested.get("creativeCopy"):
            return str(suggested["creativeCopy"])

        # Try the proposed_action value (sometimes contains copy)
        proposed = task.get("proposed_action") or task.get("proposedAction") or {}
        if isinstance(proposed, dict) and isinstance(proposed.get("value"), str):
            val = proposed["value"]
            if len(val) > 20:  # Only use if it looks like copy, not a number
                return val

        # Fall back to reasoning (contains performance context)
        return str(task.get("reasoning") or task.get("why") or task.get("title") or "")
