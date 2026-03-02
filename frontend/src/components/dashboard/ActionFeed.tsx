import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Users,
  Loader2,
  Brain,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Pause,
} from "lucide-react";
import type {
  Recommendation,
  RecommendationModifications,
} from "../../types";

type CardStatus = "idle" | "processing" | "success" | "error";

interface ActionFeedProps {
  recommendations: Recommendation[];
  loading: boolean;
  busy: boolean;
  onApprove: (id: string, modifications?: RecommendationModifications) => Promise<void>;
  onApproveAndExecute: (id: string, modifications?: RecommendationModifications) => Promise<void>;
  onReject: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
  hasAccount: boolean;
}

/* ─── Determine card variant ─────────────────────────── */
type CardVariant = "kill" | "scale" | "creative" | "audience" | "ab_test" | "generic";

function getVariant(rec: Recommendation): CardVariant {
  const action = rec.executionPlan?.action;
  const desired = rec.executionPlan?.desiredStatus;
  const proposed = rec.proposedAction?.action?.toUpperCase();

  if (
    (action === "set_status" && desired === "paused") ||
    proposed === "PAUSE_AD_SET" ||
    proposed === "PAUSE_CAMPAIGN"
  ) return "kill";

  if (
    (action === "adjust_budget" && (rec.executionPlan?.deltaPct ?? 0) > 0) ||
    proposed === "INCREASE_BUDGET"
  ) return "scale";

  if (rec.type === "creative_optimization" || rec.type === "creative_copy") return "creative";
  if (rec.type === "audience_optimization" || rec.type === "audience_build") return "audience";
  if (rec.type === "ab_test") return "ab_test";
  return "generic";
}

const VARIANT_STYLES = {
  kill: {
    border: "border-rose-200",
    headerBg: "bg-rose-50",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    badge: "bg-rose-100 text-rose-700",
    approveBtn: "border border-rose-300 bg-rose-600 text-white hover:bg-rose-700",
    approveBtnGhost: "border border-rose-200 text-rose-600 hover:bg-rose-50",
    label: "KILL",
    labelClass: "bg-rose-100 text-rose-700 border border-rose-200",
    Icon: Pause,
  },
  scale: {
    border: "border-emerald-200",
    headerBg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    approveBtn: "border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700",
    approveBtnGhost: "border border-emerald-200 text-emerald-600 hover:bg-emerald-50",
    label: "SCALE",
    labelClass: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    Icon: TrendingUp,
  },
  creative: {
    border: "border-violet-200",
    headerBg: "bg-violet-50",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    badge: "bg-violet-100 text-violet-700",
    approveBtn: "border border-violet-300 bg-violet-600 text-white hover:bg-violet-700",
    approveBtnGhost: "border border-violet-200 text-violet-600 hover:bg-violet-50",
    label: "CREATIVE",
    labelClass: "bg-violet-100 text-violet-700 border border-violet-200",
    Icon: Sparkles,
  },
  audience: {
    border: "border-blue-200",
    headerBg: "bg-blue-50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    approveBtn: "border border-blue-300 bg-blue-600 text-white hover:bg-blue-700",
    approveBtnGhost: "border border-blue-200 text-blue-600 hover:bg-blue-50",
    label: "AUDIENCE",
    labelClass: "bg-blue-100 text-blue-700 border border-blue-200",
    Icon: Users,
  },
  ab_test: {
    border: "border-amber-200",
    headerBg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    approveBtn: "border border-amber-300 bg-amber-600 text-white hover:bg-amber-700",
    approveBtnGhost: "border border-amber-200 text-amber-600 hover:bg-amber-50",
    label: "A/B TEST",
    labelClass: "bg-amber-100 text-amber-700 border border-amber-200",
    Icon: Zap,
  },
  generic: {
    border: "border-indigo-200",
    headerBg: "bg-indigo-50",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700",
    approveBtn: "border border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-700",
    approveBtnGhost: "border border-indigo-200 text-indigo-600 hover:bg-indigo-50",
    label: "ACTION",
    labelClass: "bg-indigo-100 text-indigo-700 border border-indigo-200",
    Icon: Brain,
  },
} as const;

const PRIORITY_STYLES = {
  high: "bg-rose-50 text-rose-700 border border-rose-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-slate-100 text-slate-600 border border-slate-200",
} as const;

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="block text-sm font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function TaskCard({
  rec,
  busy,
  onApprove,
  onApproveAndExecute,
  onReject,
}: {
  rec: Recommendation;
  busy: boolean;
  onApprove: (id: string, modifications?: RecommendationModifications) => Promise<void>;
  onApproveAndExecute: (id: string, modifications?: RecommendationModifications) => Promise<void>;
  onReject: (id: string) => void;
}) {
  const [cardStatus, setCardStatus] = useState<CardStatus>("idle");
  const [editing, setEditing] = useState(false);
  const [editDelta, setEditDelta] = useState<number>(rec.executionPlan?.deltaPct ?? 0);
  const [editCopy, setEditCopy] = useState(rec.suggestedContent?.creativeCopy ?? "");
  const [editAudience, setEditAudience] = useState(
    (rec.suggestedContent?.audienceSuggestions ?? []).join(", ")
  );
  const [expanded, setExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const variant = getVariant(rec);
  const styles = VARIANT_STYLES[variant];
  const VariantIcon = styles.Icon;
  const canExecute = rec.executionPlan?.action && rec.executionPlan.action !== "none";

  const metrics = rec.metricsSnapshot ?? {};
  const hasMetrics = Object.keys(metrics).some((k) => (metrics[k] ?? 0) > 0);

  const buildModifications = useCallback((): RecommendationModifications | undefined => {
    const mods: RecommendationModifications = {};
    let hasChanges = false;
    if (rec.executionPlan?.action === "adjust_budget" && editDelta !== (rec.executionPlan?.deltaPct ?? 0)) {
      mods.deltaPct = editDelta;
      hasChanges = true;
    }
    if (rec.type === "creative_optimization" || rec.type === "creative_copy") {
      if (editCopy !== (rec.suggestedContent?.creativeCopy ?? "")) {
        mods.creativeCopy = editCopy;
        hasChanges = true;
      }
    }
    if (rec.type === "audience_optimization" || rec.type === "audience_build") {
      const original = (rec.suggestedContent?.audienceSuggestions ?? []).join(", ");
      if (editAudience !== original) {
        mods.audienceSuggestions = editAudience.split(",").map((s) => s.trim()).filter(Boolean);
        hasChanges = true;
      }
    }
    return hasChanges ? mods : undefined;
  }, [editDelta, editCopy, editAudience, rec]);

  const handleApprove = async () => {
    setCardStatus("processing");
    setErrorMsg("");
    try {
      if (canExecute) {
        await onApproveAndExecute(rec.id);
      } else {
        await onApprove(rec.id);
      }
      setCardStatus("success");
    } catch (err: unknown) {
      setCardStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Execution failed");
    }
  };

  const handleSaveAndExecute = async () => {
    setCardStatus("processing");
    setErrorMsg("");
    const mods = buildModifications();
    try {
      if (canExecute) {
        await onApproveAndExecute(rec.id, mods);
      } else {
        await onApprove(rec.id, mods);
      }
      setCardStatus("success");
      setEditing(false);
    } catch (err: unknown) {
      setCardStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Execution failed");
    }
  };

  const handleReject = () => {
    setCardStatus("processing");
    onReject(rec.id);
    setCardStatus("success");
  };

  /* Success state — slides out */
  if (cardStatus === "success") {
    return (
      <div className={`rounded-xl border ${styles.border} bg-white p-4 opacity-50 transition-all duration-500`}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="line-through">{rec.title}</span>
          <span className="ml-auto text-xs">Done</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border ${styles.border} bg-white shadow-sm transition-all duration-200 ${
        cardStatus === "processing" ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Colored header strip */}
      <div className={`rounded-t-xl px-4 py-3 ${styles.headerBg} flex items-center gap-3`}>
        <div className={`rounded-lg p-2 ${styles.iconBg}`}>
          <VariantIcon className={`h-4 w-4 ${styles.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider ${styles.labelClass}`}>
              {styles.label}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[rec.priority]}`}>
              {rec.priority === "high" ? "🔴 High" : rec.priority === "medium" ? "🟡 Medium" : "⚪ Low"}
            </span>
          </div>
        </div>
        <span className="text-xs tabular-nums text-slate-400 shrink-0">
          {Math.round(rec.confidence * 100)}% confidence
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{rec.title}</h3>
        <p className="mt-1 text-sm text-slate-600 leading-relaxed">
          {rec.uiDisplayText || rec.why || rec.reasoning}
        </p>

        {/* Metrics snapshot */}
        {hasMetrics && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metrics.spend != null && metrics.spend > 0 && (
              <MetricPill label="Spend" value={`$${metrics.spend.toFixed(0)}`} />
            )}
            {metrics.roas != null && metrics.roas > 0 && (
              <MetricPill label="ROAS" value={`${metrics.roas.toFixed(2)}x`} />
            )}
            {metrics.cpa != null && metrics.cpa > 0 && (
              <MetricPill label="CPA" value={`$${metrics.cpa.toFixed(0)}`} />
            )}
            {metrics.ctr != null && metrics.ctr > 0 && (
              <MetricPill label="CTR" value={`${metrics.ctr.toFixed(2)}%`} />
            )}
            {metrics.cpm != null && metrics.cpm > 0 && (
              <MetricPill label="CPM" value={`$${metrics.cpm.toFixed(1)}`} />
            )}
            {metrics.frequency != null && metrics.frequency > 0 && (
              <MetricPill label="Freq" value={metrics.frequency.toFixed(1)} />
            )}
          </div>
        )}

        {/* Expandable reasoning */}
        {rec.reasoning && rec.reasoning !== rec.uiDisplayText && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide details" : "Show details"}
            </button>
            {expanded && (
              <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
                {rec.reasoning}
              </p>
            )}
          </div>
        )}

        {/* Expected impact */}
        {rec.expectedImpact?.summary && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            {rec.expectedImpact.direction === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-500 shrink-0" />
            )}
            <span className="text-xs text-slate-600">
              <span className="font-medium">Expected: </span>
              {rec.expectedImpact.summary}
            </span>
          </div>
        )}

        {/* Creative content preview (CREATIVE variant) */}
        {!editing && rec.suggestedContent?.creativeCopy && (
          <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500 mb-1.5">
              AI Suggested Copy
            </p>
            <p className="text-sm text-violet-900">&ldquo;{rec.suggestedContent.creativeCopy}&rdquo;</p>
          </div>
        )}

        {/* Audience suggestions */}
        {!editing && rec.suggestedContent?.audienceSuggestions?.length ? (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-1.5">
              Audience Suggestions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rec.suggestedContent.audienceSuggestions.map((s, i) => (
                <span key={i} className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs text-blue-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Edit Panel */}
        {editing && (
          <div className="mt-3 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700">Edit before executing</span>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {rec.executionPlan?.action === "adjust_budget" && (
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Budget change (%)</span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={editDelta}
                  onChange={(e) => setEditDelta(Number(e.target.value))}
                  className="mt-1 w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                  <span>-50%</span>
                  <span className={`font-semibold ${editDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {editDelta > 0 ? "+" : ""}{editDelta}%
                  </span>
                  <span>+50%</span>
                </div>
              </label>
            )}

            {(rec.type === "creative_optimization" || rec.type === "creative_copy") && (
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Ad copy</span>
                <textarea
                  value={editCopy}
                  onChange={(e) => setEditCopy(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  maxLength={2000}
                />
              </label>
            )}

            {(rec.type === "audience_optimization" || rec.type === "audience_build") && (
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Audience (comma-separated)</span>
                <input
                  type="text"
                  value={editAudience}
                  onChange={(e) => setEditAudience(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            )}

            <button
              onClick={handleSaveAndExecute}
              disabled={busy || cardStatus === "processing"}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Save & Execute
            </button>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {rec.status === "pending" && !editing && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={handleApprove}
            disabled={busy || cardStatus === "processing"}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles.approveBtn}`}
          >
            {cardStatus === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {variant === "kill" ? "Pause Campaign" : canExecute ? "Approve & Execute" : "Approve"}
          </button>

          <button
            onClick={() => setEditing(true)}
            disabled={busy || cardStatus === "processing"}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>

          <button
            onClick={handleReject}
            disabled={busy || cardStatus === "processing"}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
          </button>
        </div>
      )}

      {/* Executed status */}
      {rec.status === "executed" && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Executed successfully
          </span>
        </div>
      )}
      {rec.status === "failed" && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Execution failed
            {rec.execution?.error && `: ${rec.execution.error}`}
          </span>
        </div>
      )}
      {rec.status === "approved" && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-indigo-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved — awaiting execution
          </span>
        </div>
      )}
      {rec.status === "rejected" && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <XCircle className="h-3.5 w-3.5" /> Dismissed
          </span>
        </div>
      )}
    </div>
  );
}

export function ActionFeed({
  recommendations,
  loading,
  busy,
  onApprove,
  onApproveAndExecute,
  onReject,
  onGenerate,
  generating,
  hasAccount,
}: ActionFeedProps) {
  const pending = recommendations.filter((r) => r.status === "pending");
  const recent = recommendations.filter((r) => r.status !== "pending");
  const highCount = pending.filter((r) => r.priority === "high").length;

  const sorted = [...pending].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority];
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" />
        <p className="mt-2 text-sm text-slate-500">Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">Action Feed</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              {pending.length} pending
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              {highCount} urgent
            </span>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={generating || !hasAccount}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {generating ? "Analyzing..." : "🧠 Generate AI Tasks"}
        </button>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && recent.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
            <Brain className="h-8 w-8 text-indigo-400" />
          </div>
          <p className="text-base font-semibold text-slate-700">No pending tasks</p>
          <p className="mt-1 max-w-xs text-center text-sm text-slate-500">
            Click &ldquo;Generate AI Tasks&rdquo; to let Nati AI analyze your campaigns and surface actionable recommendations.
          </p>
          <button
            onClick={onGenerate}
            disabled={generating || !hasAccount}
            className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {generating ? "Analyzing..." : "🧠 Generate AI Tasks"}
          </button>
        </div>
      )}

      {/* Pending task cards */}
      {sorted.map((rec) => (
        <TaskCard
          key={rec.id}
          rec={rec}
          busy={busy}
          onApprove={onApprove}
          onApproveAndExecute={onApproveAndExecute}
          onReject={onReject}
        />
      ))}

      {/* Recently completed (collapsible) */}
      {recent.length > 0 && (
        <RecentSection items={recent} />
      )}
    </div>
  );
}

function RecentSection({ items }: { items: Recommendation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <span className="font-medium">Completed tasks ({items.length})</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {items.slice(0, 10).map((rec) => {
            const variant = getVariant(rec);
            const styles = VARIANT_STYLES[variant];
            return (
              <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${styles.labelClass}`}>
                  {styles.label}
                </span>
                <span className="flex-1 truncate text-sm text-slate-600">{rec.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  rec.status === "executed"
                    ? "bg-emerald-50 text-emerald-700"
                    : rec.status === "failed"
                    ? "bg-rose-50 text-rose-700"
                    : rec.status === "rejected"
                    ? "bg-slate-100 text-slate-500"
                    : "bg-indigo-50 text-indigo-700"
                }`}>
                  {rec.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
