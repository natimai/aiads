import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  TestTube2,
  X,
  XCircle,
} from "lucide-react";
import type {
  Recommendation,
  RecommendationModifications,
  TasksResponse,
} from "../../types";

type CardStatus = "idle" | "processing" | "error";

type CardVariant = "kill" | "scale" | "creative" | "audience" | "ab_test" | "generic";

interface ActionFeedProps {
  recommendations: Recommendation[];
  groups?: TasksResponse["groups"];
  loading: boolean;
  busy: boolean;
  onApprove: (id: string, modifications?: RecommendationModifications) => Promise<void>;
  onApproveAndExecute: (
    id: string,
    modifications?: RecommendationModifications
  ) => Promise<void>;
  onReject: (id: string) => void;
}

const VARIANT_STYLES: Record<
  CardVariant,
  {
    ring: string;
    tone: string;
    pill: string;
    approve: string;
    label: string;
  }
> = {
  kill: {
    ring: "from-rose-500/55 via-rose-400/20 to-transparent",
    tone: "text-rose-200",
    pill: "border-rose-400/30 bg-rose-500/20 text-rose-200",
    approve: "bg-rose-500 text-white hover:bg-rose-400",
    label: "עצירה",
  },
  scale: {
    ring: "from-emerald-500/55 via-emerald-400/20 to-transparent",
    tone: "text-emerald-200",
    pill: "border-emerald-400/30 bg-emerald-500/20 text-emerald-200",
    approve: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    label: "סקייל",
  },
  creative: {
    ring: "from-violet-500/55 via-violet-400/20 to-transparent",
    tone: "text-violet-200",
    pill: "border-violet-400/30 bg-violet-500/20 text-violet-200",
    approve: "bg-violet-500 text-white hover:bg-violet-400",
    label: "קריאייטיב",
  },
  audience: {
    ring: "from-cyan-500/55 via-cyan-400/20 to-transparent",
    tone: "text-cyan-200",
    pill: "border-cyan-400/30 bg-cyan-500/20 text-cyan-200",
    approve: "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
    label: "קהל",
  },
  ab_test: {
    ring: "from-amber-500/55 via-amber-400/20 to-transparent",
    tone: "text-amber-200",
    pill: "border-amber-400/30 bg-amber-500/20 text-amber-200",
    approve: "bg-amber-500 text-slate-950 hover:bg-amber-400",
    label: "טסט A/B",
  },
  generic: {
    ring: "from-indigo-500/55 via-indigo-400/20 to-transparent",
    tone: "text-indigo-200",
    pill: "border-indigo-400/30 bg-indigo-500/20 text-indigo-200",
    approve: "bg-indigo-500 text-white hover:bg-indigo-400",
    label: "פעולה",
  },
};

const PRIORITY_PILL: Record<Recommendation["priority"], string> = {
  high: "border-rose-400/40 bg-rose-500/15 text-rose-200",
  medium: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  low: "border-slate-500/40 bg-slate-500/15 text-slate-300",
};

const PRIORITY_LABEL: Record<Recommendation["priority"], string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתינה",
  approved: "אושרה",
  rejected: "נדחתה",
  executed: "בוצעה",
  done: "הושלמה",
  dismissed: "בוטלה",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function getVariant(rec: Recommendation): CardVariant {
  const action = rec.executionPlan?.action;
  const desired = rec.executionPlan?.desiredStatus;
  const proposed = rec.proposedAction?.action?.toUpperCase();

  if (
    (action === "set_status" && desired === "paused") ||
    proposed === "PAUSE_AD_SET" ||
    proposed === "PAUSE_CAMPAIGN"
  ) {
    return "kill";
  }

  if (
    (action === "adjust_budget" && (rec.executionPlan?.deltaPct ?? 0) > 0) ||
    proposed === "INCREASE_BUDGET"
  ) {
    return "scale";
  }

  if (rec.type === "creative_optimization" || rec.type === "creative_copy") {
    return "creative";
  }

  if (
    rec.type === "audience_optimization" ||
    rec.type === "audience_build" ||
    rec.type === "audience_discovery" ||
    rec.type === "targeting_optimization"
  ) {
    return "audience";
  }

  if (rec.type === "ab_test") {
    return "ab_test";
  }

  return "generic";
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#0e1630] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function SectionTitle({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${tone}`}>{title}</span>
      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
        {count}
      </span>
    </div>
  );
}

function NanoBananaGallery({
  images,
  generatedAt,
}: {
  images: string[];
  generatedAt?: string;
}) {
  if (!images.length) {
    return (
      <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
        אין וריאציות תמונה זמינות כרגע.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-violet-400/25 bg-[#121735] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-200">
          וריאציות Nano Banana
        </p>
        <span className="text-[11px] text-slate-400">{generatedAt ? "מוכן" : "נוצר"}</span>
      </div>

      <div className="flex snap-x gap-3 overflow-x-auto pb-1 md:hidden">
        {images.map((url, index) => (
          <div key={url + index} className="w-[76%] shrink-0 snap-center overflow-hidden rounded-xl border border-slate-700/80">
            <img src={url} alt={`קריאייטיב ${index + 1}`} className="aspect-square w-full object-cover" />
          </div>
        ))}
      </div>

      <div className="hidden md:columns-3 md:gap-3">
        {images.map((url, index) => (
          <div key={url + index} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-slate-700/80">
            <img src={url} alt={`קריאייטיב ${index + 1}`} className="w-full object-cover" />
          </div>
        ))}
      </div>
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
  const [errorMsg, setErrorMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [resolvedAs, setResolvedAs] = useState<"idle" | "approved" | "dismissed">("idle");

  const [editDelta, setEditDelta] = useState<number>(rec.executionPlan?.deltaPct ?? 0);
  const [editCopy, setEditCopy] = useState(rec.suggestedContent?.creativeCopy ?? "");
  const [editAudience, setEditAudience] = useState(
    (rec.suggestedContent?.audienceSuggestions ?? []).join(", ")
  );

  const variant = getVariant(rec);
  const styles = VARIANT_STYLES[variant];
  const canExecute = rec.executionPlan?.action && rec.executionPlan.action !== "none";

  const isGhostDraft =
    Boolean(rec.metadata?.draftId) &&
    (rec.type === "ghost_draft" ||
      rec.batchType === "GHOST_DRAFT" ||
      rec.batchType === "PROACTIVE_DRAFT");

  const metrics = rec.metricsSnapshot ?? {};

  const finishResolution = (mode: "approved" | "dismissed") => {
    setResolvedAs(mode);
    window.setTimeout(() => setIsClosing(true), 380);
    window.setTimeout(() => setHidden(true), 820);
  };

  const buildModifications = (): RecommendationModifications | undefined => {
    const modifications: RecommendationModifications = {};
    let hasChanges = false;

    if (
      rec.executionPlan?.action === "adjust_budget" &&
      editDelta !== (rec.executionPlan?.deltaPct ?? 0)
    ) {
      modifications.deltaPct = editDelta;
      hasChanges = true;
    }

    if (rec.type === "creative_optimization" || rec.type === "creative_copy") {
      if (editCopy !== (rec.suggestedContent?.creativeCopy ?? "")) {
        modifications.creativeCopy = editCopy;
        hasChanges = true;
      }
    }

    if (
      rec.type === "audience_optimization" ||
      rec.type === "audience_build" ||
      rec.type === "audience_discovery" ||
      rec.type === "targeting_optimization"
    ) {
      const original = (rec.suggestedContent?.audienceSuggestions ?? []).join(", ");
      if (editAudience !== original) {
        modifications.audienceSuggestions = editAudience
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        hasChanges = true;
      }
    }

    return hasChanges ? modifications : undefined;
  };

  const handleApprove = async () => {
    setCardStatus("processing");
    setErrorMsg("");

    try {
      if (canExecute) {
        await onApproveAndExecute(rec.id);
      } else {
        await onApprove(rec.id);
      }
      finishResolution("approved");
    } catch (err: unknown) {
      setCardStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "אישור הפעולה נכשל.");
    }
  };

  const handleSaveAndExecute = async () => {
    setCardStatus("processing");
    setErrorMsg("");
    const modifications = buildModifications();

    try {
      if (canExecute) {
        await onApproveAndExecute(rec.id, modifications);
      } else {
        await onApprove(rec.id, modifications);
      }
      finishResolution("approved");
    } catch (err: unknown) {
      setCardStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "שמירה וביצוע נכשלו.");
    }
  };

  const handleDismiss = () => {
    setCardStatus("processing");
    setErrorMsg("");
    onReject(rec.id);
    finishResolution("dismissed");
  };

  if (hidden) {
    return null;
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-[#080f23] px-4 py-4 shadow-[0_20px_55px_-35px_rgba(56,189,248,0.55)] transition-all duration-500 ${
        isClosing ? "translate-x-6 scale-[0.98] opacity-0" : "opacity-100"
      } ${cardStatus === "processing" ? "pointer-events-none opacity-70" : ""}`}
    >
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${styles.ring}`} />

      {resolvedAs !== "idle" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/72 backdrop-blur-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {resolvedAs === "approved" ? "אושר" : "נדחה"}
          </div>
        </div>
      )}

      <div className="relative z-10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${styles.pill}`}>
            {styles.label}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${PRIORITY_PILL[rec.priority]}`}>
            {PRIORITY_LABEL[rec.priority]}
          </span>
          {rec.accountName && (
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">
              {rec.accountName}
            </span>
          )}
          <span className="ml-auto text-[11px] font-semibold text-slate-400">
            {Math.round(rec.confidence * 100)}% ביטחון
          </span>
        </div>

        <h3 className="text-[15px] font-semibold leading-snug text-slate-100">{rec.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          {rec.uiDisplayText || rec.why || rec.reasoning}
        </p>

        {rec.expectedImpact?.summary && (
          <div className="mt-3 rounded-xl border border-slate-700/80 bg-[#111a33] px-3 py-2 text-xs text-slate-200">
            <span className="font-semibold text-slate-100">השפעה צפויה: </span>
            {rec.expectedImpact.summary}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {metrics.spend != null && metrics.spend > 0 && (
            <MetricChip label="ספנד" value={`$${metrics.spend.toFixed(0)}`} />
          )}
          {metrics.roas != null && metrics.roas > 0 && (
            <MetricChip label="ROAS" value={`${metrics.roas.toFixed(2)}x`} />
          )}
          {metrics.cpa != null && metrics.cpa > 0 && (
            <MetricChip label="עלות לרכישה" value={`$${metrics.cpa.toFixed(0)}`} />
          )}
          {metrics.ctr != null && metrics.ctr > 0 && (
            <MetricChip label="CTR" value={`${metrics.ctr.toFixed(2)}%`} />
          )}
        </div>

        {(rec.type === "creative_optimization" || rec.type === "creative_copy") &&
          rec.suggestedContent?.creativeCopy && !editing && (
            <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
              {rec.suggestedContent.creativeCopy}
            </div>
          )}

        {(rec.type === "creative_optimization" || rec.type === "creative_copy") && !editing && (
          <NanoBananaGallery
            images={rec.nanoBananaImages ?? []}
            generatedAt={rec.nanoBananaGeneratedAt}
          />
        )}

        {rec.suggestedContent?.audienceSuggestions?.length && !editing ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {rec.suggestedContent.audienceSuggestions.map((suggestion, index) => (
              <span
                key={`${suggestion}-${index}`}
                className="rounded-full border border-cyan-400/20 bg-cyan-500/12 px-2.5 py-1 text-xs text-cyan-100"
              >
                {suggestion}
              </span>
            ))}
          </div>
        ) : null}

        {rec.reasoning && rec.reasoning !== rec.uiDisplayText && (
          <div className="mt-3">
            <button
              onClick={() => setExpandedReasoning((value) => !value)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              {expandedReasoning ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expandedReasoning ? "הסתר הסבר" : "הצג הסבר"}
            </button>
            {expandedReasoning && (
              <p className="mt-2 rounded-xl border border-slate-700/80 bg-[#101833] p-3 text-xs leading-relaxed text-slate-300">
                {rec.reasoning}
              </p>
            )}
          </div>
        )}

        {editing && (
          <div className="mt-4 space-y-3 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">
                עריכה לפני ביצוע
              </p>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {rec.executionPlan?.action === "adjust_budget" && (
              <label className="block">
                <span className="text-xs font-medium text-slate-200">שינוי תקציב (%)</span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={editDelta}
                  onChange={(event) => setEditDelta(Number(event.target.value))}
                  className="mt-2 w-full accent-indigo-400"
                />
                <p className="text-xs font-semibold text-slate-300">
                  {editDelta > 0 ? "+" : ""}
                  {editDelta}%
                </p>
              </label>
            )}

            {(rec.type === "creative_optimization" || rec.type === "creative_copy") && (
              <label className="block">
                <span className="text-xs font-medium text-slate-200">טקסט קריאייטיב</span>
                <textarea
                  rows={3}
                  value={editCopy}
                  onChange={(event) => setEditCopy(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
              </label>
            )}

            {(rec.type === "audience_optimization" ||
              rec.type === "audience_build" ||
              rec.type === "audience_discovery" ||
              rec.type === "targeting_optimization") && (
              <label className="block">
                <span className="text-xs font-medium text-slate-200">הצעות קהל</span>
                <input
                  value={editAudience}
                  onChange={(event) => setEditAudience(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
              </label>
            )}

            <button
              onClick={handleSaveAndExecute}
              disabled={busy || cardStatus === "processing"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {cardStatus === "processing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              שמירה וביצוע
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
            {errorMsg}
          </div>
        )}

        {rec.status === "pending" && !editing && (
          <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-slate-800 bg-[#080f23]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              {isGhostDraft && rec.metadata?.draftId && (
                <Link
                  to={`/campaign-builder?draftId=${encodeURIComponent(rec.metadata.draftId)}${
                    rec.accountId ? `&accountId=${encodeURIComponent(rec.accountId)}` : ""
                  }`}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/12 px-3 text-sm font-medium text-indigo-100 hover:bg-indigo-500/20 sm:w-auto"
                >
                  <ExternalLink className="h-4 w-4" />
                  מעבר לטיוטה
                </Link>
              )}

              <button
                onClick={handleDismiss}
                disabled={busy || cardStatus === "processing"}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0f1732] px-3 text-sm font-medium text-slate-200 hover:bg-[#151f40] sm:w-auto"
              >
                <XCircle className="h-4 w-4" />
                דחייה
              </button>

              <button
                onClick={() => setEditing(true)}
                disabled={busy || cardStatus === "processing"}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0f1732] px-3 text-sm font-medium text-slate-200 hover:bg-[#151f40] sm:w-auto"
              >
                <Pencil className="h-4 w-4" />
                עריכה
              </button>

              <button
                onClick={handleApprove}
                disabled={busy || cardStatus === "processing"}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50 sm:ml-auto sm:w-auto ${styles.approve}`}
              >
                {cardStatus === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {variant === "kill"
                  ? "עצירה"
                  : variant === "ab_test"
                  ? "אישור טסט"
                  : canExecute
                  ? "אישור וביצוע"
                  : "אישור"}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ABTestCard({
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
  const [editing, setEditing] = useState(false);
  const [cardStatus, setCardStatus] = useState<CardStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [hidden, setHidden] = useState(false);

  const setup = rec.suggestedContent?.testSetup;
  const control = rec.suggestedContent?.abTest?.control;
  const variant = rec.suggestedContent?.abTest?.variant;
  const variantSettings = (rec.executionPlan?.variantSettings ??
    setup?.variantSettings ??
    {}) as Record<string, unknown>;

  const [budget, setBudget] = useState(
    Number(rec.executionPlan?.recommendedTestBudget ?? setup?.recommendedTestBudget ?? 50)
  );
  const [customAudiences, setCustomAudiences] = useState(
    Array.isArray(variantSettings.custom_audiences)
      ? (variantSettings.custom_audiences as unknown[]).map((value) => String(value)).join(", ")
      : ""
  );
  const [interests, setInterests] = useState(
    Array.isArray(variantSettings.interests)
      ? (variantSettings.interests as unknown[]).map((value) => String(value)).join(", ")
      : ""
  );

  const modifications = (): RecommendationModifications => {
    const parsedCustom = customAudiences
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const parsedInterests = interests
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const nextVariantSettings = {
      ...variantSettings,
      custom_audiences: parsedCustom,
      interests: parsedInterests,
    };

    return {
      recommendedTestBudget: budget,
      variantSettings: nextVariantSettings,
      testSetup: {
        ...(setup ?? {}),
        recommendedTestBudget: budget,
        variantSettings: nextVariantSettings,
      },
    };
  };

  const finish = () => {
    window.setTimeout(() => setIsClosing(true), 360);
    window.setTimeout(() => setHidden(true), 800);
  };

  const handleApprove = async () => {
    setCardStatus("processing");
    setErrorMsg("");
    try {
      if (rec.executionPlan?.action && rec.executionPlan.action !== "none") {
        await onApproveAndExecute(rec.id, modifications());
      } else {
        await onApprove(rec.id, modifications());
      }
      finish();
    } catch (err: unknown) {
      setCardStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "ביצוע טסט A/B נכשל.");
    }
  };

  const handleDismiss = () => {
    setCardStatus("processing");
    onReject(rec.id);
    finish();
  };

  if (hidden) {
    return null;
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-amber-400/35 bg-[#090f24] px-4 py-4 shadow-[0_20px_55px_-35px_rgba(245,158,11,0.6)] transition-all duration-500 ${
        isClosing ? "translate-x-6 scale-[0.98] opacity-0" : "opacity-100"
      } ${cardStatus === "processing" ? "pointer-events-none opacity-70" : ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-400/35 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-100">
          טסט A/B
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${PRIORITY_PILL[rec.priority]}`}>
          {PRIORITY_LABEL[rec.priority]}
        </span>
        <span className="ml-auto text-[11px] font-semibold text-slate-400">
          {Math.round(rec.confidence * 100)}% ביטחון
        </span>
      </div>

      <h3 className="text-[15px] font-semibold text-slate-100">{rec.title}</h3>
      <p className="mt-1 text-sm text-slate-300">{rec.uiDisplayText || rec.reasoning}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-[#0f1732] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            בקרה
          </p>
          <p className="mt-1 text-sm font-medium text-slate-100">
            {String(control?.name ?? control?.targeting ?? setup?.controlAdsetId ?? "הגדרה קיימת")}
          </p>
          {setup?.controlAdsetId && (
            <p className="mt-1 text-xs text-slate-400">קבוצת מודעות: {setup.controlAdsetId}</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/12 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
            וריאנט
          </p>
          <p className="mt-1 text-sm font-medium text-amber-100">
            {String(variant?.targeting ?? "וריאנט טרגוט מוצע על ידי AI")}
          </p>
          <p className="mt-1 text-xs text-amber-200/90">
            תקציב: <span className="ltr">${budget}/יום</span>
          </p>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 rounded-2xl border border-amber-400/25 bg-[#131933] p-3">
          <label className="block text-xs font-medium text-slate-200">
            תקציב טסט (USD/יום)
            <input
              type="number"
              min={1}
              value={budget}
              onChange={(event) => setBudget(Math.max(1, Number(event.target.value || 1)))}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-xs font-medium text-slate-200">
            קהלים מותאמים
            <input
              type="text"
              value={customAudiences}
              onChange={(event) => setCustomAudiences(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-xs font-medium text-slate-200">
            תחומי עניין
            <input
              type="text"
              value={interests}
              onChange={(event) => setInterests(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
          {errorMsg}
        </div>
      )}

      {rec.status === "pending" && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-slate-800 bg-[#090f24]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0">
          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
            <button
              onClick={handleDismiss}
              disabled={busy || cardStatus === "processing"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#101935] px-3 text-sm font-medium text-slate-100 hover:bg-[#182345] sm:w-auto"
            >
              <XCircle className="h-4 w-4" />
              דחייה
            </button>
            <button
              onClick={() => setEditing((value) => !value)}
              disabled={busy || cardStatus === "processing"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#101935] px-3 text-sm font-medium text-slate-100 hover:bg-[#182345] sm:w-auto"
            >
              <Pencil className="h-4 w-4" />
              עריכת פרמטרים
            </button>
            <button
              onClick={handleApprove}
              disabled={busy || cardStatus === "processing"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 sm:ml-auto sm:w-auto"
            >
              {cardStatus === "processing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4" />
              )}
              אישור טסט
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function RecentSection({ items }: { items: Recommendation[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#080f23]">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900/40"
      >
        הושלמו ({items.length})
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="divide-y divide-slate-800 border-t border-slate-800">
          {items.slice(0, 10).map((rec) => {
            const variant = getVariant(rec);
            const style = VARIANT_STYLES[variant];
            return (
              <div key={rec.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${style.pill}`}>
                  {style.label}
                </span>
                <p className="flex-1 truncate text-slate-300">{rec.title}</p>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                  {statusLabel(rec.status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActionFeed({
  recommendations,
  groups,
  loading,
  busy,
  onApprove,
  onApproveAndExecute,
  onReject,
}: ActionFeedProps) {
  const pending = recommendations.filter((item) => item.status === "pending");
  const recent = recommendations.filter((item) => item.status !== "pending");

  const sorted = useMemo(() => {
    const rank: Record<Recommendation["priority"], number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return [...pending].sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [pending]);

  const highCount = pending.filter((item) => item.priority === "high").length;

  const morning = groups?.morning ?? [];
  const evening = groups?.evening ?? [];
  const other = groups?.other ?? [];
  const hasGroups = morning.length > 0 || evening.length > 0;

  const renderCard = (rec: Recommendation) => {
    if (rec.type === "ab_test") {
      return (
        <ABTestCard
          key={rec.id}
          rec={rec}
          busy={busy}
          onApprove={onApprove}
          onApproveAndExecute={onApproveAndExecute}
          onReject={onReject}
        />
      );
    }

    return (
      <TaskCard
        key={rec.id}
        rec={rec}
        busy={busy}
        onApprove={onApprove}
        onApproveAndExecute={onApproveAndExecute}
        onReject={onReject}
      />
    );
  };

  if (loading) {
    return (
      <div className="panel space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-800/80" />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <header className="panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">תיבת החלטות AI</h2>
          <span className="rounded-full border border-[var(--line-strong)] bg-[var(--bg-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
            {pending.length} ממתינות
          </span>
          {highCount > 0 && (
            <span className="rounded-full border border-rose-400/35 bg-rose-500/12 px-2.5 py-1 text-xs font-semibold text-rose-200">
              {highCount} דחופות
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          אישור או דחייה מהירה של המלצות, בפורמט תפעולי נקי.
        </p>
      </header>

      {sorted.length === 0 && recent.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-[#080f23] px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20">
            <Brain className="h-6 w-6 text-indigo-200" />
          </div>
          <p className="text-base font-semibold text-slate-100">אין משימות פתוחות כרגע</p>
          <p className="mt-1 text-sm text-slate-400">הניטור ממשיך לרוץ על החשבונות הפעילים שלך.</p>
        </div>
      )}

      {hasGroups ? (
        <div className="space-y-4">
          {morning.length > 0 && (
            <div className="space-y-3">
              <SectionTitle title="בוקר: פעולות צמיחה" count={morning.length} tone="text-amber-200" />
              {morning.map((item) => renderCard(item))}
            </div>
          )}

          {evening.length > 0 && (
            <div className="space-y-3">
              <SectionTitle title="ערב: בקרת סיכון" count={evening.length} tone="text-cyan-200" />
              {evening.map((item) => renderCard(item))}
            </div>
          )}

          {other.length > 0 && <div className="space-y-3">{other.map((item) => renderCard(item))}</div>}
        </div>
      ) : (
        <div className="space-y-3">{sorted.map((item) => renderCard(item))}</div>
      )}

      {recent.length > 0 && <RecentSection items={recent} />}
    </section>
  );
}
