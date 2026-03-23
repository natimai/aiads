"""Tests for objective context resolution utility."""
from __future__ import annotations

import pytest

from utils.objective_context import (
    get_objective_context,
    get_primary_metrics,
    resolve_vertical,
)


# ---------------------------------------------------------------------------
# resolve_vertical
# ---------------------------------------------------------------------------

class TestResolveVertical:
    def test_explicit_vertical_takes_priority(self):
        account = {"vertical": "ECOMMERCE", "primaryObjective": "OUTCOME_LEADS"}
        campaigns = [{"objective": "OUTCOME_LEADS"}] * 3
        assert resolve_vertical(account, campaigns) == "ECOMMERCE"

    def test_explicit_vertical_case_insensitive(self):
        assert resolve_vertical({"vertical": "lead_gen"}, []) == "LEAD_GEN"
        assert resolve_vertical({"vertical": "app_installs"}, []) == "APP_INSTALLS"

    def test_primary_objective_outcome_leads(self):
        account = {"primaryObjective": "OUTCOME_LEADS"}
        assert resolve_vertical(account, []) == "LEAD_GEN"

    def test_primary_objective_outcome_sales(self):
        account = {"primaryObjective": "OUTCOME_SALES"}
        assert resolve_vertical(account, []) == "ECOMMERCE"

    def test_primary_objective_app_install(self):
        account = {"primaryObjective": "APP_INSTALLS"}
        assert resolve_vertical(account, []) == "APP_INSTALLS"

    def test_campaign_majority_vote_lead_gen(self):
        campaigns = [
            {"objective": "OUTCOME_LEADS"},
            {"objective": "OUTCOME_LEADS"},
            {"objective": "OUTCOME_SALES"},
        ]
        assert resolve_vertical({}, campaigns) == "LEAD_GEN"

    def test_campaign_majority_vote_ecommerce(self):
        campaigns = [
            {"objective": "OUTCOME_SALES"},
            {"objective": "OUTCOME_SALES"},
            {"objective": "OUTCOME_LEADS"},
        ]
        assert resolve_vertical({}, campaigns) == "ECOMMERCE"

    def test_campaign_majority_vote_app_installs(self):
        campaigns = [
            {"objective": "APP_INSTALLS"},
            {"objective": "APP_INSTALLS"},
            {"objective": "OUTCOME_LEADS"},
        ]
        assert resolve_vertical({}, campaigns) == "APP_INSTALLS"

    def test_empty_campaigns_and_no_account_data_fallback(self):
        assert resolve_vertical({}, []) == "LEAD_GEN"

    def test_invalid_vertical_ignored(self):
        account = {"vertical": "UNKNOWN_TYPE"}
        assert resolve_vertical(account, []) == "LEAD_GEN"

    def test_none_account_values(self):
        account = {"vertical": None, "primaryObjective": None}
        assert resolve_vertical(account, []) == "LEAD_GEN"


# ---------------------------------------------------------------------------
# get_primary_metrics
# ---------------------------------------------------------------------------

class TestGetPrimaryMetrics:
    def test_lead_gen_metrics(self):
        m = get_primary_metrics("LEAD_GEN")
        assert m["primaryConversion"] == "leads"
        assert m["primaryCostMetric"] == "cpl"
        assert m["primaryEfficiencyMetric"] == "cpl"
        assert m["validationMetric"] == "cpl_7d_trend"

    def test_ecommerce_metrics(self):
        m = get_primary_metrics("ECOMMERCE")
        assert m["primaryConversion"] == "purchases"
        assert m["primaryCostMetric"] == "cpa"
        assert m["primaryEfficiencyMetric"] == "roas"
        assert m["validationMetric"] == "roas_7d"

    def test_app_installs_metrics(self):
        m = get_primary_metrics("APP_INSTALLS")
        assert m["primaryConversion"] == "installs"
        assert m["primaryCostMetric"] == "cpi"
        assert m["primaryEfficiencyMetric"] == "cpi"
        assert m["validationMetric"] == "cpi_7d_trend"

    def test_unknown_vertical_falls_back_to_lead_gen(self):
        m = get_primary_metrics("UNKNOWN")
        assert m["primaryConversion"] == "leads"


# ---------------------------------------------------------------------------
# get_objective_context
# ---------------------------------------------------------------------------

class TestGetObjectiveContext:
    def test_basic_lead_gen_context(self):
        ctx = get_objective_context(
            {"primaryObjective": "OUTCOME_LEADS"},
            [{"objective": "OUTCOME_LEADS"}],
        )
        assert ctx["vertical"] == "LEAD_GEN"
        assert ctx["mixedObjectives"] is False
        assert ctx["primaryConversion"] == "leads"
        assert ctx["primaryCostMetric"] == "cpl"

    def test_mixed_objectives_detected(self):
        campaigns = [
            {"objective": "OUTCOME_LEADS"},
            {"objective": "OUTCOME_LEADS"},
            {"objective": "OUTCOME_SALES"},
        ]
        ctx = get_objective_context({}, campaigns)
        assert ctx["vertical"] == "LEAD_GEN"  # majority
        assert ctx["mixedObjectives"] is True

    def test_single_vertical_not_mixed(self):
        campaigns = [
            {"objective": "OUTCOME_SALES"},
            {"objective": "OUTCOME_SALES"},
        ]
        ctx = get_objective_context({}, campaigns)
        assert ctx["vertical"] == "ECOMMERCE"
        assert ctx["mixedObjectives"] is False

    def test_empty_campaigns_not_mixed(self):
        ctx = get_objective_context({}, [])
        assert ctx["mixedObjectives"] is False

    def test_three_way_mixed(self):
        campaigns = [
            {"objective": "OUTCOME_LEADS"},
            {"objective": "OUTCOME_SALES"},
            {"objective": "APP_INSTALLS"},
        ]
        ctx = get_objective_context({}, campaigns)
        assert ctx["mixedObjectives"] is True

    def test_explicit_vertical_overrides_campaign_vote(self):
        campaigns = [
            {"objective": "OUTCOME_SALES"},
            {"objective": "OUTCOME_SALES"},
            {"objective": "OUTCOME_SALES"},
        ]
        ctx = get_objective_context({"vertical": "APP_INSTALLS"}, campaigns)
        assert ctx["vertical"] == "APP_INSTALLS"
        assert ctx["primaryConversion"] == "installs"
