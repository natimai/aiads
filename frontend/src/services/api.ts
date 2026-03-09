import { auth } from "./firebase";
import type {
  MetaAccount,
  Campaign,
  InsightData,
  Alert,
  AlertConfig,
  AIInsight,
  AnalysisType,
  MetaDiagnosisReport,
  Recommendation,
  ExecutePreview,
  RecommendationExecution,
  RecommendationPolicy,
  RollbackPreview,
  RecommendationStatus,
  RecommendationType,
  Report,
  ReportConfig,
  TasksResponse,
  CampaignBuilderInputs,
  DraftBlockType,
  GenerateDraftRequest,
  CampaignDraft,
  DraftSafety,
  PublishDraftResult,
} from "../types";
import { normalizeCurrencyCode } from "../utils/format";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = `HTTP ${response.status}`;
    const looksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(raw);

    if (looksLikeHtml && [502, 503, 504].includes(response.status)) {
      message =
        "AI draft service is temporarily unavailable (gateway error). Please retry in 30-60 seconds.";
      throw new ApiError(message, response.status);
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) {
          message = parsed.error;
        } else {
          message = raw.slice(0, 280);
        }
      } catch {
        message = looksLikeHtml ? `Gateway error (HTTP ${response.status})` : raw.slice(0, 280);
      }
    }
    throw new ApiError(message || "Request failed", response.status);
  }

  return response.json();
}

// ---------- Accounts ----------

export async function getAccounts(): Promise<MetaAccount[]> {
  const data = await apiFetch<{ accounts: MetaAccount[] }>("/api/accounts");
  return data.accounts.map((account) => {
    const accountWithFallback = account as MetaAccount & Record<string, unknown>;
    return {
      ...account,
      currency: normalizeCurrencyCode(
        String(
          accountWithFallback.currency ??
          accountWithFallback.currencyCode ??
          accountWithFallback.accountCurrency ??
          accountWithFallback.account_currency ??
          "USD"
        )
      ),
    };
  });
}

export async function connectAccount(redirectUri?: string): Promise<{ authUrl: string }> {
  return apiFetch("/api/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ redirectUri }),
  });
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await apiFetch(`/api/accounts/${accountId}`, { method: "DELETE" });
}

export async function toggleManagedAccount(
  accountId: string,
  isManagedByPlatform: boolean
): Promise<{ success: boolean; isManagedByPlatform: boolean }> {
  return apiFetch(`/api/accounts/${accountId}/managed`, {
    method: "POST",
    body: JSON.stringify({ isManagedByPlatform }),
  });
}

// ---------- Campaigns ----------

export async function getCampaigns(
  accountId?: string,
  _expand = false
): Promise<Campaign[]> {
  const params = _expand ? "?expand=true" : "";
  const path = accountId
    ? `/api/campaigns/${accountId}${params}`
    : `/api/campaigns${params}`;
  const data = await apiFetch<{ campaigns: Campaign[] }>(path);
  return data.campaigns;
}

export async function getInsights(
  accountId: string,
  dateFrom: string,
  dateTo: string,
  campaignId?: string
): Promise<InsightData[]> {
  let path = `/api/insights/${accountId}?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  if (campaignId) path += `&campaignId=${campaignId}`;
  const data = await apiFetch<{ insights: InsightData[] }>(path);
  return data.insights;
}

export async function campaignAction(
  accountId: string,
  campaignId: string,
  action: "pause" | "resume"
): Promise<void> {
  await apiFetch(`/api/campaigns/${accountId}/action/${campaignId}/${action}`, {
    method: "POST",
  });
}

// ---------- Alerts ----------

export async function getAlerts(params?: {
  accountId?: string;
  type?: string;
  severity?: string;
  limit?: number;
}): Promise<Alert[]> {
  const searchParams = new URLSearchParams();
  if (params?.accountId) searchParams.set("accountId", params.accountId);
  if (params?.type) searchParams.set("type", params.type);
  if (params?.severity) searchParams.set("severity", params.severity);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  const qs = searchParams.toString();
  const data = await apiFetch<{ alerts: Alert[] }>(`/api/alerts${qs ? `?${qs}` : ""}`);
  return data.alerts;
}

export async function acknowledgeAlert(accountId: string, alertId: string): Promise<void> {
  await apiFetch(`/api/alerts/${accountId}/${alertId}/acknowledge`, {
    method: "PUT",
  });
}

export async function getAlertConfigs(): Promise<AlertConfig[]> {
  const data = await apiFetch<{ configs: AlertConfig[] }>("/api/alerts/config");
  return data.configs;
}

export async function saveAlertConfig(config: Partial<AlertConfig>): Promise<string> {
  const data = await apiFetch<{ id: string }>("/api/alerts/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return data.id;
}

export async function deleteAlertConfig(configId: string): Promise<void> {
  await apiFetch(`/api/alerts/config/${configId}`, { method: "DELETE" });
}

// ---------- AI Insights ----------

export async function getAIInsights(accountId: string): Promise<AIInsight[]> {
  const data = await apiFetch<{ insights: AIInsight[] }>(`/api/ai/insights/${accountId}`);
  return data.insights;
}

export async function triggerAIAnalysis(
  accountId: string,
  type: AnalysisType,
  options?: { campaignName?: string; objective?: string; language?: string }
): Promise<{
  id?: string;
  content?: string;
  structured?: MetaDiagnosisReport | Record<string, unknown> | null;
  policyChecks?: Array<Record<string, unknown>>;
  alignment?: Record<string, unknown>;
  engineVersion?: string;
  copyVariations?: Array<{ text: string; hook?: string }>;
  generatedAt: string;
}> {
  return apiFetch("/api/ai/analyze", {
    method: "POST",
    body: JSON.stringify({ accountId, type, ...options }),
  });
}

// ---------- AI Campaign Builder ----------

export async function createCampaignDraft(
  request: GenerateDraftRequest
): Promise<{ draftId: string; draft: CampaignDraft }> {
  const objectiveRaw = String(request.objective || "sales").toLowerCase();
  const objective =
    objectiveRaw === "lead" || objectiveRaw === "leads" ? "OUTCOME_LEADS" : "OUTCOME_SALES";
  const payload = {
    accountId: request.accountId,
    objective,
    offer: request.offerProduct,
    targetGeo: request.targetGeo,
    budget: request.budget,
    language: request.language,
    campaignName: request.campaignName,
    pageId: request.pageId,
    destinationUrl: request.destinationUrl,
  };

  try {
    return await apiFetch("/api/ai/campaign-builder/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof ApiError && [502, 503, 504].includes(err.status)) {
      // One transparent retry for transient gateway failures.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return apiFetch("/api/ai/campaign-builder/drafts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    throw err;
  }
}

export async function getCampaignDraft(accountId: string, draftId: string): Promise<CampaignDraft> {
  const data = await apiFetch<{ draft: CampaignDraft }>(
    `/api/ai/campaign-builder/drafts/${draftId}?accountId=${accountId}`
  );
  return data.draft;
}

export async function regenerateCampaignDraftBlock(
  accountId: string,
  draftId: string,
  blockType: DraftBlockType,
  userInstructions?: string
): Promise<CampaignDraft> {
  const data = await apiFetch<{ draft: CampaignDraft }>(
    `/api/ai/campaign-builder/drafts/${draftId}/regenerate`,
    {
      method: "POST",
      body: JSON.stringify({ accountId, blockType, userInstructions }),
    }
  );
  return data.draft;
}

export async function updateCampaignDraftBlock(
  accountId: string,
  draftId: string,
  blockType: DraftBlockType,
  value: Record<string, unknown> | string
): Promise<CampaignDraft> {
  const data = await apiFetch<{ draft: CampaignDraft }>(
    `/api/ai/campaign-builder/drafts/${draftId}/update`,
    {
      method: "POST",
      body: JSON.stringify({ accountId, blockType, value }),
    }
  );
  return data.draft;
}

export async function regenerateCampaignDraftImages(
  accountId: string,
  draftId: string,
  userInstructions?: string
): Promise<CampaignDraft> {
  const data = await apiFetch<{ draft: CampaignDraft }>(
    `/api/ai/campaign-builder/drafts/${draftId}/regenerate-images`,
    {
      method: "POST",
      body: JSON.stringify({ accountId, userInstructions }),
    }
  );
  return data.draft;
}

export async function preflightCampaignDraft(
  accountId: string,
  draftId: string
): Promise<DraftSafety> {
  return apiFetch(`/api/ai/campaign-builder/drafts/${draftId}/preflight`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export async function publishCampaignDraft(
  accountId: string,
  draftId: string,
  confirmHighBudget = false
): Promise<PublishDraftResult> {
  return apiFetch(`/api/ai/campaign-builder/drafts/${draftId}/publish`, {
    method: "POST",
    body: JSON.stringify({ accountId, confirmHighBudget }),
  });
}

// ---------- Recommendations ----------

export async function getRecommendations(
  accountId: string,
  params?: {
    status?: RecommendationStatus;
    type?: RecommendationType;
    priority?: "high" | "medium" | "low";
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
): Promise<Recommendation[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.type) search.set("type", params.type);
  if (params?.priority) search.set("priority", params.priority);
  if (params?.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params?.dateTo) search.set("dateTo", params.dateTo);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();

  const data = await apiFetch<{ recommendations: Recommendation[] }>(
    `/api/recommendations/${accountId}${qs ? `?${qs}` : ""}`
  );
  return data.recommendations;
}

export async function generateRecommendations(
  accountId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ recommendationIds: string[]; generated: number }> {
  return apiFetch("/api/recommendations/generate", {
    method: "POST",
    body: JSON.stringify({ accountId, dateFrom, dateTo }),
  });
}

export async function approveRecommendation(
  accountId: string,
  recommendationId: string,
  reason = "",
  modifications?: Record<string, unknown>
): Promise<{ success: boolean; wasModified?: boolean }> {
  return apiFetch(`/api/recommendations/${recommendationId}/approve`, {
    method: "POST",
    body: JSON.stringify({ accountId, reason, ...(modifications ? { modifications } : {}) }),
  });
}

export async function rejectRecommendation(
  accountId: string,
  recommendationId: string,
  reason = ""
): Promise<void> {
  await apiFetch(`/api/recommendations/${recommendationId}/reject`, {
    method: "POST",
    body: JSON.stringify({ accountId, reason }),
  });
}

export async function executeRecommendation(
  accountId: string,
  recommendationId: string
): Promise<{ status: "executed"; result: Record<string, unknown> }> {
  return apiFetch(`/api/recommendations/${recommendationId}/execute`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export async function getRecommendationExecutions(
  accountId: string,
  recommendationId: string,
  limit = 20
): Promise<RecommendationExecution[]> {
  const data = await apiFetch<{ executions: RecommendationExecution[] }>(
    `/api/recommendations/${recommendationId}/executions?accountId=${accountId}&limit=${limit}`
  );
  return data.executions;
}

export async function rollbackRecommendation(
  accountId: string,
  recommendationId: string
): Promise<{ status: string; result: Record<string, unknown> }> {
  return apiFetch(`/api/recommendations/${recommendationId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export async function getRollbackPreview(
  accountId: string,
  recommendationId: string
): Promise<RollbackPreview> {
  const data = await apiFetch<{ preview: RollbackPreview }>(
    `/api/recommendations/${recommendationId}/rollback-preview?accountId=${accountId}`
  );
  return data.preview;
}

export async function getExecutePreview(
  accountId: string,
  recommendationId: string
): Promise<ExecutePreview> {
  const data = await apiFetch<{ preview: ExecutePreview }>(
    `/api/recommendations/${recommendationId}/execute-preview?accountId=${accountId}`
  );
  return data.preview;
}

export async function getRecommendationPolicy(accountId: string): Promise<RecommendationPolicy> {
  const data = await apiFetch<{ policy: RecommendationPolicy }>(
    `/api/recommendations/policy/${accountId}`
  );
  return data.policy;
}

export async function saveRecommendationPolicy(
  accountId: string,
  policy: Partial<RecommendationPolicy>
): Promise<RecommendationPolicy> {
  const data = await apiFetch<{ policy: RecommendationPolicy }>(
    `/api/recommendations/policy/${accountId}`,
    {
      method: "POST",
      body: JSON.stringify(policy),
    }
  );
  return data.policy;
}

// ---------- Reports ----------

export async function getReports(): Promise<Report[]> {
  const data = await apiFetch<{ reports: Report[] }>("/api/reports");
  return data.reports;
}

export async function generateReport(type: "daily" | "weekly"): Promise<{ id: string }> {
  return apiFetch("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

export async function getReportConfigs(): Promise<ReportConfig[]> {
  const data = await apiFetch<{ configs: ReportConfig[] }>("/api/reports/config");
  return data.configs;
}

export async function saveReportConfig(config: Partial<ReportConfig>): Promise<string> {
  const data = await apiFetch<{ id: string }>("/api/reports/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return data.id;
}

// ---------- Task Inbox ----------

export async function getTasks(params?: {
  status?: string;
  limit?: number;
}): Promise<TasksResponse> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return apiFetch<TasksResponse>(`/api/tasks${qs ? `?${qs}` : ""}`);
}

// ---------- Sync ----------

export async function syncAccount(accountId: string): Promise<{
  campaigns: number;
  insights: number;
  kpiSummary: Record<string, number>;
}> {
  return apiFetch(`/api/sync/${accountId}`, { method: "POST" });
}

export async function syncAllAccounts(): Promise<{
  synced: Array<{ accountId: string; accountName: string; campaigns?: number; insights?: number; error?: string }>;
  count: number;
}> {
  return apiFetch("/api/sync/all", { method: "POST" });
}
