import { AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import type { DiagnosisReport, RootCause } from "../../types";

const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  learning_instability: "חוסר יציבות בשלב למידה",
  auction_cost_pressure: "לחץ עלויות מכרז",
  creative_fatigue: "עייפות קריאייטיב",
  audience_saturation: "רוויית קהל",
  pacing_constraint: "מגבלת קצב",
  restrictive_bidding: "הגבלת הצעות מחיר",
  post_click_funnel_issue: "בעיה בפאנל אחרי קליק",
  signal_quality_issue: "בעיית איכות סיגנל",
  auction_overlap: "חפיפת מכרזים",
  breakdown_effect_risk: "סיכון אפקט פירוק",
  healthy: "בריא",
  unknown: "לא ידוע",
};

const ROOT_CAUSE_STYLES: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unknown: "bg-gray-50 text-gray-700 border-gray-200",
  learning_instability: "bg-amber-50 text-amber-700 border-amber-200",
  creative_fatigue: "bg-orange-50 text-orange-700 border-orange-200",
};

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-600";
  if (confidence >= 0.4) return "text-amber-600";
  return "text-rose-600";
}

export function DiagnosisSummaryCard({ diagnosis }: { diagnosis: DiagnosisReport }) {
  const causeStyle =
    ROOT_CAUSE_STYLES[diagnosis.rootCause] ||
    "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      {/* Top row: root cause badge + meta info */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${causeStyle}`}>
            {ROOT_CAUSE_LABELS[diagnosis.rootCause] || diagnosis.rootCause}
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {diagnosis.evaluationLevel === "campaign" ? "רמת קמפיין" : "רמת אדסט"}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          {/* Confidence */}
          <span className={`font-medium ${confidenceColor(diagnosis.confidence)}`}>
            ביטחון: {Math.round(diagnosis.confidence * 100)}%
          </span>
          {/* Source */}
          <span className="capitalize">{diagnosis.source}</span>
          {/* Stale warning */}
          {diagnosis.dataFreshness?.isStale && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              נתונים לא עדכניים
            </span>
          )}
        </div>
      </div>

      {/* Summary text */}
      <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-4">
        {diagnosis.summary}
      </p>

      {/* Alignment badge */}
      <AlignmentRow diagnosis={diagnosis} />

      {/* Freshness detail */}
      {diagnosis.dataFreshness && (
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
          <FreshnessItem label="Insights" syncedAt={diagnosis.dataFreshness.insightsSyncedAt} />
          <FreshnessItem label="Structures" syncedAt={diagnosis.dataFreshness.structuresSyncedAt} />
          <FreshnessItem label="Breakdowns" syncedAt={diagnosis.dataFreshness.breakdownsSyncedAt} />
        </div>
      )}
    </div>
  );
}

function AlignmentRow({ diagnosis }: { diagnosis: DiagnosisReport }) {
  const alignment = diagnosis.officialAlignment;
  if (!alignment) return null;

  let icon: React.ReactNode;
  let label: string;
  let style: string;

  if (!alignment.checked) {
    icon = <HelpCircle className="h-3.5 w-3.5" />;
    label = alignment.unavailableReason === "api_error"
      ? "המלצות רשמיות לא זמינות"
      : "לא נבדק";
    style = "text-gray-500 bg-gray-50 border-gray-200";
  } else if (alignment.officialCount === 0) {
    icon = <HelpCircle className="h-3.5 w-3.5" />;
    label = "אין המלצות רשמיות פעילות";
    style = "text-gray-500 bg-gray-50 border-gray-200";
  } else {
    icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    label = `${alignment.officialCount} המלצות רשמיות נטענו`;
    style = "text-blue-600 bg-blue-50 border-blue-200";
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2.5 ${style}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-medium">{label}</p>
        {alignment.rationale && (
          <p className="mt-0.5 text-[10px] opacity-80">{alignment.rationale}</p>
        )}
      </div>
    </div>
  );
}

function FreshnessItem({ label, syncedAt }: { label: string; syncedAt: string | null }) {
  if (!syncedAt) {
    return (
      <span className="flex items-center gap-1 text-rose-500">
        <Clock className="h-2.5 w-2.5" />
        {label}: לא סונכרן
      </span>
    );
  }

  const age = Date.now() - new Date(syncedAt).getTime();
  const minutes = Math.round(age / 60000);
  const display = minutes < 60
    ? `${minutes} דקות`
    : `${Math.round(minutes / 60)} שעות`;
  const color = minutes > 120 ? "text-rose-500" : minutes > 30 ? "text-amber-500" : "text-emerald-500";

  return (
    <span className={`flex items-center gap-1 ${color}`}>
      <Clock className="h-2.5 w-2.5" />
      {label}: לפני {display}
    </span>
  );
}
