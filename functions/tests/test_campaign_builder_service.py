import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import re

from services.campaign_builder_service import CampaignBuilderService, ValidationError


class CampaignBuilderServiceTest(unittest.TestCase):
    def setUp(self):
        self.service = CampaignBuilderService(db=MagicMock())

    def test_validate_blocks_errors_on_missing_required_fields(self):
        result = self.service._validate_blocks({}, {})
        self.assertFalse(result["isValid"])
        self.assertGreaterEqual(len(result["errors"]), 3)

    def test_normalize_blocks_populates_defaults(self):
        inputs = {"campaignName": "Launch A", "objective": "OUTCOME_SALES", "country": "IL", "dailyBudget": 77}
        blocks = self.service._normalize_blocks({}, inputs)
        self.assertEqual(blocks["campaignPlan"]["name"], "Launch A")
        self.assertEqual(blocks["campaignPlan"]["dailyBudget"], 77)
        self.assertEqual(blocks["audiencePlan"]["geo"]["countries"], ["IL"])
        self.assertTrue(blocks["creativePlan"]["primaryTexts"])

    def test_preflight_marks_high_budget_confirmation(self):
        fake_ref = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {
            "inputs": {},
            "blocks": {
                "campaignPlan": {"name": "X", "dailyBudget": 1000, "objective": "OUTCOME_SALES"},
                "audiencePlan": {"geo": {"countries": ["US"]}},
                "creativePlan": {"primaryTexts": ["a"], "headlines": ["b"]},
            },
            "status": "draft",
            "updatedAt": datetime.now(timezone.utc),
        }
        fake_ref.get.return_value = fake_doc

        self.service._draft_ref = MagicMock(return_value=fake_ref)
        self.service._compute_account_avg_daily_budget = MagicMock(return_value=50)

        result = self.service.preflight(user_id="u1", account_id="a1", draft_id="d1")
        self.assertEqual(result["safetyStatus"], "blocked")
        self.assertTrue(result["requiresExplicitConfirm"])
        self.assertTrue(result["budgetCheck"]["isOver10x"])

    def test_regenerate_block_preserves_other_blocks(self):
        fake_ref = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {
            "inputs": {
                "campaignName": "My Campaign",
                "objective": "OUTCOME_SALES",
                "country": "US",
                "dailyBudget": 100,
            },
            "blocks": {
                "campaignPlan": {
                    "name": "My Campaign",
                    "objective": "OUTCOME_SALES",
                    "dailyBudget": 100,
                    "buyingType": "AUCTION",
                    "budgetType": "daily",
                },
                "audiencePlan": {"geo": {"countries": ["US"]}, "interests": ["Real Estate"]},
                "creativePlan": {"primaryTexts": ["A"], "headlines": ["B"], "angles": ["C"], "cta": "LEARN_MORE"},
                "reasoning": "Initial strategy",
            },
        }
        fake_ref.get.return_value = fake_doc

        self.service._ensure_account_exists = MagicMock()
        self.service._build_context = MagicMock(return_value={})
        self.service._draft_ref = MagicMock(return_value=fake_ref)
        self.service.ai.generate_audience_plan = MagicMock(
            return_value={
                "audiencePlan": {
                    "geo": {"countries": ["CA"]},
                    "interests": ["Stock Market"],
                    "genders": ["all"],
                    "lookalikeHints": ["1% purchasers"],
                }
            }
        )

        result = self.service.regenerate_block(
            user_id="u1",
            account_id="a1",
            draft_id="d1",
            block_type="AUDIENCE",
            instruction="Try Canada",
        )

        self.assertEqual(result["blocks"]["campaignPlan"]["name"], "My Campaign")
        self.assertEqual(result["blocks"]["creativePlan"]["headlines"], ["B"])
        self.assertEqual(result["blocks"]["audiencePlan"]["geo"]["countries"], ["CA"])
        fake_ref.update.assert_called_once()

    def test_generate_full_draft_via_agents_uses_sequential_context(self):
        self.service.ai.generate_strategy_plan = MagicMock(
            return_value={
                "campaignPlan": {
                    "name": "Insurance IL",
                    "objective": "OUTCOME_LEADS",
                    "buyingType": "AUCTION",
                    "budgetType": "daily",
                    "dailyBudget": 100,
                },
                "reasoning": "Strategy first",
            }
        )
        self.service.ai.generate_audience_plan = MagicMock(
            return_value={"audiencePlan": {"interests": ["Vehicle insurance"], "geo": {"countries": ["IL"]}}}
        )
        self.service.ai.generate_creative_plan = MagicMock(
            return_value={"creativePlan": {"primaryTexts": ["טקסט"], "headlines": ["כותרת"], "angles": ["הוק"], "cta": "LEARN_MORE"}}
        )

        blocks = self.service._generate_full_draft_via_agents(context={"inputs": {"offer": "ביטוח רכב"}})

        self.assertIn("campaignPlan", blocks)
        self.assertIn("audiencePlan", blocks)
        self.assertIn("creativePlan", blocks)
        audience_current_blocks = self.service.ai.generate_audience_plan.call_args.kwargs["current_blocks"]
        creative_current_blocks = self.service.ai.generate_creative_plan.call_args.kwargs["current_blocks"]
        self.assertIn("campaignPlan", audience_current_blocks)
        self.assertIn("audiencePlan", creative_current_blocks)

    def test_budget_guardrail_blocks_over_absolute_limit(self):
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={},
                proposed_daily_budget=1600,
            )

    def test_budget_guardrail_blocks_over_three_x_average(self):
        self.service._compute_account_avg_daily_spend = MagicMock(return_value=200)
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={},
                proposed_daily_budget=650,
            )

    def test_budget_guardrail_blocks_over_explicit_cap(self):
        self.service._compute_account_avg_daily_spend = MagicMock(return_value=0)
        with self.assertRaises(ValidationError):
            self.service._enforce_publish_budget_guardrail(
                user_id="u1",
                account_id="a1",
                account_data={"kpi_targets": {"max_daily_spend_cap": 300}},
                proposed_daily_budget=450,
            )

    def test_resolve_page_id_reads_nested_account_defaults(self):
        page_id = self.service._resolve_page_id(
            {"pageId": ""},
            {"defaults": {"pageId": "12345"}},
        )
        self.assertEqual(page_id, "12345")

    @patch("services.meta_api.MetaAPIService")
    @patch("services.meta_auth.fetch_pages")
    @patch("services.meta_auth.get_decrypted_token")
    def test_publish_draft_auto_resolves_page_id_from_fetch_pages(
        self,
        mock_get_token,
        mock_fetch_pages,
        mock_meta_api_cls,
    ):
        self.service._ensure_account_exists = MagicMock()
        self.service.preflight = MagicMock(return_value={"errors": [], "warnings": []})
        self.service._enforce_publish_budget_guardrail = MagicMock()
        self.service._create_launch_watch_card = MagicMock(return_value="watch-1")

        draft_ref = MagicMock()
        draft_doc = MagicMock()
        draft_doc.exists = True
        draft_doc.to_dict.return_value = {
            "status": "draft",
            "inputs": {
                "pageId": "",
                "destinationUrl": "https://landing.example",
                "campaignName": "AI Launch",
            },
            "blocks": {
                "campaignPlan": {"name": "AI Launch", "objective": "OUTCOME_SALES", "dailyBudget": 100},
                "audiencePlan": {"name": "Audience 1", "geo": {"countries": ["US"]}},
                "creativePlan": {"primaryTexts": ["Primary"], "headlines": ["Headline"]},
            },
        }
        draft_ref.get.return_value = draft_doc
        self.service._draft_ref = MagicMock(return_value=draft_ref)

        account_ref = MagicMock()
        account_doc = MagicMock()
        account_doc.exists = True
        account_doc.to_dict.return_value = {"websiteUrl": "https://landing.example"}
        account_ref.get.return_value = account_doc

        users_collection = MagicMock()
        user_doc = MagicMock()
        meta_accounts_collection = MagicMock()
        users_collection.document.return_value = user_doc
        user_doc.collection.return_value = meta_accounts_collection
        meta_accounts_collection.document.return_value = account_ref
        self.service.db.collection.return_value = users_collection

        mock_get_token.return_value = ("token-123", datetime.now(timezone.utc))
        mock_fetch_pages.return_value = [{"pageId": "pg-777", "pageName": "Main Page"}]

        api = MagicMock()
        api.create_campaign.return_value = "camp-1"
        api.create_adset.return_value = "adset-1"
        api.create_ad_creative.return_value = "creative-1"
        api.create_ad.return_value = "ad-1"
        mock_meta_api_cls.return_value = api

        result = self.service.publish_draft(
            user_id="u1",
            account_id="acc-1",
            draft_id="draft-1",
            confirm_high_budget=False,
        )

        self.assertEqual(result["campaignId"], "camp-1")
        self.assertEqual(result["adsetId"], "adset-1")
        account_ref.set.assert_called()

    def test_prompt_section_format_matches_priority_hierarchy(self):
        user_section = self.service._format_user_request_section(
            {
                "offer": "Car Insurance",
                "objective": "OUTCOME_LEADS",
                "language": "עברית",
                "country": "IL",
            }
        )
        account_section = self.service._format_account_context_section(
            {"peerBenchmark": {"accountsCompared": 3, "medianCTR": 1.2}}
        )

        self.assertIn("=== USER REQUEST (HIGHEST PRIORITY) ===", user_section)
        self.assertIn("Product/Offer: Car Insurance", user_section)
        self.assertIn("Language: עברית", user_section)
        self.assertIn("=== ACCOUNT CONTEXT (SECONDARY - USE ONLY FOR TONE/METRICS) ===", account_section)
        self.assertIn("Account Benchmarks:", account_section)

    def test_regenerate_normalizes_offer_from_legacy_inputs(self):
        fake_ref = MagicMock()
        fake_doc = MagicMock()
        fake_doc.exists = True
        fake_doc.to_dict.return_value = {
            "inputs": {
                "offerProduct": "Car Insurance",
                "objective": "OUTCOME_LEADS",
                "country": "IL",
                "language": "עברית",
                "dailyBudget": 100,
                "campaignName": "Car Insurance Leads",
            },
            "blocks": {
                "campaignPlan": {
                    "name": "Car Insurance Leads",
                    "objective": "OUTCOME_LEADS",
                    "dailyBudget": 100,
                    "buyingType": "AUCTION",
                    "budgetType": "daily",
                },
                "audiencePlan": {"geo": {"countries": ["IL"]}, "interests": ["ביטוח רכב"]},
                "creativePlan": {"primaryTexts": ["A"], "headlines": ["B"], "angles": ["C"], "cta": "LEARN_MORE"},
                "reasoning": "Initial strategy",
            },
        }
        fake_ref.get.return_value = fake_doc

        self.service._ensure_account_exists = MagicMock()
        self.service._build_context = MagicMock(return_value={})
        self.service._draft_ref = MagicMock(return_value=fake_ref)
        self.service.ai.generate_creative_plan = MagicMock(
            return_value={"creativePlan": {"primaryTexts": ["חדש"], "headlines": ["כותרת"]}}
        )

        self.service.regenerate_block(
            user_id="u1",
            account_id="a1",
            draft_id="d1",
            block_type="CREATIVE",
            instruction="כתוב בעברית",
        )

        build_context_inputs = self.service._build_context.call_args.kwargs["inputs"]
        self.assertEqual(build_context_inputs["offer"], "Car Insurance")
        self.assertEqual(build_context_inputs["language"], "עברית")

    def test_normalize_blocks_fallback_does_not_parrot_raw_brief(self):
        raw_brief = "ביטוח רכב לנהגים צעירים\nמחיר טוב ושירות מהיר\nלידים חמים"
        blocks = self.service._normalize_blocks(
            {},
            {
                "offer": raw_brief,
                "objective": "OUTCOME_LEADS",
                "language": "עברית",
                "country": "IL",
                "campaignName": "Lead Gen",
                "dailyBudget": 120,
            },
        )

        texts = blocks["creativePlan"]["primaryTexts"] + blocks["creativePlan"]["headlines"]
        self.assertTrue(texts)
        self.assertTrue(all(not re.search(r"[A-Za-z]", t) for t in texts))
        self.assertTrue(all(raw_brief not in t for t in texts))
        self.assertTrue(all("\n" not in i for i in blocks["audiencePlan"]["interests"]))

    def test_initial_full_draft_repairs_bad_creative_and_audience_with_llm(self):
        offer = "ביטוח רכב לנהגים צעירים עם כיסוי מלא והצעת מחיר מהירה אונליין"
        bad_blocks = {
            "campaignPlan": {"name": "X", "objective": "OUTCOME_LEADS", "dailyBudget": 100},
            "audiencePlan": {"interests": [offer]},
            "creativePlan": {
                "primaryTexts": [f"Looking for {offer}?"],
                "headlines": ["Best Offer"],
            },
            "reasoning": "ok",
        }

        def regen_side_effect(_context, *, current_blocks, block_type, instruction):
            if block_type == "audiencePlan":
                return {"audiencePlan": {"interests": ["ביטוח רכב", "רכב", "משפחה"], "geo": {"countries": ["IL"]}}}
            if block_type == "creativePlan":
                return {
                    "creativePlan": {
                        "primaryTexts": ["השאירו פרטים וקבלו הצעת מחיר מהירה."],
                        "headlines": ["ביטוח רכב משתלם"],
                    }
                }
            return {block_type: current_blocks.get(block_type)}

        self.service.ai.regenerate_campaign_builder_block = MagicMock(side_effect=regen_side_effect)
        repaired = self.service._repair_initial_full_draft_blocks_with_llm(
            context={},
            blocks=bad_blocks,
            inputs={"offer": offer, "language": "עברית"},
        )

        calls = [c.kwargs["block_type"] for c in self.service.ai.regenerate_campaign_builder_block.call_args_list]
        self.assertIn("audiencePlan", calls)
        self.assertIn("creativePlan", calls)
        self.assertEqual(repaired["creativePlan"]["headlines"], ["ביטוח רכב משתלם"])
        self.assertEqual(repaired["audiencePlan"]["interests"], ["ביטוח רכב", "רכב", "משפחה"])

    def test_initial_full_draft_skips_repair_when_model_returns_empty_payload(self):
        self.service.ai.regenerate_campaign_builder_block = MagicMock(return_value={"creativePlan": {"headlines": ["X"]}})
        repaired = self.service._repair_initial_full_draft_blocks_with_llm(
            context={},
            blocks={},
            inputs={"offer": "ביטוח", "language": "עברית"},
        )
        self.assertEqual(repaired, {})
        self.service.ai.regenerate_campaign_builder_block.assert_not_called()

    def test_hebrew_language_detection_handles_common_typos(self):
        self.assertTrue(self.service._is_hebrew_language("עברית"))
        self.assertTrue(self.service._is_hebrew_language("עבירת"))
        self.assertTrue(self.service._is_hebrew_language("he"))

    def test_generate_images_from_prompts_returns_empty_when_gemini_key_missing(self):
        self.service.art_director.api_key = ""
        urls = self.service._generate_images_from_prompts(
            prompts=["A cinematic insurance ad", "Nighttime roadside support"],
            account_id="acc-1",
        )
        self.assertEqual(urls, [])

    def test_generate_images_from_prompts_uploads_gemini_outputs(self):
        self.service.art_director.api_key = "test-key"
        self.service._call_nano_banana_pro_image_api = MagicMock(return_value=(b"img-bytes", "image/png"))
        self.service.art_director._upload_to_storage = MagicMock(side_effect=["https://cdn/img1.png", "https://cdn/img2.png"])

        urls = self.service._generate_images_from_prompts(
            prompts=["Prompt 1", "Prompt 2"],
            account_id="acc-1",
        )

        self.assertEqual(urls, ["https://cdn/img1.png", "https://cdn/img2.png"])
        self.assertEqual(self.service._call_nano_banana_pro_image_api.call_count, 2)
        self.assertEqual(self.service.art_director._upload_to_storage.call_count, 2)

    def test_extract_image_bytes_from_gemini_response_reads_inline_data(self):
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "image/png",
                                    "data": "aGVsbG8=",
                                }
                            }
                        ]
                    }
                }
            ]
        }
        image_bytes, mime_type = self.service._extract_image_bytes_from_gemini_response(payload)
        self.assertEqual(image_bytes, b"hello")
        self.assertEqual(mime_type, "image/png")


if __name__ == "__main__":
    unittest.main()
