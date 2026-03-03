import { describe, expect, it } from "vitest";
import { getMetricsForVertical, inferAccountVertical } from "./metricsConfig";
import type { Campaign, MetaAccount } from "../types";

describe("metricsConfig", () => {
  it("returns lead-gen metric set without ROAS/CPI", () => {
    const keys = getMetricsForVertical("LEAD_GEN").map((m) => m.key);
    expect(keys).toEqual(["spend", "leads", "cpl", "ctr", "cpm"]);
  });

  it("returns ecommerce metric set with ROAS/CPA", () => {
    const keys = getMetricsForVertical("ECOMMERCE").map((m) => m.key);
    expect(keys).toEqual(["spend", "purchases", "cpa", "roas", "ctr"]);
  });

  it("infers LEAD_GEN from account objective and ECOMMERCE from campaign objective", () => {
    const leadAccount: MetaAccount = {
      id: "1",
      accountName: "Lead Account",
      currency: "USD",
      primaryObjective: "OUTCOME_LEADS",
      isActive: true,
      isManagedByPlatform: true,
    };
    const ecomCampaigns: Campaign[] = [
      {
        id: "c1",
        name: "Sales campaign",
        status: "ACTIVE",
        objective: "OUTCOME_SALES",
        dailyBudget: 100,
        lifetimeBudget: 0,
      },
    ];

    expect(inferAccountVertical(leadAccount, [])).toBe("LEAD_GEN");
    expect(inferAccountVertical(undefined, ecomCampaigns)).toBe("ECOMMERCE");
  });
});
