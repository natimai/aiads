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
import type { Recommendation, RecommendationStatus, RecommendationType } from "../types";

const TYPE_LABELS: Record<RecommendationType, string> = {
  budget_optimization: "תקציב",
  audience_optimization: "קהל",
  creative_optimization: "קריאטיב",
  ab_test: "A/B Test",
  campaign_build: "בניית קמפיין",
  audience_build: "בניית קהל",
  creative_copy: "טקסט לקריאטיב",
};

const TYPE_ICONS: Record<RecommendationType, React.ElementType> = {
  budget_optimization: BarChart3,
  audience_optimization: Users,
  creative_optimization: Palette,
  ab_test: TestTube,
  campaign_build: Megaphone,
  audience_build: Target,
  creative_copy: FileText,
};

const PRIORITY_COLORS = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  low: "bg-slate-700/40 text-slate-300 border-slate-600/30",
} as const;

type TabId = "tasks" | "analysis" | "policy";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export default function AIInsights() {
  const { selectedAccountId, selectedAccount, accounts } = useAccounts();
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
    const high = pendingTasks.filter((r) => r.priority === "high" && r.confidence >= (policyData?.minConfidenceToExecute ?? 0.65));
    for (const rec of high) {
      await handleApproveAndExecute(rec);
    }
  };

  const handleRunAnalysis = async (
    type: "daily_summary" | "budget_optimization" | "creative_recommendations" | "creative_copy",
    options?: { campaignName?: string; objective?: string }
  ) => {
    try {
      const res = await triggerAnalysisMutation.mutateAsync({
        type,
        ...options,
      });
      if (type === "creative_copy" && res.copyVariations?.length) {
        setAnalysisResult(
          res.copyVariations.map((v: { text: string; hook?: string }) => `• ${v.text}${v.hook ? ` [${v.hook}]` : ""}`).join("\n\n")
        );
      } else if (res.content) {
        setAnalysisResult(res.content);
      }
    } catch {
      setAnalysisResult("שגיאה בניתוח.");
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
    { id: "policy", label: "הגדרות", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header - Campaign Manager style */}
      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-navy-900 to-slate-900/50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">AI Campaign Manager</h1>
            <p className="mt-1 text-sm text-slate-400">
              המנהל הווירטואלי שלך. אשר משימות וה-AI מבצע — ניתוחים, המלצות, A/B tests, בניית קמפיינים, קהלים וטקסטים לקריאטיבים.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => generateMutation.mutate()}
              disabled={busy || !accountId}
              className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              {generateMutation.isPending ? "מייצר..." : "ייצר המלצות חדשות"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 rounded-lg border border-slate-700/60 bg-slate-900/40 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-accent-blue/20 text-accent-blue"
                  : "text-slate-400 hover:text-slate-200"
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
          {/* Quick stats & batch actions */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg border border-slate-800 bg-navy-900 px-4 py-2">
                <span className="text-xs text-slate-400">ממתינים</span>
                <span className="ml-2 text-lg font-semibold text-amber-400">{stats.pending}</span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-navy-900 px-4 py-2">
                <span className="text-xs text-slate-400">לאישור & ביצוע</span>
                <span className="ml-2 text-lg font-semibold text-blue-400">{stats.approved}</span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-navy-900 px-4 py-2">
                <span className="text-xs text-slate-400">בוצעו</span>
                <span className="ml-2 text-lg font-semibold text-green-400">{stats.executed}</span>
              </div>
            </div>
            {pendingTasks.filter((r) => r.priority === "high").length > 0 && (
              <button
                onClick={() => handleApproveAllHigh()}
                disabled={busy}
                className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-500/20 disabled:opacity-50"
              >
                אשר כל ההמלצות בעדיפות גבוהה
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "approved", "rejected", "executed", "failed"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  statusFilter === status
                    ? "border-accent-blue bg-accent-blue/20 text-accent-blue"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {status === "all" ? "הכל" : status}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "budget_optimization", "audience_optimization", "creative_optimization", "ab_test", "campaign_build", "audience_build", "creative_copy"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  typeFilter === type
                    ? "border-accent-blue bg-accent-blue/20 text-accent-blue"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {type === "all" ? "כל הסוגים" : TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Task cards */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="rounded-xl border border-slate-800 bg-navy-900 p-8 text-center text-slate-400">
                טוען משימות...
              </div>
            ) : recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-navy-900 py-16">
                <Brain className="mb-4 h-14 w-14 text-slate-600" />
                <p className="text-base font-medium text-slate-400">אין משימות כרגע</p>
                <p className="mt-1 text-sm text-slate-500">לחץ "ייצר המלצות חדשות" כדי שה-AI ינתח את הקמפיינים</p>
              </div>
            ) : (
              recommendations.map((rec) => (
                <TaskCard
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AnalysisCard
              icon={BarChart3}
              title="סיכום יומי"
              desc="ניתוח ביצועי היום"
              onRun={() => handleRunAnalysis("daily_summary")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={BarChart3}
              title="אופטימיזציית תקציב"
              desc="המלצות להקצאת תקציב"
              onRun={() => handleRunAnalysis("budget_optimization")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={Palette}
              title="המלצות קריאטיב"
              desc="זיהוי עייפות קריאטיב"
              onRun={() => handleRunAnalysis("creative_recommendations")}
              loading={triggerAnalysisMutation.isPending}
            />
            <AnalysisCard
              icon={FileText}
              title="טקסט לקריאטיב"
              desc="יצירת מופעי פרסומת"
              onRun={() => handleRunAnalysis("creative_copy")}
              loading={triggerAnalysisMutation.isPending}
            />
          </div>

          {analysisResult && (
            <div className="rounded-xl border border-slate-800 bg-navy-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">תוצאת הניתוח</h3>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-900/60 p-4 text-sm text-slate-300">
                {analysisResult}
              </div>
            </div>
          )}

          {insightsQuery.data && insightsQuery.data.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-navy-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">ניתוחים אחרונים</h3>
              <div className="space-y-3">
                {insightsQuery.data.slice(0, 5).map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 text-sm text-slate-300"
                  >
                    <span className="text-xs text-slate-500">
                      {insight.insightType} · {new Date(insight.generatedAt).toLocaleString("he-IL")}
                    </span>
                    <p className="mt-1 line-clamp-2">{insight.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Policy Tab */}
      {activeTab === "policy" && (
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">הגדרות ביצוע</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              מינימום confidence לביצוע
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draftMinConfidence}
                onChange={(e) => setDraftMinConfidence(Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-slate-300">
              מקסימום שינוי תקציב (%)
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={draftMaxBudgetDelta}
                onChange={(e) => setDraftMaxBudgetDelta(Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={draftAllowExecute}
                onChange={(e) => setDraftAllowExecute(e.target.checked)}
              />
              אפשר ביצוע
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={draftAllowRollback}
                onChange={(e) => setDraftAllowRollback(e.target.checked)}
              />
              אפשר Rollback
            </label>
          </div>
          <div className="mt-4 flex gap-2">
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
              className="rounded-lg border border-accent-blue px-4 py-2 text-sm text-accent-blue disabled:opacity-50"
            >
              {policyBusy ? "שומר..." : "שמור"}
            </button>
            <button
              onClick={syncPolicyDraftFromServer}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
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

function AnalysisCard({
  icon: Icon,
  title,
  desc,
  onRun,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  onRun: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-4 transition-colors hover:border-slate-700">
      <Icon className="mb-3 h-8 w-8 text-accent-blue" />
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-400">{desc}</p>
      <button
        onClick={onRun}
        disabled={loading}
        className="mt-4 rounded-lg bg-accent-blue/20 px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
      >
        {loading ? "מריץ..." : "הרץ ניתוח"}
      </button>
    </div>
  );
}

function TaskCard({
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
    rec.status === "pending" && canExecute && (rec.confidence >= (policyData?.minConfidenceToExecute ?? 0.65));

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-2">
            <TypeIcon className="h-5 w-5 text-accent-blue" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-accent-blue/15 px-2 py-0.5 text-xs text-accent-blue">
                {TYPE_LABELS[rec.type]}
              </span>
              <span className={`rounded border px-2 py-0.5 text-xs ${PRIORITY_COLORS[rec.priority]}`}>
                {rec.priority}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {rec.status}
              </span>
            </div>
            <h3 className="text-base font-semibold text-white">{rec.title}</h3>
            <p className="text-sm text-slate-300">{rec.why || rec.reasoning}</p>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {new Date(rec.createdAt).toLocaleString("he-IL")}
          </div>
          <div className="mt-1">Confidence: {(rec.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Suggested content for creative_copy, campaign_build, audience_build */}
      {rec.suggestedContent && (
        <div className="mt-4 space-y-3">
          {rec.suggestedContent.creativeCopy && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">טקסט מוצע:</p>
              <p className="text-sm text-slate-200">{rec.suggestedContent.creativeCopy}</p>
              <button
                onClick={() => onCopy(rec.suggestedContent!.creativeCopy!)}
                className="mt-2 flex items-center gap-1 rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                {copiedId === rec.id ? "הועתק!" : "העתק"}
              </button>
            </div>
          )}
          {rec.suggestedContent.campaignPlan && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">תוכנית קמפיין:</p>
              <p className="text-sm text-slate-200">
                {rec.suggestedContent.campaignPlan.name && `שם: ${rec.suggestedContent.campaignPlan.name}`}
                {rec.suggestedContent.campaignPlan.objective && ` · Objective: ${rec.suggestedContent.campaignPlan.objective}`}
                {rec.suggestedContent.campaignPlan.targeting && ` · Targeting: ${rec.suggestedContent.campaignPlan.targeting}`}
              </p>
            </div>
          )}
          {rec.suggestedContent.audienceSuggestions && rec.suggestedContent.audienceSuggestions.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">הצעות קהל:</p>
              <ul className="list-inside list-disc text-sm text-slate-200">
                {rec.suggestedContent.audienceSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {rec.actionsDraft?.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-300">
          {rec.actionsDraft.map((action, idx) => (
            <li key={idx}>• {action}</li>
          ))}
        </ul>
      )}

      {rec.expectedImpact?.summary && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
          השפעה צפויה: {rec.expectedImpact.summary}
        </div>
      )}

      {/* Actions */}
      {rec.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {showApproveAndExecute ? (
            <button
              onClick={onApproveAndExecute}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-500/20 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              אשר והפעל
            </button>
          ) : (
            <button
              onClick={onApprove}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/20 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              אשר
            </button>
          )}
          <button
            onClick={onReject}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-60"
          >
            <XCircle className="h-4 w-4" />
            דחה
          </button>
        </div>
      )}

      {rec.status === "approved" && canExecute && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setExecutePreviewId(executePreviewId === rec.id ? null : rec.id)}
            disabled={busy}
            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300"
          >
            {executePreviewId === rec.id ? "הסתר" : "תצוגה מקדימה"}
          </button>
          <button
            onClick={onExecute}
            disabled={busy || executePreviewId !== rec.id}
            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300"
          >
            הפעל
          </button>
        </div>
      )}

      {executePreviewId === rec.id && executePreviewQuery.data && (
        <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
          {executePreviewQuery.data.canExecute ? (
            executePreviewQuery.data.action === "adjust_budget" ? (
              <p>
                תקציב: {executePreviewQuery.data.currentBudget} → {executePreviewQuery.data.newBudget}
              </p>
            ) : (
              <p>
                סטטוס: {executePreviewQuery.data.currentStatus} → {executePreviewQuery.data.desiredStatus}
              </p>
            )
          ) : (
            <p>לא ניתן להפעיל: {executePreviewQuery.data.reason}</p>
          )}
        </div>
      )}

      {rec.status === "failed" && rec.execution?.error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
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
                className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
              >
                {rollbackPreviewId === rec.id ? "הסתר Rollback" : "תצוגת Rollback"}
              </button>
              <button
                onClick={onRollback}
                disabled={busy || !rollbackPreviewQuery.data?.canRollback}
                className="rounded border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-xs text-amber-100"
              >
                Rollback
              </button>
            </>
          )}
          <button
            onClick={() => setExpandedHistoryId(expandedHistoryId === rec.id ? null : rec.id)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
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
        <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
          {executionsQuery.data.map((exe) => (
            <div key={exe.id} className="rounded border border-slate-700/60 bg-slate-900 px-2 py-2">
              <span className="font-medium">{exe.status}</span>
              <span className="ml-2">{exe.requestedAt ? new Date(exe.requestedAt).toLocaleString("he-IL") : ""}</span>
              {exe.action && <p className="mt-1">Action: {exe.action}</p>}
              {exe.error && <p className="text-red-300">Error: {exe.error}</p>}
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
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(generateMutation.error as Error)?.message ??
            (reviewMutation.error as Error)?.message ??
            (executeMutation.error as Error)?.message ??
            (rollbackMutation.error as Error)?.message ??
            "שגיאה"}
        </div>
      )}
      {generateMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">ההמלצות נוצרו בהצלחה.</div>
      )}
      {reviewMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">הסטטוס עודכן.</div>
      )}
      {executeMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">הפעולה בוצעה בהצלחה.</div>
      )}
      {rollbackMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">Rollback בוצע.</div>
      )}
    </>
  );
}
