import { formatCurrency, formatNumber, formatPercent, formatROAS } from "./format";
import type {
  AccountVertical,
  Campaign,
  DashboardMetricKey,
  InsightData,
  KPISummary,
  MetaAccount,
} from "../types";

export interface MetricDefinition {
  key: DashboardMetricKey;
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

const METRICS_BY_VERTICAL: Record<AccountVertical, MetricDefinition[]> = {
  LEAD_GEN: [
    { key: "spend", label: "Spend", icon: "payments", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
    { key: "leads", label: "Leads", icon: "person_add", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { key: "cpl", label: "CPL", icon: "price_change", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { key: "ctr", label: "CTR", icon: "ads_click", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { key: "cpm", label: "CPM", icon: "visibility", iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  ],
  ECOMMERCE: [
    { key: "spend", label: "Spend", icon: "payments", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
    { key: "purchases", label: "Purchases", icon: "shopping_cart", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { key: "cpa", label: "CPA", icon: "sell", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { key: "roas", label: "ROAS", icon: "trending_up", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { key: "ctr", label: "CTR", icon: "ads_click", iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  ],
  APP_INSTALLS: [
    { key: "spend", label: "Spend", icon: "payments", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
    { key: "installs", label: "Installs", icon: "download", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { key: "cpi", label: "CPI", icon: "price_change", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { key: "ctr", label: "CTR", icon: "ads_click", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  ],
};

const OBJECTIVE_TO_VERTICAL: Array<{ match: string; vertical: AccountVertical }> = [
  { match: "OUTCOME_LEADS", vertical: "LEAD_GEN" },
  { match: "LEAD", vertical: "LEAD_GEN" },
  { match: "OUTCOME_SALES", vertical: "ECOMMERCE" },
  { match: "SALES", vertical: "ECOMMERCE" },
  { match: "PURCHASE", vertical: "ECOMMERCE" },
  { match: "APP_INSTALL", vertical: "APP_INSTALLS" },
  { match: "INSTALL", vertical: "APP_INSTALLS" },
];

export function getMetricsForVertical(vertical: AccountVertical): MetricDefinition[] {
  return METRICS_BY_VERTICAL[vertical];
}

export function inferAccountVertical(
  account: MetaAccount | null | undefined,
  campaigns: Campaign[]
): AccountVertical {
  const explicit =
    normalizeVertical(account?.vertical) ??
    resolveVerticalFromObjective(account?.primaryObjective ?? "");
  if (explicit) return explicit;

  const fromCampaigns = resolveVerticalFromCampaigns(campaigns);
  if (fromCampaigns) return fromCampaigns;

  const kpi = account?.kpiSummary;
  if (kpi) {
    const leads = safeNumber(kpi.totalLeads);
    const purchases = safeNumber(kpi.totalPurchases);
    const installs = safeNumber(kpi.totalInstalls);

    if (installs > purchases && installs > leads) return "APP_INSTALLS";
    if (leads > purchases && leads > installs) return "LEAD_GEN";
    if (purchases > 0 || safeNumber(kpi.roas) > 0) return "ECOMMERCE";
  }
  return "LEAD_GEN";
}

function resolveVerticalFromCampaigns(campaigns: Campaign[]): AccountVertical | null {
  const votes: Record<AccountVertical, number> = {
    LEAD_GEN: 0,
    ECOMMERCE: 0,
    APP_INSTALLS: 0,
  };

  for (const campaign of campaigns) {
    const objective = String(campaign.objective || "");
    const vertical = resolveVerticalFromObjective(objective);
    if (vertical) votes[vertical] += 1;
  }

  const entries = Object.entries(votes) as Array<[AccountVertical, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0] && entries[0][1] > 0 ? entries[0][0] : null;
}

function resolveVerticalFromObjective(objective: string): AccountVertical | null {
  const normalized = objective.toUpperCase().trim();
  if (!normalized) return null;
  for (const candidate of OBJECTIVE_TO_VERTICAL) {
    if (normalized.includes(candidate.match)) return candidate.vertical;
  }
  return null;
}

function normalizeVertical(vertical: string | undefined): AccountVertical | null {
  if (!vertical) return null;
  const normalized = vertical.toUpperCase().trim();
  if (normalized === "LEAD_GEN") return "LEAD_GEN";
  if (normalized === "ECOMMERCE") return "ECOMMERCE";
  if (normalized === "APP_INSTALLS") return "APP_INSTALLS";
  return null;
}

export function formatSummaryMetric(
  summary: KPISummary | undefined,
  key: DashboardMetricKey,
  currency: string
): string {
  if (!summary) {
    if (isCurrencyMetric(key)) return formatCurrency(0, currency);
    if (isPercentMetric(key)) return formatPercent(0);
    if (key === "roas") return formatROAS(0);
    return formatNumber(0);
  }
  const value = summaryMetricValue(summary, key);
  return formatMetricValue(key, value, currency);
}

export function formatInsightMetric(
  insight: InsightData | undefined,
  key: DashboardMetricKey,
  currency: string
): string {
  const value = insightMetricValue(insight, key);
  return formatMetricValue(key, value, currency);
}

export function summaryMetricTrend(
  summary: KPISummary | undefined,
  key: DashboardMetricKey
): boolean | null {
  if (!summary) return null;
  if (key === "ctr") {
    const value = safeNumber(summary.avgCTR);
    if (value <= 0) return null;
    return value >= 1;
  }
  if (key === "roas") {
    const value = safeNumber(summary.roas);
    if (value <= 0) return null;
    return value >= 2;
  }
  return null;
}

export function summaryMetricValue(summary: KPISummary, key: DashboardMetricKey): number {
  const spend = safeNumber(summary.totalSpend);
  const leads = safeNumber(summary.totalLeads);
  const purchases = safeNumber(summary.totalPurchases);
  const installs = safeNumber(summary.totalInstalls);

  switch (key) {
    case "spend":
      return spend;
    case "leads":
      return leads;
    case "cpl":
      return safeNumber(summary.avgCostPerLead) || safeDivide(spend, leads);
    case "ctr":
      return safeNumber(summary.avgCTR);
    case "cpm":
      return safeNumber(summary.avgCPM);
    case "purchases":
      return purchases;
    case "cpa":
      return safeDivide(spend, purchases);
    case "roas":
      return safeNumber(summary.roas);
    case "installs":
      return installs;
    case "cpi":
      return safeNumber(summary.avgCPI) || safeDivide(spend, installs);
    default:
      return 0;
  }
}

export function insightMetricValue(insight: InsightData | undefined, key: DashboardMetricKey): number {
  if (!insight) return 0;
  const spend = safeNumber(insight.spend);
  const leads = safeNumber(insight.leads);
  const purchases = safeNumber(insight.purchases);
  const installs = safeNumber(insight.installs);

  switch (key) {
    case "spend":
      return spend;
    case "leads":
      return leads;
    case "cpl":
      return safeNumber(insight.costPerLead) || safeDivide(spend, leads);
    case "ctr":
      return safeNumber(insight.ctr);
    case "cpm":
      return safeNumber(insight.cpm);
    case "purchases":
      return purchases;
    case "cpa":
      return safeNumber(insight.cpa) || safeDivide(spend, purchases);
    case "roas":
      return safeNumber(insight.roas);
    case "installs":
      return installs;
    case "cpi":
      return safeNumber(insight.cpi) || safeDivide(spend, installs);
    default:
      return 0;
  }
}

export function metricSortValue(insight: InsightData | undefined, key: DashboardMetricKey): number {
  return insightMetricValue(insight, key);
}

function formatMetricValue(key: DashboardMetricKey, value: number, currency: string): string {
  const sanitized = safeNumber(value);
  if (isCurrencyMetric(key)) return formatCurrency(sanitized, currency);
  if (isPercentMetric(key)) return formatPercent(sanitized);
  if (key === "roas") return formatROAS(sanitized);
  return formatNumber(sanitized);
}

function isCurrencyMetric(key: DashboardMetricKey): boolean {
  return ["spend", "cpl", "cpm", "cpa", "cpi"].includes(key);
}

function isPercentMetric(key: DashboardMetricKey): boolean {
  return key === "ctr";
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function safeNumber(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}
