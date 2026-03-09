import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
  Zap,
  BarChart3,
  Palette,
  Copy,
  Target,
  TestTube,
  Megaphone,
  Users,
  FileText,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useAccounts } from "../contexts/AccountContext";
import {
  useGenerateRecommendations,
  useExecuteRecommendation,
  useExecutePreview,
  useRecommendationPolicy,
  useRecommendationExecutions,
  useRollbackPreview,
  useRollbackRecommendation,
  useRecommendations,
  useReviewRecommendation,
} from "../hooks/useRecommendations";
import { useAIInsights, useTriggerAIAnalysis } from "../hooks/useAIAnalysis";
import type {
  AnalysisType,
  MetaDiagnosisReport,
  Recommendation,
  RecommendationStatus,
  RecommendationType,
} from "../types";

const TYPE_LABELS: Record<RecommendationType, string> = {
  budget_optimization: "תקציב",
  audience_optimization: "קהל",
  audience_discovery: "גילוי קהלים",
  targeting_optimization: "אופטימיזציית טרגוט",
  creative_optimization: "קריאייטיב",
  ab_test: "טסט A/B",
  campaign_build: "קמפיין חדש",
  monitor_launch: "מעקב השקה",
  ghost_draft: "טיוטת Ghost",
  audience_build: "קהל חדש",
  creative_copy: "קופי מודעה",
};

const TYPE_ICONS: Record<RecommendationType, React.ElementType> = {
  budget_optimization: BarChart3,
  audience_optimization: Users,
  audience_discovery: Users,
  targeting_optimization: Target,
  creative_optimization: Palette,
  ab_test: TestTube,
  campaign_build: Megaphone,
  monitor_launch: Sparkles,
  ghost_draft: Megaphone,
  audience_build: Target,
  creative_copy: FileText,
};

const PRIORITY_STYLES = {
  high: "bg-rose-50 text-rose-700 border border-rose-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-[var(--bg-soft-2)] text-[var(--text-secondary)] border border-[var(--line)]",
} as const;

type TabId = "tasks" | "analysis" | "policy";

const STATUS_FILTER_LABELS: Record<RecommendationStatus | "all", string> = {
  all: "הכל",
  pending: "ממתין",
  approved: "אושר",
  rejected: "נדחה",
  executed: "בוצע",
  failed: "נכשל",
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function extractMetaDiagnosisReport(
  payload: unknown
): MetaDiagnosisReport | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (
    !Array.isArray(data.aggregateFindings) ||
    !Array.isArray(data.breakdownHypotheses) ||
    !Array.isArray(data.recommendationExperiments)
  ) {
    return null;
  }
  return data as unknown as MetaDiagnosisReport;
}

export default function AIInsights() {
  const { selectedAccountId, accounts } = useAccounts();
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<RecommendationType | "all">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [rollbackPreviewId, setRollbackPreviewId] = useState<string | null>(null);
  const [executePreviewId, setExecutePreviewId] = useState<string | null>(null);
  const [draftMinConfidence, setDraftMinConfidence] = useState(0.65);
  const [draftMaxBudgetDelta, setDraftMaxBudgetDelta] = useState(30);
  const [draftAllowExecute, setDraftAllowExecute] = useState(true);
  const [draftAllowRollback, setDraftAllowRollback] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisStructured, setAnalysisStructured] = useState<MetaDiagnosisReport | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const accountId = selectedAccountId ?? accounts[0]?.id;

  const recommendationsQuery = useRecommendations({
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 100,
  });
  const generateMutation = useGenerateRecommendations();
  const reviewMutation = useReviewRecommendation();
  const executeMutation = useExecuteRecommendation();
  const rollbackMutation = useRollbackRecommendation();
  const policyQuery = useRecommendationPolicy();
  const insightsQuery = useAIInsights();
  const triggerAnalysisMutation = useTriggerAIAnalysis();
  const executionsQuery = useRecommendationExecutions(
    expandedHistoryId ?? undefined,
    expandedHistoryId !== null
  );
  const executePreviewQuery = useExecutePreview(
    executePreviewId ?? undefined,
    executePreviewId !== null
  );
  const rollbackPreviewQuery = useRollbackPreview(
    rollbackPreviewId ?? undefined,
    rollbackPreviewId !== null
  );

  const policyBusy = policyQuery.saveMutation.isPending;
  const policyData = policyQuery.data;

  const syncPolicyDraftFromServer = () => {
    if (!policyData) return;
    setDraftMinConfidence(policyData.minConfidenceToExecute);
    setDraftMaxBudgetDelta(policyData.maxBudgetDeltaPct);
    setDraftAllowExecute(policyData.allowExecute);
    setDraftAllowRollback(policyData.allowRollback);
  };

  useEffect(() => {
    if (policyData) syncPolicyDraftFromServer();
  }, [policyData]);

  const recommendations = recommendationsQuery.data ?? [];
  const pendingTasks = recommendations.filter((r) => r.status === "pending");
  const approvedTasks = recommendations.filter((r) => r.status === "approved");
  const executableCount = approvedTasks.filter(
    (r) => r.executionPlan?.action && r.executionPlan.action !== "none"
  ).length;

  const stats = useMemo(() => {
    const pending = recommendations.filter((r) => r.status === "pending").length;
    const approved = recommendations.filter((r) => r.status === "approved").length;
    const rejected = recommendations.filter((r) => r.status === "rejected").length;
    const executed = recommendations.filter((r) => r.status === "executed").length;
    const failed = recommendations.filter((r) => r.status === "failed").length;
    return { pending, approved, rejected, executed, failed };
  }, [recommendations]);

  const isLoading = recommendationsQuery.isLoading;
  const busy =
    generateMutation.isPending ||
    reviewMutation.isPending ||
    executeMutation.isPending ||
    rollbackMutation.isPending;

  const handleApproveAndExecute = async (rec: Recommendation) => {
    if (!accountId) return;
    const canExecute = rec.executionPlan?.action && rec.executionPlan.action !== "none";
    await reviewMutation.mutateAsync({
      recommendationId: rec.id,
      decision: "approve",
    });
    if (canExecute) {
      await executeMutation.mutateAsync({ recommendationId: rec.id });
    }
  };

  const handleApproveAllHigh = async () => {
    const high = pendingTasks.filter(
      (r) => r.priority === "high" && r.confidence >= (policyData?.minConfidenceToExecute ?? 0.65)
    );
    for (const rec of high) {
      await handleApproveAndExecute(rec);
    }
  };

  const handleRunAnalysis = async (
    type: AnalysisType,
    options?: { campaignName?: string; objective?: string; language?: string }
  ) => {
    try {
      const res = await triggerAnalysisMutation.mutateAsync({ type, ...options });
      setAnalysisStructured(null);
      if (type === "creative_copy" && res.copyVariations?.length) {
        setAnalysisResult(
          res.copyVariations
            .map((v: { text: string; hook?: string }) => `• ${v.text}${v.hook ? ` [${v.hook}]` : ""}`)
            .join("\n\n")
        );
      } else if (type === "meta_diagnosis") {
        const structured = extractMetaDiagnosisReport(res.structured);
        if (structured) {
          setAnalysisStructured(structured);
        }
        if (res.content) {
          setAnalysisResult(res.content);
        }
      } else if (res.content) {
        setAnalysisResult(res.content);
      }
    } catch {
      setAnalysisStructured(null);
      setAnalysisResult("הניתוח נכשל, נסה שוב בעוד רגע.");
    }
  };

  const handleCopy = (id: string, text: string) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "tasks", label: "משימות", icon: Zap },
    { id: "analysis", label: "ניתוח", icon: Brain },
    { id: "policy", label: "מדיניות", icon: Settings2 },
  ];

  return (
    <div className="space-y-6 reveal-up">
      {/* Header */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)]">
                <Brain className="h-5 w-5 text-[#062035]" />
              </div>
              <div>
                <p className="section-kicker">AI Ops</p>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">מרכז ניהול המלצות AI</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  סקירה, אישור וביצוע המלצות אוטומטיות לכל החשבונות.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={busy || !accountId}
            className="btn-primary flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending ? "מייצר..." : "יצירת המלצות"}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--bg-soft-2)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <>
          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <StatBadge label="ממתינות" value={stats.pending} color="amber" />
              <StatBadge label="מאושרות" value={stats.approved} color="blue" />
              <StatBadge label="בוצעו" value={stats.executed} color="emerald" />
              {executableCount > 0 && (
                <StatBadge label="מוכן לביצוע" value={executableCount} color="indigo" />
              )}
            </div>
            {pendingTasks.filter((r) => r.priority === "high").length > 0 && (
              <button
                onClick={handleApproveAllHigh}
                disabled={busy}
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/12 px-4 py-2 text-sm font-medium text-emerald-200 disabled:opacity-50 transition-colors"
              >
                אישור מהיר לכל הדחופות
              </button>
            )}
          </div>

          {/* Filters — Status */}
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "approved", "rejected", "executed", "failed"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === status
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-slate-300"
                }`}
              >
                {STATUS_FILTER_LABELS[status]}
              </button>
            ))}
          </div>

          {/* Filters — Type */}
          <div className="flex flex-wrap gap-2">
            {(["all", "budget_optimization", "audience_optimization", "audience_discovery", "targeting_optimization", "creative_optimization", "ab_test", "campaign_build", "audience_build", "creative_copy"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === type
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-slate-300"
                }`}
              >
                {type === "all" ? "כל הסוגים" : TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Task cards */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-8 text-center shadow-sm text-[var(--text-muted)]">
                טוען משימות...
              </div>
            ) : recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] py-16 shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)]">
                  <Brain className="h-8 w-8 text-[var(--accent)]" />
                </div>
                <p className="text-base font-semibold text-[var(--text-primary)]">אין משימות פתוחות כרגע</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  לחץ על "יצירת המלצות" כדי להפעיל ניתוח חדש.
                </p>
              </div>
            ) : (
              recommendations.map((rec) => (
                <TaskCardFull
                  key={rec.id}
                  rec={rec}
                  busy={busy}
                  onApprove={() =>
                    reviewMutation.mutate({ recommendationId: rec.id, decision: "approve" })
                  }
                  onReject={() =>
                    reviewMutation.mutate({ recommendationId: rec.id, decision: "reject" })
                  }
                  onApproveAndExecute={() => handleApproveAndExecute(rec)}
                  onExecute={() => executeMutation.mutate({ recommendationId: rec.id })}
                  onRollback={() => rollbackMutation.mutate({ recommendationId: rec.id })}
                  executePreviewId={executePreviewId}
                  setExecutePreviewId={setExecutePreviewId}
                  rollbackPreviewId={rollbackPreviewId}
                  setRollbackPreviewId={setRollbackPreviewId}
                  expandedHistoryId={expandedHistoryId}
                  setExpandedHistoryId={setExpandedHistoryId}
                  executePreviewQuery={executePreviewQuery}
                  rollbackPreviewQuery={rollbackPreviewQuery}
                  executionsQuery={executionsQuery}
                  policyData={policyData}
                  onCopy={(text) => handleCopy(rec.id, text)}
                  copiedId={copiedId}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Analysis Tab */}
      {activeTab === "analysis" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <AnalysisCard
              icon={BarChart3}
              title="סיכום יומי"
              desc="סקירה מהירה של ביצועי היום"
              color="blue"
              onRun={() => handleRunAnalysis("daily_summary")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={BarChart3}
              title="אופטימיזציית תקציב"
              desc="המלצות חלוקה וסקייל"
              color="emerald"
              onRun={() => handleRunAnalysis("budget_optimization")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={Sparkles}
              title="המלצות קריאייטיב"
              desc="זיהוי עייפות והצעות שיפור"
              color="violet"
              onRun={() => handleRunAnalysis("creative_recommendations")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={FileText}
              title="מחולל קופי"
              desc="וריאציות מודעה אוטומטיות"
              color="amber"
              onRun={() => handleRunAnalysis("creative_copy")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={Brain}
              title="אבחון Meta"
              desc="דיאגנוזה מפורטת ותכנית ניסויים"
              color="indigo"
              onRun={() => handleRunAnalysis("meta_diagnosis", { language: "he" })}
              loading={triggerAnalysisMutation.isPending}
            />
          </div>

          {(analysisResult || analysisStructured) && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">תוצאת ניתוח</h3>
                <button
                  onClick={() => copyToClipboard(analysisResult ?? "")}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
                >
                  <Copy className="h-3 w-3" />
                  העתקה
                </button>
              </div>
              {analysisStructured ? (
                <MetaDiagnosisView report={analysisStructured} fallbackText={analysisResult} />
              ) : (
                <div className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--text-primary)] leading-relaxed">
                  {analysisResult}
                </div>
              )}
            </div>
          )}

          {insightsQuery.data && insightsQuery.data.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">ניתוחים אחרונים</h3>
              <div className="space-y-2">
                {insightsQuery.data.slice(0, 5).map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3"
                  >
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {insight.insightType} · {new Date(insight.generatedAt).toLocaleString("he-IL")}
                    </span>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">{insight.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Policy Tab */}
      {activeTab === "policy" && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">מדיניות ביצוע</h3>
          <p className="mb-5 text-xs text-[var(--text-muted)]">
            קבע מתי המערכת יכולה לבצע המלצות אוטומטית.
          </p>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                מינימום ביטחון לביצוע אוטומטי
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={draftMinConfidence}
                  onChange={(e) => setDraftMinConfidence(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <span className="w-12 text-right text-sm font-semibold text-indigo-700 tabular-nums">
                  {Math.round(draftMinConfidence * 100)}%
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                שינוי תקציב מקסימלי לפעולה (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={draftMaxBudgetDelta}
                  onChange={(e) => setDraftMaxBudgetDelta(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <span className="w-12 text-right text-sm font-semibold text-indigo-700 tabular-nums">
                  {draftMaxBudgetDelta}%
                </span>
              </div>
            </div>

            <ToggleRow
              label="לאפשר ביצוע אוטומטי"
              description="המערכת תוכל לבצע המלצות שאושרו"
              checked={draftAllowExecute}
              onChange={setDraftAllowExecute}
            />
            <ToggleRow
              label="לאפשר Rollback"
              description="אפשרות לבטל פעולות שבוצעו"
              checked={draftAllowRollback}
              onChange={setDraftAllowRollback}
            />
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() =>
                policyQuery.saveMutation.mutate({
                  allowExecute: draftAllowExecute,
                  allowRollback: draftAllowRollback,
                  minConfidenceToExecute: draftMinConfidence,
                  maxBudgetDeltaPct: draftMaxBudgetDelta,
                })
              }
              disabled={policyBusy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {policyBusy ? "שומר..." : "שמירת מדיניות"}
            </button>
            <button
              onClick={syncPolicyDraftFromServer}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] transition-colors"
            >
              איפוס
            </button>
          </div>
        </div>
      )}

      {/* Toast messages */}
      <ToastMessages
        generateMutation={generateMutation}
        reviewMutation={reviewMutation}
        executeMutation={executeMutation}
        rollbackMutation={rollbackMutation}
      />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────── */

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "amber" | "blue" | "emerald" | "indigo";
}) {
  const colorMap = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <div className={`rounded-lg border px-4 py-2 ${colorMap[color]}`}>
      <span className="text-xs">{label}</span>
      <span className="ml-2 text-lg font-bold">{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--bg-elevated)] shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function AnalysisCard({
  icon: Icon,
  title,
  desc,
  color,
  onRun,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: "blue" | "emerald" | "violet" | "amber" | "indigo";
  onRun: () => void;
  loading: boolean;
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", btn: "bg-blue-600 hover:bg-blue-700" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700" },
    violet: { bg: "bg-violet-50", icon: "text-violet-600", btn: "bg-violet-600 hover:bg-violet-700" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", btn: "bg-amber-600 hover:bg-amber-700" },
    indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", btn: "bg-indigo-600 hover:bg-indigo-700" },
  };
  const c = colorMap[color];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-sm transition-colors hover:border-slate-300">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${c.bg}`}>
        <Icon className={`h-5 w-5 ${c.icon}`} />
      </div>
      <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{desc}</p>
      <button
        onClick={onRun}
        disabled={loading}
        className={`mt-4 rounded-lg px-3 py-1.5 text-xs font-medium text-white ${c.btn} disabled:opacity-50 transition-colors`}
      >
        {loading ? "מריץ..." : "הרצת ניתוח"}
      </button>
    </div>
  );
}

function MetaDiagnosisView({
  report,
  fallbackText,
}: {
  report: MetaDiagnosisReport;
  fallbackText: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Evaluation Level:</span> {report.evaluationLevel}
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Engine:</span> {report.engineVersion}
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Official Count:</span> {report.alignment?.officialCount ?? 0}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Aggregate Findings</h4>
        <div className="space-y-2 text-sm text-[var(--text-primary)]">
          {report.aggregateFindings.map((item, idx) => (
            <div key={idx} className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2">
              <p className="font-medium text-[var(--text-primary)]">{item.statement}</p>
              <p className="text-xs text-[var(--text-muted)]">{item.evidence}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Breakdown Hypotheses</h4>
        <div className="space-y-2 text-sm text-[var(--text-primary)]">
          {report.breakdownHypotheses.map((item, idx) => (
            <div key={idx} className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2">
              <p className="font-medium text-[var(--text-primary)]">{item.hypothesis}</p>
              {item.testPlan && <p className="text-xs text-[var(--text-muted)]">Test: {item.testPlan}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recommendation Experiments</h4>
        <div className="space-y-2 text-sm text-[var(--text-primary)]">
          {report.recommendationExperiments.map((item, idx) => (
            <div key={idx} className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2">
              <p className="font-medium text-[var(--text-primary)]">{item.hypothesis}</p>
              <p className="text-xs text-[var(--text-secondary)]">פעולה: {item.action}</p>
              {item.validationWindow && <p className="text-xs text-[var(--text-muted)]">Window: {item.validationWindow}</p>}
            </div>
          ))}
        </div>
      </div>

      {report.alignment?.divergenceReason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-semibold">Divergence reason:</span> {report.alignment.divergenceReason}
        </div>
      )}

      {fallbackText && (
        <details className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">Raw Text Output</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{fallbackText}</pre>
        </details>
      )}
    </div>
  );
}

function TaskCardFull({
  rec,
  busy,
  onApprove,
  onReject,
  onApproveAndExecute,
  onExecute,
  onRollback,
  executePreviewId,
  setExecutePreviewId,
  rollbackPreviewId,
  setRollbackPreviewId,
  expandedHistoryId,
  setExpandedHistoryId,
  executePreviewQuery,
  rollbackPreviewQuery,
  executionsQuery,
  policyData,
  onCopy,
  copiedId,
}: {
  rec: Recommendation;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onApproveAndExecute: () => void;
  onExecute: () => void;
  onRollback: () => void;
  setExecutePreviewId: (id: string | null) => void;
  setRollbackPreviewId: (id: string | null) => void;
  executePreviewId: string | null;
  rollbackPreviewId: string | null;
  expandedHistoryId: string | null;
  setExpandedHistoryId: (id: string | null) => void;
  executePreviewQuery: { data?: any; isLoading: boolean };
  rollbackPreviewQuery: { data?: any; isLoading: boolean };
  executionsQuery: { data?: any[]; isLoading: boolean };
  policyData?: { minConfidenceToExecute?: number };
  onCopy: (text: string) => void;
  copiedId: string | null;
}) {
  const TypeIcon = TYPE_ICONS[rec.type] ?? Brain;
  const canExecute = rec.executionPlan?.action && rec.executionPlan.action !== "none";
  const showApproveAndExecute =
    rec.status === "pending" &&
    canExecute &&
    rec.confidence >= (policyData?.minConfidenceToExecute ?? 0.65);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-2">
            <TypeIcon className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {TYPE_LABELS[rec.type]}
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[rec.priority]}`}>
                {rec.priority}
              </span>
              <span className="rounded-md bg-[var(--bg-soft-2)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {rec.status}
              </span>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{rec.title}</h3>
            <p className="text-sm text-[var(--text-secondary)]">{rec.why || rec.reasoning}</p>
          </div>
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {new Date(rec.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
          </div>
          <div className="mt-1">ביטחון: {(rec.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Suggested content */}
      {rec.suggestedContent && (
        <div className="mt-4 space-y-3">
          {rec.suggestedContent.creativeCopy && (
            <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-500">
                קופי מוצע
              </p>
              <p className="text-sm text-violet-900">&ldquo;{rec.suggestedContent.creativeCopy}&rdquo;</p>
              <button
                onClick={() => onCopy(rec.suggestedContent!.creativeCopy!)}
                className="mt-2 flex items-center gap-1 rounded-md border border-violet-200 bg-[var(--bg-elevated)] px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
              >
                <Copy className="h-3 w-3" />
                {copiedId === rec.id ? "הועתק" : "העתק"}
              </button>
            </div>
          )}
          {rec.suggestedContent.audienceSuggestions && rec.suggestedContent.audienceSuggestions.length > 0 && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                הצעות קהל
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rec.suggestedContent.audienceSuggestions.map((s, i) => (
                  <span key={i} className="rounded-full border border-blue-200 bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-blue-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {rec.expectedImpact?.summary && (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <span className="font-medium">השפעה צפויה: </span>
          {rec.expectedImpact.summary}
        </div>
      )}

      {/* Actions */}
      {rec.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {showApproveAndExecute ? (
            <button
              onClick={onApproveAndExecute}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              אישור וביצוע
            </button>
          ) : (
            <button
              onClick={onApprove}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              אישור
            </button>
          )}
          <button
            onClick={onReject}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-60 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            דחייה
          </button>
        </div>
      )}

      {rec.status === "approved" && canExecute && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setExecutePreviewId(executePreviewId === rec.id ? null : rec.id)}
            disabled={busy}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            {executePreviewId === rec.id ? "הסתרת תצוגה" : "תצוגת ביצוע"}
          </button>
          <button
            onClick={onExecute}
            disabled={busy || executePreviewId !== rec.id}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            ביצוע
          </button>
        </div>
      )}

      {executePreviewId === rec.id && executePreviewQuery.data && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
          {executePreviewQuery.data.canExecute ? (
            executePreviewQuery.data.action === "adjust_budget" ? (
              <p>תקציב: ${executePreviewQuery.data.currentBudget} → ${executePreviewQuery.data.newBudget}</p>
            ) : (
              <p>סטטוס: {executePreviewQuery.data.currentStatus} → {executePreviewQuery.data.desiredStatus}</p>
            )
          ) : (
            <p>לא ניתן לבצע: {executePreviewQuery.data.reason}</p>
          )}
        </div>
      )}

      {rec.status === "failed" && rec.execution?.error && (
        <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {rec.execution.error}
        </div>
      )}

      {(rec.status === "executed" || rec.status === "failed") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {rec.status === "executed" && (
            <>
              <button
                onClick={() => setRollbackPreviewId(rollbackPreviewId === rec.id ? null : rec.id)}
                disabled={busy}
                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                {rollbackPreviewId === rec.id ? "הסתרת Rollback" : "תצוגת Rollback"}
              </button>
              <button
                onClick={onRollback}
                disabled={busy || !rollbackPreviewQuery.data?.canRollback}
                className="rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                Rollback
              </button>
            </>
          )}
          <button
            onClick={() => setExpandedHistoryId(expandedHistoryId === rec.id ? null : rec.id)}
            className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] transition-colors"
          >
            {expandedHistoryId === rec.id ? (
              <><ChevronUp className="inline h-3 w-3" /> הסתר היסטוריה</>
            ) : (
              <><ChevronDown className="inline h-3 w-3" /> היסטוריית ביצוע</>
            )}
          </button>
        </div>
      )}

      {expandedHistoryId === rec.id && executionsQuery.data && executionsQuery.data.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text-primary)]">
          {executionsQuery.data.map((exe) => (
            <div key={exe.id} className="rounded border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-2 mb-1 last:mb-0">
              <span className="font-medium">{exe.status}</span>
              <span className="ml-2 text-[var(--text-muted)]">
                {exe.requestedAt ? new Date(exe.requestedAt).toLocaleString("he-IL") : ""}
              </span>
              {exe.action && <p className="mt-1 text-[var(--text-secondary)]">פעולה: {exe.action}</p>}
              {exe.error && <p className="text-rose-600">שגיאה: {exe.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToastMessages({
  generateMutation,
  reviewMutation,
  executeMutation,
  rollbackMutation,
}: {
  generateMutation: any;
  reviewMutation: any;
  executeMutation: any;
  rollbackMutation: any;
}) {
  return (
    <>
      {(generateMutation.isError || reviewMutation.isError || executeMutation.isError || rollbackMutation.isError) && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-rose-200 bg-[var(--bg-elevated)] px-4 py-3 text-sm text-rose-700 shadow-lg">
          {(generateMutation.error as Error)?.message ??
            (reviewMutation.error as Error)?.message ??
            (executeMutation.error as Error)?.message ??
            (rollbackMutation.error as Error)?.message ??
            "אירעה שגיאה"}
        </div>
      )}
      {generateMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-emerald-200 bg-[var(--bg-elevated)] px-4 py-3 text-sm text-emerald-700 shadow-lg">
          ✓ ההמלצות נוצרו בהצלחה.
        </div>
      )}
      {reviewMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-emerald-200 bg-[var(--bg-elevated)] px-4 py-3 text-sm text-emerald-700 shadow-lg">
          ✓ הסטטוס עודכן.
        </div>
      )}
      {executeMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-emerald-200 bg-[var(--bg-elevated)] px-4 py-3 text-sm text-emerald-700 shadow-lg">
          ✓ הפעולה בוצעה בהצלחה.
        </div>
      )}
      {rollbackMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-emerald-200 bg-[var(--bg-elevated)] px-4 py-3 text-sm text-emerald-700 shadow-lg">
          ✓ ה-Rollback הושלם.
        </div>
      )}
    </>
  );
}
