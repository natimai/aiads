import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
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
import type { RecommendationStatus, RecommendationType } from "../types";

const TYPE_LABELS: Record<RecommendationType, string> = {
  budget_optimization: "Budget",
  audience_optimization: "Audience",
  creative_optimization: "Creative",
  ab_test: "A/B Test",
};

const PRIORITY_COLORS = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  low: "bg-slate-700/40 text-slate-300 border-slate-600/30",
} as const;

export default function AIInsights() {
  const { selectedAccountId, selectedAccount, accounts } = useAccounts();
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<RecommendationType | "all">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [rollbackPreviewId, setRollbackPreviewId] = useState<string | null>(null);
  const [executePreviewId, setExecutePreviewId] = useState<string | null>(null);
  const [draftMinConfidence, setDraftMinConfidence] = useState(0.65);
  const [draftMaxBudgetDelta, setDraftMaxBudgetDelta] = useState(30);
  const [draftAllowExecute, setDraftAllowExecute] = useState(true);
  const [draftAllowRollback, setDraftAllowRollback] = useState(true);

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
    if (policyData) {
      syncPolicyDraftFromServer();
    }
  }, [policyData]);

  const recommendations = recommendationsQuery.data ?? [];
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">AI Recommendation Center</h2>
          <p className="text-sm text-slate-400">
            Powered by Google Gemini · {selectedAccount?.accountName ?? "All Accounts"}
          </p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={busy || !accountId}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          {generateMutation.isPending ? "Generating..." : "Generate Recommendations"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Pending</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats.approved}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Rejected</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats.rejected}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Executed</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats.executed}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats.failed}</p>
        </div>
      </div>

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
            {status}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Execution Policy</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            Minimum confidence to execute
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={draftMinConfidence}
              onChange={(e) => setDraftMinConfidence(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-300">
            Max budget delta (%)
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={draftMaxBudgetDelta}
              onChange={(e) => setDraftMaxBudgetDelta(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={draftAllowExecute}
              onChange={(e) => setDraftAllowExecute(e.target.checked)}
            />
            Allow execute
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={draftAllowRollback}
              onChange={(e) => setDraftAllowRollback(e.target.checked)}
            />
            Allow rollback
          </label>
        </div>
        <div className="mt-3 flex gap-2">
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
            className="rounded border border-accent-blue px-3 py-1.5 text-xs text-accent-blue disabled:opacity-50"
          >
            {policyBusy ? "Saving..." : "Save Policy"}
          </button>
          <button
            onClick={syncPolicyDraftFromServer}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "budget_optimization", "audience_optimization", "creative_optimization", "ab_test"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              typeFilter === type
                ? "border-accent-blue bg-accent-blue/20 text-accent-blue"
                : "border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
          >
            {type === "all" ? "all types" : TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-800 bg-navy-900 p-5 text-sm text-slate-400">
            Loading recommendations...
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-navy-900 py-12">
            <Brain className="mb-4 h-12 w-12 text-slate-600" />
            <p className="text-sm text-slate-400">No recommendations found</p>
            <p className="text-xs text-slate-500">Generate recommendations to start the review flow</p>
          </div>
        ) : (
          recommendations.map((rec) => (
            <div key={rec.id} className="rounded-xl border border-slate-800 bg-navy-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
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
                <div className="text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(rec.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-1">Confidence: {(rec.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>

              {rec.actionsDraft?.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-300">
                  {rec.actionsDraft.map((action, idx) => (
                    <li key={idx}>- {action}</li>
                  ))}
                </ul>
              )}

              {rec.expectedImpact?.summary && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                  Expected impact: {rec.expectedImpact.summary}
                </div>
              )}

              {rec.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() =>
                      reviewMutation.mutate({
                        recommendationId: rec.id,
                        decision: "approve",
                      })
                    }
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/20 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      reviewMutation.mutate({
                        recommendationId: rec.id,
                        decision: "reject",
                      })
                    }
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}
              {rec.status === "approved" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() =>
                      setExecutePreviewId((current) => (current === rec.id ? null : rec.id))
                    }
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-60"
                  >
                    {executePreviewId === rec.id ? "Hide Execute Preview" : "Preview Execute"}
                  </button>
                  <button
                    onClick={() =>
                      executeMutation.mutate({
                        recommendationId: rec.id,
                      })
                    }
                    disabled={
                      busy ||
                      rec.executionPlan?.action === "none" ||
                      executePreviewId !== rec.id ||
                      !executePreviewQuery.data?.canExecute
                    }
                    className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-60"
                    title={rec.executionPlan?.action === "none" ? "No executable action for this recommendation" : ""}
                  >
                    Confirm Execute
                  </button>
                </div>
              )}
              {executePreviewId === rec.id && (
                <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
                  {executePreviewQuery.isLoading ? (
                    <p>Loading execute preview...</p>
                  ) : executePreviewQuery.data ? (
                    executePreviewQuery.data.canExecute ? (
                      executePreviewQuery.data.action === "adjust_budget" ? (
                        <p>
                          Budget: {executePreviewQuery.data.currentBudget} -&gt;{" "}
                          {executePreviewQuery.data.newBudget}
                          {typeof executePreviewQuery.data.diffBudget === "number"
                            ? ` (delta ${executePreviewQuery.data.diffBudget})`
                            : ""}
                        </p>
                      ) : (
                        <p>
                          Status: {executePreviewQuery.data.currentStatus} -&gt;{" "}
                          {executePreviewQuery.data.desiredStatus}
                        </p>
                      )
                    ) : (
                      <p>Cannot execute: {executePreviewQuery.data.reason ?? "Unknown reason"}</p>
                    )
                  ) : (
                    <p>Execute preview unavailable.</p>
                  )}
                </div>
              )}
              {rec.status === "failed" && rec.execution?.error && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  Execution error: {rec.execution.error}
                </div>
              )}
              {(rec.status === "executed" || rec.status === "failed") && (
                <div className="mt-3">
                  {rec.status === "executed" && (
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        onClick={() =>
                          setRollbackPreviewId((current) => (current === rec.id ? null : rec.id))
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                      >
                        {rollbackPreviewId === rec.id ? "Hide Rollback Preview" : "Preview Rollback"}
                      </button>
                      <button
                        onClick={() => rollbackMutation.mutate({ recommendationId: rec.id })}
                        disabled={busy || rollbackPreviewId !== rec.id || !rollbackPreviewQuery.data?.canRollback}
                        className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        Confirm Rollback
                      </button>
                    </div>
                  )}
                  {rollbackPreviewId === rec.id && (
                    <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {rollbackPreviewQuery.isLoading ? (
                        <p>Loading rollback preview...</p>
                      ) : rollbackPreviewQuery.data ? (
                        rollbackPreviewQuery.data.action === "rollback_budget" ? (
                          <p>
                            Budget: {rollbackPreviewQuery.data.currentBudget} -&gt;{" "}
                            {rollbackPreviewQuery.data.restoredBudget}
                            {typeof rollbackPreviewQuery.data.diffBudget === "number"
                              ? ` (delta ${rollbackPreviewQuery.data.diffBudget})`
                              : ""}
                          </p>
                        ) : (
                          <p>
                            Status: {rollbackPreviewQuery.data.currentStatus} -&gt;{" "}
                            {rollbackPreviewQuery.data.restoredStatus}
                          </p>
                        )
                      ) : (
                        <p>Rollback preview unavailable.</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setExpandedHistoryId((current) => (current === rec.id ? null : rec.id))
                    }
                    className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
                  >
                    {expandedHistoryId === rec.id ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        Hide execution history
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        Show execution history
                      </>
                    )}
                  </button>

                  {expandedHistoryId === rec.id && (
                    <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
                      {executionsQuery.isLoading ? (
                        <p>Loading execution history...</p>
                      ) : executionsQuery.data && executionsQuery.data.length > 0 ? (
                        <div className="space-y-2">
                          {executionsQuery.data.map((exe) => (
                            <div key={exe.id} className="rounded border border-slate-700/60 bg-slate-900 px-2 py-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{exe.status}</span>
                                <span>{exe.requestedAt ? new Date(exe.requestedAt).toLocaleString() : "n/a"}</span>
                              </div>
                              {exe.action && <p className="mt-1">Action: {exe.action}</p>}
                              {exe.targetId && <p>Target: {exe.targetId}</p>}
                              {exe.error && <p className="text-red-300">Error: {exe.error}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No execution history found.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {generateMutation.isError && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(generateMutation.error as Error)?.message ?? "Failed to generate recommendations"}
        </div>
      )}
      {reviewMutation.isError && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(reviewMutation.error as Error)?.message ?? "Failed to update recommendation"}
        </div>
      )}
      {executeMutation.isError && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(executeMutation.error as Error)?.message ?? "Failed to execute recommendation"}
        </div>
      )}
      {rollbackMutation.isError && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(rollbackMutation.error as Error)?.message ?? "Failed to rollback recommendation"}
        </div>
      )}
      {generateMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">
          Recommendations refreshed successfully.
        </div>
      )}
      {reviewMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">
          Recommendation status updated.
        </div>
      )}
      {executeMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">
          Recommendation executed successfully.
        </div>
      )}
      {rollbackMutation.isSuccess && (
        <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-300">
          Recommendation rollback completed.
        </div>
      )}
    </div>
  );
}
