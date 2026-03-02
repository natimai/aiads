import unittest

from services.ai_analyzer import AIAnalyzer


class AIAnalyzerContractTest(unittest.TestCase):
    def test_parse_recommendation_json_accepts_wrapped_content(self):
        text = """Some preamble
{
  "recommendations": [
    {
      "type": "budget_optimization",
      "entityLevel": "campaign",
      "entityId": "123",
      "title": "Increase budget on winner",
      "priority": "high",
      "confidence": 0.82,
      "expectedImpact": {"summary": "Improve ROAS"},
      "why": "Strong ROAS with stable CPI",
      "reasoning": "7-day trend is up",
      "actionsDraft": ["Increase by 15%"]
    }
  ]
}
Trailing note"""
        parsed = AIAnalyzer._parse_recommendation_json(text, max_items=5)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["type"], "budget_optimization")
        self.assertEqual(parsed[0]["entityId"], "123")

    def test_parse_recommendation_json_returns_empty_on_invalid_payload(self):
        parsed = AIAnalyzer._parse_recommendation_json("not-json", max_items=5)
        self.assertEqual(parsed, [])


if __name__ == "__main__":
    unittest.main()
