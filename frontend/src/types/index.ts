export interface MetaAccount {
  id: string;
  accountName: string;
  currency: string;
  businessName?: string;
  vertical?: AccountVertical;
  primaryObjective?: string;
  isActive: boolean;
  isManagedByPlatform: boolean;
  tokenExpiry?: string;
  kpiSummary?: KPISummary;
  kpiUpdatedAt?: string;
  defaultPageId?: string;
  defaultPageName?: string;
  pageAccessStatus?: PageAccessStatus;
  clientBackgroundBrief?: string;
}

export type PageAccessStatus = "ok" | "missing_permissions" | "no_pages" | "token_error";

export interface MetaPageOption {
  pageId: string;
  pageName: string;
}

export type AccountVertical = "LEAD_GEN" | "ECOMMERCE" | "APP_INSTALLS";

export type DashboardMetricKey =
  | "spend"
  | "leads"
  | "cpl"
  | "ctr"
  | "cpm"
  | "purchases"
  | "cpa"
  | "roas"
  | "installs"
  | "cpi";

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
  structured?: MetaDiagnosisReport | Record<string, unknown> | null;
  engineVersion?: string;
  policyChecks?: Array<Record<string, unknown>>;
  alignment?: Record<string, unknown>;
  generatedAt: string;
  expiresAt: string;
}

export type AnalysisType =
  | "daily_summary"
  | "budget_optimization"
  | "creative_recommendations"
  | "creative_copy"
  | "meta_diagnosis";

export interface MetaDiagnosisFinding {
  statement: string;
  evidence: string;
  impact?: string;
}

export interface MetaDiagnosisHypothesis {
  breakdownType?: string;
  hypothesis: string;
  evidence?: string;
  testPlan?: string;
}

export interface MetaDiagnosisExperiment {
  hypothesis: string;
  action: string;
  validationWindow?: string;
  expectedImpact?: string;
}

export interface MetaDiagnosisAlignment {
  checkedAgainstOfficialRecommendations: boolean;
  officialCount: number;
  requiresDivergenceReason: boolean;
  divergenceReason?: string;
}

export interface MetaDiagnosisReport {
  engineVersion: string;
  generatedAt: string;
  language: string;
  evaluationLevel: string;
  aggregateFindings: MetaDiagnosisFinding[];
  breakdownHypotheses: MetaDiagnosisHypothesis[];
  recommendationExperiments: MetaDiagnosisExperiment[];
  alignment: MetaDiagnosisAlignment;
  policyChecks: Array<Record<string, unknown>>;
}

export type RecommendationType =
  | "budget_optimization"
  | "audience_optimization"
  | "audience_discovery"
  | "targeting_optimization"
  | "creative_optimization"
  | "ab_test"
  | "campaign_build"
  | "monitor_launch"
  | "ghost_draft"
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

export type BatchType =
  | "MORNING_BRIEF"
  | "EVENING_CHECK"
  | "LAUNCH_WATCH"
  | "GHOST_DRAFT"
  | "PROACTIVE_DRAFT"
  | "";

export interface TasksResponse {
  greeting: string;
  total: number;
  tasks: Recommendation[];
  groups: {
    morning: Recommendation[];
    evening: Recommendation[];
    other: Recommendation[];
  };
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  status: RecommendationStatus;
  priority: RecommendationPriority;
  batchType?: BatchType;
  accountId?: string;
  accountName?: string;
  /** Pre-generated image variations from Nano Banana (Imagen 3). Present on CREATIVE_REFRESH tasks. */
  nanoBananaImages?: string[];
  nanoBananaGeneratedAt?: string;
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
    action?: "adjust_budget" | "set_status" | "clone_adset_ab_test" | "none";
    targetLevel?: "campaign" | "adset" | "ad" | "account";
    targetId?: string;
    deltaPct?: number;
    desiredStatus?: "active" | "paused";
    variableToChange?: string;
    variantSettings?: Record<string, unknown>;
    recommendedTestBudget?: number;
  };
  metadata?: {
    draftId?: string;
    watchWindowHours?: number;
    opportunityTheme?: string;
  };
  suggestedContent?: {
    creativeCopy?: string;
    campaignPlan?: { name?: string; objective?: string; targeting?: string };
    audienceSuggestions?: string[];
    testSetup?: {
      controlAdsetId?: string;
      variableToChange?: string;
      variantSettings?: Record<string, unknown>;
      recommendedTestBudget?: number;
    };
    abTest?: {
      control?: Record<string, unknown>;
      variant?: Record<string, unknown>;
    };
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

export interface CampaignBuilderInputs {
  objective: string;
  offer: string;
  country: string;
  language: string;
  dailyBudget: number;
  campaignName: string;
  pageId?: string;
  destinationUrl?: string;
  brandVoice?: string;
  clientBackgroundBrief?: string;
}

export type DraftBlockType =
  | "STRATEGY"
  | "AUDIENCE"
  | "CREATIVE"
  | "REASONING"
  | "campaignPlan"
  | "audiencePlan"
  | "creativePlan"
  | "reasoning";

export interface GenerateDraftRequest {
  accountId: string;
  objective: "lead" | "sales" | string;
  offerProduct: string;
  targetGeo: string;
  budget: number;
  language: string;
  campaignName?: string;
  pageId?: string;
  destinationUrl?: string;
  clientBackgroundBrief?: string;
}

export interface CampaignPlanBlock {
  name: string;
  objective: string;
  buyingType: string;
  budgetType: string;
  dailyBudget: number;
}

export interface AudiencePlanBlock {
  name?: string;
  geo: { countries: string[] };
  ageRange: { min: number; max: number };
  genders: string[];
  interests: string[];
  lookalikeHints: string[];
}

export interface CreativePlanBlock {
  angles: string[];
  primaryTexts: string[];
  headlines: string[];
  cta: string;
}

export interface ImageConceptsBlock {
  creative_concept_reasoning: string;
  image_generation_prompts: string[];
  imageUrls: string[];
  imageGenerationError?: string;
}

export interface CampaignDraftBlocks {
  campaignPlan: CampaignPlanBlock;
  audiencePlan: AudiencePlanBlock;
  creativePlan: CreativePlanBlock;
  imageConcepts?: ImageConceptsBlock;
  reasoning: string;
}

export interface BenchmarkSnapshot {
  selectedAccount: {
    kpi: {
      roas: number;
      avgCTR: number;
      avgCPM: number;
    };
  };
  peerBenchmark: {
    accountsCompared: number;
    medianRoas: number;
    medianCTR: number;
    medianCPM: number;
  };
}

export interface DraftValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DraftSafety {
  safetyStatus: "passed" | "blocked";
  warnings: string[];
  errors: string[];
  requiresExplicitConfirm: boolean;
  budgetCheck: {
    avgDailyBudget: number;
    proposedDailyBudget: number;
    threshold: number;
    isOver10x: boolean;
  };
}

export interface CampaignDraft {
  id: string;
  accountId: string;
  userId: string;
  origin: "manual" | "ghost";
  opportunityTheme?: string;
  inputs: CampaignBuilderInputs;
  blocks: CampaignDraftBlocks;
  benchmarkSnapshot: BenchmarkSnapshot;
  validation: DraftValidation;
  safety?: DraftSafety;
  status: "draft" | "ready_for_publish" | "published";
  publishedMetaIds?: {
    campaignId?: string;
    adsetId?: string;
    adIds?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface PublishDraftResult {
  campaignId: string;
  adsetId: string;
  adIds: string[];
  watchCardId: string;
  warnings: string[];
}

export interface RecommendationModifications {
  deltaPct?: number;
  desiredStatus?: "active" | "paused";
  creativeCopy?: string;
  audienceSuggestions?: string[];
  recommendedTestBudget?: number;
  variantSettings?: Record<string, unknown>;
  testSetup?: Record<string, unknown>;
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
  action?: "adjust_budget" | "set_status" | "clone_adset_ab_test";
  targetLevel?: "campaign" | "adset" | "ad" | "account";
  targetId?: string;
  deltaPct?: number;
  currentBudget?: number;
  newBudget?: number;
  diffBudget?: number;
  currentStatus?: string;
  desiredStatus?: string;
  controlAdsetId?: string;
  recommendedTestBudget?: number;
  variableToChange?: string;
  variantSettings?: Record<string, unknown>;
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
