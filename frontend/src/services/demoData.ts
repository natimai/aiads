import type { MetaAccount, Campaign, InsightData, Alert, AlertConfig, AIInsight, Report } from "../types";

const today = new Date().toISOString().split("T")[0]!;
const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

export const DEMO_ACCOUNTS: MetaAccount[] = [
  {
    id: "act_111111",
    accountName: "MyApp - iOS (US)",
    currency: "USD",
    businessName: "MyApp Inc.",
    isActive: true,
    tokenExpiry: new Date(Date.now() + 30 * 86400000).toISOString(),
    kpiSummary: {
      date: today,
      totalSpend: 4250.80,
      totalImpressions: 1_850_000,
      totalClicks: 42_300,
      totalInstalls: 1_820,
      totalPurchases: 340,
      totalPurchaseValue: 8_520.00,
      avgCPI: 2.34,
      avgCPM: 2.30,
      avgCTR: 2.29,
      roas: 2.00,
    },
  },
  {
    id: "act_222222",
    accountName: "MyApp - Android (EU)",
    currency: "EUR",
    businessName: "MyApp Inc.",
    isActive: true,
    tokenExpiry: new Date(Date.now() + 45 * 86400000).toISOString(),
    kpiSummary: {
      date: today,
      totalSpend: 2_870.50,
      totalImpressions: 1_200_000,
      totalClicks: 31_200,
      totalInstalls: 1_450,
      totalPurchases: 210,
      totalPurchaseValue: 5_740.00,
      avgCPI: 1.98,
      avgCPM: 2.39,
      avgCTR: 2.60,
      roas: 2.00,
    },
  },
];

const CAMPAIGN_NAMES = [
  "US - Lookalike - Video Ads",
  "US - Broad - UGC Creatives",
  "US - Interest - Gaming",
  "US - Retargeting - Cart Abandoners",
  "EU - Broad - App Install",
  "EU - Lookalike - High Value",
];

export const DEMO_CAMPAIGNS: Campaign[] = CAMPAIGN_NAMES.map((name, i) => {
  const spend = randomBetween(300, 1500);
  const impressions = Math.round(randomBetween(80000, 500000));
  const clicks = Math.round(impressions * randomBetween(0.015, 0.035));
  const installs = Math.round(clicks * randomBetween(0.05, 0.15));
  const purchaseValue = spend * randomBetween(0.5, 3.5);
  const cpi = installs > 0 ? spend / installs : 0;
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
    id: `camp_${i + 1}`,
    metaCampaignId: `23851${i}00000`,
    name,
    status: i === 3 ? "PAUSED" : "ACTIVE",
    objective: "APP_INSTALLS",
    dailyBudget: randomBetween(200, 2000),
    lifetimeBudget: 0,
    accountId: i < 4 ? "act_111111" : "act_222222",
    accountName: i < 4 ? "MyApp - iOS (US)" : "MyApp - Android (EU)",
    todayInsights: {
      date: today,
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      frequency: randomBetween(1.2, 3.5),
      reach: Math.round(impressions * 0.7),
      installs,
      purchases: Math.round(installs * randomBetween(0.1, 0.3)),
      purchaseValue,
      cpi,
      cpa: installs > 0 ? spend / installs : 0,
      roas,
    },
  };
});

function generateDailyInsights(days: number): InsightData[] {
  const results: InsightData[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split("T")[0]!;
    for (const campaign of DEMO_CAMPAIGNS.slice(0, 4)) {
      const spend = randomBetween(250, 1200);
      const impressions = Math.round(randomBetween(60000, 400000));
      const clicks = Math.round(impressions * randomBetween(0.015, 0.035));
      const installs = Math.round(clicks * randomBetween(0.05, 0.15));
      const purchaseValue = spend * randomBetween(0.5, 3.5);

      results.push({
        date,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        frequency: randomBetween(1.2, 3.5),
        reach: Math.round(impressions * 0.7),
        installs,
        purchases: Math.round(installs * randomBetween(0.1, 0.3)),
        purchaseValue,
        cpi: installs > 0 ? spend / installs : 0,
        cpa: installs > 0 ? spend / installs : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
        campaignId: campaign.id,
        campaignName: campaign.name,
      });
    }
  }
  return results;
}

export const DEMO_INSIGHTS: InsightData[] = generateDailyInsights(14);

export const DEMO_ALERTS: Alert[] = [
  {
    id: "alert_1",
    type: "roas_drop",
    severity: "critical",
    message: "ROAS dropped below threshold. Current ROAS: 0.85x (threshold: 1.50x). 3-day avg: 1.92x. 7-day avg: 2.10x",
    campaignName: "US - Retargeting - Cart Abandoners",
    campaignRef: "camp_4",
    thresholdValue: 1.5,
    actualValue: 0.85,
    accountId: "act_111111",
    accountName: "MyApp - iOS (US)",
    acknowledged: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "alert_2",
    type: "cpi_spike",
    severity: "warning",
    message: "CPI spike detected. CPI: $4.80 (threshold: $3.50). 7d avg: $2.34 (+105.1%)",
    campaignName: "US - Interest - Gaming",
    campaignRef: "camp_3",
    thresholdValue: 3.5,
    actualValue: 4.80,
    accountId: "act_111111",
    accountName: "MyApp - iOS (US)",
    acknowledged: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "alert_3",
    type: "creative_fatigue",
    severity: "warning",
    message: "Creative fatigue detected. CTR declining for 4+ consecutive days; Frequency at 3.8 (threshold: 3.0)",
    campaignName: "EU - Broad - App Install",
    campaignRef: "camp_5",
    thresholdValue: 3.0,
    actualValue: 3.8,
    accountId: "act_222222",
    accountName: "MyApp - Android (EU)",
    acknowledged: true,
    acknowledgedAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "alert_4",
    type: "budget_anomaly",
    severity: "info",
    message: "Underspending: $180.00 spent (-40.0% vs expected $300.00 at hour 14)",
    campaignName: "US - Broad - UGC Creatives",
    campaignRef: "camp_2",
    thresholdValue: 30,
    actualValue: -40,
    accountId: "act_111111",
    accountName: "MyApp - iOS (US)",
    acknowledged: false,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
];

export const DEMO_AI_INSIGHTS: AIInsight[] = [
  {
    id: "ai_1",
    userId: "demo",
    accountId: "act_111111",
    insightType: "daily_summary",
    content: `## Daily Performance Summary — ${today}

**Overall Performance: Mixed results today.**

Total spend across the account is $4,250 with a blended ROAS of 2.00x, which is within target range.

### Top Performers
1. **US - Lookalike - Video Ads** is the strongest campaign with a ROAS of 2.8x and CPI of $1.95. The lookalike audience is delivering quality installs.
2. **US - Broad - UGC Creatives** maintains solid performance with CTR of 2.8%, indicating strong creative engagement.

### Needs Attention
1. **US - Retargeting - Cart Abandoners** is paused due to ROAS dropping to 0.85x. The retargeting pool may be exhausted — consider refreshing the audience window from 7 to 14 days.
2. **US - Interest - Gaming** saw a CPI spike to $4.80 (105% above 7-day average). Increased competition in the gaming interest segment is likely driving CPMs up.

### Key Recommendation
Shift 20% of the Gaming campaign budget to the Lookalike campaign, which has headroom to scale while maintaining strong unit economics.`,
    generatedAt: new Date(Date.now() - 1800000).toISOString(),
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  },
];
