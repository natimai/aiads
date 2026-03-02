export interface MetaAccount {
  id: string;
  accountName: string;
  currency: string;
  businessName?: string;
  isActive: boolean;
  isManagedByPlatform: boolean;
  tokenExpiry?: string;
  kpiSummary?: KPISummary;
  kpiUpdatedAt?: string;
}

export interface KPISummary {
  date: string;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalLeads?: number;
  totalLinkClicks?: number;
  totalInstalls: number;
  totalPurchases: number;
  totalPurchaseValue: number;
  avgCostPerLead?: number;
  avgCPI: number;
  avgCPM: number;
  avgCTR: number;
  roas: number;
}

export interface Campaign {
  id: string;
  metaCampaignId?: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget: number;
  lifetimeBudget: number;
  budgetRemaining?: number;
  accountId?: string;
  accountName?: string;
  todayInsights?: InsightData;
  adsets?: AdSet[];
  lastSynced?: string;
}

export interface AdSet {
  id: string;
  metaAdsetId?: string;
  name: string;
  status: string;
  dailyBudget: number;
  lifetimeBudget: number;
  bidStrategy?: string;
  targetingSummary?: string;
  optimizationGoal?: string;
  ads?: Ad[];
}

export interface Ad {
  id: string;
  metaAdId?: string;
  name: string;
  status: string;
  creativeId?: string;
  creativeThumbnailUrl?: string;
}

export interface InsightData {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  frequency: number;
  reach: number;
  leads?: number;
  linkClicks?: number;
  costPerLead?: number;
  costPerLinkClick?: number;
  installs: number;
  purchases: number;
  purchaseValue: number;
  cpi: number;
  cpa: number;
  roas: number;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  lastUpdated?: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  campaignName?: string;
  campaignRef?: string;
  adsetRef?: string;
  adRef?: string;
  thresholdValue: number | string;
  actualValue: number | string;
  accountId: string;
  accountName?: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  createdAt: string;
}

export type AlertType =
  | "roas_drop"
  | "creative_fatigue"
  | "budget_anomaly"
  | "cpi_spike"
  | "campaign_status";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertConfig {
  id?: string;
  userId: string;
  accountId: string;
  alertType: AlertType;
  enabled: boolean;
  threshold: number;
  cooldownHours: number;
  channels: string[];
}

export interface AIInsight {
  id: string;
  userId: string;
  accountId: string;
  insightType: string;
  content: string;
  generatedAt: string;
  expiresAt: string;
}

export type RecommendationType =
  | "budget_optimization"
  | "audience_optimization"
  | "creative_optimization"
  | "ab_test"
  | "campaign_build"
  | "audience_build"
  | "creative_copy";

export type RecommendationStatus = "pending" | "approved" | "rejected" | "executed" | "failed";
export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationEntityLevel = "account" | "campaign" | "adset" | "ad";

export interface ProposedAction {
  action?: string;
  entity_id?: string;
  entity_name?: string;
  value?: unknown;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  status: RecommendationStatus;
  priority: RecommendationPriority;
  entityLevel: RecommendationEntityLevel;
  entityId: string;
  title: string;
  why: string;
  reasoning: string;
  confidence: number;
  expectedImpact: {
    metric?: string;
    direction?: "up" | "down";
    magnitudePct?: number;
    summary?: string;
  };
  actionsDraft: string[];
  executionPlan?: {
    action?: "adjust_budget" | "set_status" | "none";
    targetLevel?: "campaign" | "adset" | "ad" | "account";
    targetId?: string;
    deltaPct?: number;
    desiredStatus?: "active" | "paused";
  };
  suggestedContent?: {
    creativeCopy?: string;
    campaignPlan?: { name?: string; objective?: string; targeting?: string };
    audienceSuggestions?: string[];
  };
  metricsSnapshot?: Record<string, number>;
  uiDisplayText?: string;
  proposedAction?: ProposedAction;
  wasModified?: boolean;
  originalPlan?: Record<string, unknown>;
  execution?: {
    executedBy?: string;
    executedAt?: string;
    result?: Record<string, unknown>;
    error?: string;
  };
  rollback?: {
    rolledBackBy?: string;
    rolledBackAt?: string;
    result?: Record<string, unknown>;
  };
  createdAt: string;
  expiresAt?: string;
  review?: {
    reviewedBy?: string;
    reviewedAt?: string;
    reason?: string;
  };
}

export interface RecommendationModifications {
  deltaPct?: number;
  desiredStatus?: "active" | "paused";
  creativeCopy?: string;
  audienceSuggestions?: string[];
}

export interface RecommendationExecution {
  id: string;
  requestedBy?: string;
  requestedAt?: string;
  finishedAt?: string;
  status: "running" | "executed" | "failed";
  action?: string;
  targetId?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface RollbackPreview {
  canRollback: boolean;
  action: "rollback_budget" | "rollback_status";
  targetLevel: "campaign" | "adset" | "ad" | "account";
  targetId: string;
  currentBudget?: number;
  restoredBudget?: number;
  diffBudget?: number;
  currentStatus?: string;
  restoredStatus?: string;
}

export interface ExecutePreview {
  canExecute: boolean;
  reason?: string;
  action?: "adjust_budget" | "set_status";
  targetLevel?: "campaign" | "adset" | "ad" | "account";
  targetId?: string;
  deltaPct?: number;
  currentBudget?: number;
  newBudget?: number;
  diffBudget?: number;
  currentStatus?: string;
  desiredStatus?: string;
  isNoop?: boolean;
}

export interface RecommendationPolicy {
  allowExecute: boolean;
  allowRollback: boolean;
  minConfidenceToExecute: number;
  maxBudgetDeltaPct: number;
}

export interface Report {
  id: string;
  type: "daily" | "weekly";
  content: string;
  status: string;
  createdAt: string;
  deliveredTo: string[];
  downloadUrl?: string;
}

export interface ReportConfig {
  id?: string;
  userId: string;
  reportType: "daily" | "weekly";
  deliveryChannels: string[];
  scheduleTime: string;
  timezone: string;
  enabled: boolean;
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}
