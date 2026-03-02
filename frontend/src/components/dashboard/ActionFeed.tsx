import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  TrendingUp,
  TrendingDown,
  Pause,
  AlertTriangle,
  Palette,
  Users,
  Loader2,
  Brain,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
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

const TYPE_CONFIG: Record<
  string,
  { label: string; accent: string; bg: string; border: string; icon: React.ElementType }
> = {
  budget_optimization: {
    label: "תקציב",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    icon: TrendingUp,
  },
  creative_optimization: {
    label: "קריאטיב",
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/25",
    icon: Palette,
  },
  audience_optimization: {
    label: "קהל",
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    icon: Users,
  },
  ab_test: {
    label: "A/B Test",
    accent: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/25",
    icon: Zap,
  },
  campaign_build: {
    label: "קמפיין חדש",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    icon: TrendingUp,
  },
  audience_build: {
    label: "קהל חדש",
    accent: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
    icon: Users,
  },
  creative_copy: {
    label: "טקסט",
    accent: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/25",
    icon: Palette,
  },
};

const PRIORITY_STYLES = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  low: "bg-slate-700/40 text-slate-300 border-slate-600/30",
} as const;

function isKillAction(rec: Recommendation): boolean {
  const action = rec.executionPlan?.action;
  const desired = rec.executionPlan?.desiredStatus;
  const proposed = rec.proposedAction?.action?.toUpperCase();
  return (
    (action === "set_status" && desired === "paused") ||
    proposed === "PAUSE_AD_SET" ||
    proposed === "PAUSE_CAMPAIGN"
  );
}

function isScaleAction(rec: Recommendation): boolean {
  const plan = rec.executionPlan;
  const proposed = rec.proposedAction?.action?.toUpperCase();
  return (
    (plan?.action === "adjust_budget" && (plan.deltaPct ?? 0) > 0) ||
    proposed === "INCREASE_BUDGET"
  );
}

function getCardAccent(rec: Recommendation) {
  if (isKillAction(rec)) return { accent: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25" };
  if (isScaleAction(rec)) return { accent: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25" };
  const config = TYPE_CONFIG[rec.type];
  if (config) return { accent: config.accent, bg: config.bg, border: config.border };
  return { accent: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-600/30" };
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-700/60 bg-slate-900/50 px-2.5 py-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <p className="text-sm font-semibold tabular-nums text-slate-200">{value}</p>
    </div>
  );
}

function ActionCard({
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

  const colors = getCardAccent(rec);
  const typeConfig = TYPE_CONFIG[rec.type] ?? {
    label: rec.type,
    icon: Brain,
  };
  const TypeIcon = typeConfig.icon;
  const canExecute = rec.executionPlan?.action && rec.executionPlan.action !== "none";
  const kill = isKillAction(rec);
  const scale = isScaleAction(rec);

  const metrics = rec.metricsSnapshot ?? {};
  const hasMetrics = Object.keys(metrics).some((k) => metrics[k] !== 0);

  const buildModifications = useCallback((): RecommendationModifications | undefined => {
    const mods: RecommendationModifications = {};
    let hasChanges = false;

    if (rec.executionPlan?.action === "adjust_budget" && editDelta !== (rec.executionPlan?.deltaPct ?? 0)) {
      mods.deltaPct = editDelta;
      hasChanges = true;
    }
    if (rec.type === "creative_optimization" || rec.type === "creative_copy") {
      const original = rec.suggestedContent?.creativeCopy ?? "";
      if (editCopy !== original) {
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

  if (cardStatus === "success") {
    return (
      <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 opacity-60 transition-all duration-500`}>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span>{rec.title}</span>
          <span className="mr-auto text-xs text-slate-500">בוצע</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border ${colors.border} bg-navy-900 transition-all duration-300 ${
        cardStatus === "processing" ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className={`rounded-lg ${colors.bg} p-2 mt-0.5`}>
          {kill ? (
            <Pause className="h-5 w-5 text-red-400" />
          ) : scale ? (
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          ) : rec.proposedAction?.action?.toUpperCase() === "MANUAL_REVIEW" ? (
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          ) : (
            <TypeIcon className={`h-5 w-5 ${colors.accent}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[rec.priority]}`}>
              {rec.priority}
            </span>
            <span className={`rounded ${colors.bg} px-2 py-0.5 text-[10px] font-medium ${colors.accent}`}>
              {typeConfig.label}
            </span>
            {kill && (
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                KILL
              </span>
            )}
            {scale && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                SCALE
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-semibold text-white leading-snug">{rec.title}</h3>
          <p className="mt-1 text-sm text-slate-300">
            {rec.uiDisplayText || rec.why || rec.reasoning}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs tabular-nums text-slate-500">
            {Math.round(rec.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Metrics Snapshot */}
      {hasMetrics && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
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
        <div className="px-4 pb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "הסתר פירוט" : "הצג פירוט"}
          </button>
          {expanded && (
            <p className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 text-xs text-slate-400 leading-relaxed">
              {rec.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Expected Impact */}
      {rec.expectedImpact?.summary && (
        <div className="mx-4 mb-2 rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {rec.expectedImpact.direction === "up" ? (
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-400" />
            )}
            <span>השפעה צפויה: {rec.expectedImpact.summary}</span>
          </div>
        </div>
      )}

      {/* Suggested Content Preview */}
      {!editing && rec.suggestedContent?.creativeCopy && (
        <div className="mx-4 mb-2 rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1">טקסט מוצע</p>
          <p className="text-sm text-slate-200">{rec.suggestedContent.creativeCopy}</p>
        </div>
      )}
      {!editing && rec.suggestedContent?.audienceSuggestions?.length ? (
        <div className="mx-4 mb-2 rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1">הצעות קהל</p>
          <div className="flex flex-wrap gap-1.5">
            {rec.suggestedContent.audienceSuggestions.map((s, i) => (
              <span key={i} className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {s}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Edit Panel */}
      {editing && (
        <div className="mx-4 mb-2 space-y-3 rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent-blue">עריכת משימה</span>
            <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {rec.executionPlan?.action === "adjust_budget" && (
            <label className="block">
              <span className="text-xs text-slate-400">שינוי תקציב (%)</span>
              <input
                type="range"
                min={-50}
                max={20}
                step={1}
                value={editDelta}
                onChange={(e) => setEditDelta(Number(e.target.value))}
                className="mt-1 w-full accent-accent-blue"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                <span>-50%</span>
                <span className={`font-semibold ${editDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {editDelta > 0 ? "+" : ""}{editDelta}%
                </span>
                <span>+20%</span>
              </div>
            </label>
          )}

          {(rec.type === "creative_optimization" || rec.type === "creative_copy") && (
            <label className="block">
              <span className="text-xs text-slate-400">טקסט למודעה</span>
              <textarea
                value={editCopy}
                onChange={(e) => setEditCopy(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white resize-none focus:border-accent-blue focus:outline-none"
                maxLength={2000}
              />
            </label>
          )}

          {(rec.type === "audience_optimization" || rec.type === "audience_build") && (
            <label className="block">
              <span className="text-xs text-slate-400">הגדרות קהל (מופרד בפסיקים)</span>
              <input
                type="text"
                value={editAudience}
                onChange={(e) => setEditAudience(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent-blue focus:outline-none"
              />
            </label>
          )}

          <button
            onClick={handleSaveAndExecute}
            disabled={busy || cardStatus === "processing"}
            className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            שמור ובצע
          </button>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Action Buttons */}
      {rec.status === "pending" && !editing && (
        <div className="flex items-center gap-2 border-t border-slate-800/60 px-4 py-3">
          <button
            onClick={handleApprove}
            disabled={busy || cardStatus === "processing"}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              kill
                ? "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                : "border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
            }`}
          >
            {cardStatus === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {kill ? "אשר עצירה" : canExecute ? "אשר והפעל" : "אשר"}
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={busy || cardStatus === "processing"}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            ערוך
          </button>
          <button
            onClick={handleReject}
            disabled={busy || cardStatus === "processing"}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-2 text-sm text-red-400/70 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            דחה
          </button>
        </div>
      )}

      {/* Executed / Failed status */}
      {rec.status === "executed" && (
        <div className="border-t border-slate-800/60 px-4 py-2">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> בוצע בהצלחה
          </span>
        </div>
      )}
      {rec.status === "failed" && (
        <div className="border-t border-slate-800/60 px-4 py-2">
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> ביצוע נכשל
            {rec.execution?.error && `: ${rec.execution.error}`}
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
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />
        <p className="mt-2 text-sm text-slate-400">טוען משימות...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">Action Feed</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-xs font-semibold text-accent-blue">
              {pending.length} משימות
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-300">
              {highCount} דחופות
            </span>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={generating || !hasAccount}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {generating ? "מנתח..." : "ייצר משימות חדשות"}
        </button>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && recent.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-navy-900 py-16">
          <Brain className="mb-4 h-14 w-14 text-slate-600" />
          <p className="text-base font-medium text-slate-400">אין משימות כרגע</p>
          <p className="mt-1 text-sm text-slate-500">
            לחץ &quot;ייצר משימות חדשות&quot; כדי ש-Nati AI ינתח את הקמפיינים
          </p>
        </div>
      )}

      {/* Pending tasks */}
      {sorted.map((rec) => (
        <ActionCard
          key={rec.id}
          rec={rec}
          busy={busy}
          onApprove={onApprove}
          onApproveAndExecute={onApproveAndExecute}
          onReject={onReject}
        />
      ))}

      {/* Recently completed (collapsed by default) */}
      {recent.length > 0 && (
        <RecentSection items={recent} />
      )}
    </div>
  );
}

function RecentSection({ items }: { items: Recommendation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span>משימות שהושלמו ({items.length})</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y divide-slate-800/60 border-t border-slate-800/60">
          {items.slice(0, 10).map((rec) => {
            const colors = getCardAccent(rec);
            return (
              <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[rec.priority]}`}>
                  {rec.priority}
                </span>
                <span className="flex-1 truncate text-sm text-slate-300">{rec.title}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] ${
                  rec.status === "executed"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : rec.status === "failed"
                    ? "bg-red-500/10 text-red-400"
                    : rec.status === "rejected"
                    ? "bg-slate-700/40 text-slate-400"
                    : `${colors.bg} ${colors.accent}`
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
