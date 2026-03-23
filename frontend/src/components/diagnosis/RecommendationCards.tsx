import { Lightbulb, FlaskConical, Eye, AlertTriangle, CheckCircle2, Target } from "lucide-react";
import type { DiagnosisFinding, BreakdownHypothesis, RiskLevel } from "../../types";

const RISK_COLORS: Record<RiskLevel, string> = {
  high: "border-rose-200 bg-rose-50/40",
  medium: "border-amber-200 bg-amber-50/40",
  low: "border-emerald-200 bg-emerald-50/40",
};

const RISK_TEXT: Record<RiskLevel, string> = {
  high: "text-rose-600",
  medium: "text-amber-600",
  low: "text-emerald-600",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  high: "סיכון גבוה",
  medium: "סיכון בינוני",
  low: "סיכון נמוך",
};

/**
 * Renders actionable recommendation cards derived from findings and breakdown hypotheses.
 * Only findings with suggestedAction are shown as recommendation cards.
 */
export function RecommendationCards({
  findings,
  breakdownHypotheses,
}: {
  findings: DiagnosisFinding[];
  breakdownHypotheses: BreakdownHypothesis[];
}) {
  const actionableFindings = findings.filter((f) => f.suggestedAction && f.suggestedAction.length > 0);

  if (actionableFindings.length === 0 && breakdownHypotheses.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-4 w-4 text-[var(--text-secondary)]" />
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">המלצות פעולה</h4>
      </div>

      <div className="space-y-3">
        {actionableFindings.map((finding, i) => (
          <ActionCard key={`f-${i}`} finding={finding} />
        ))}
        {breakdownHypotheses.map((hyp, i) => (
          <BreakdownCard key={`b-${i}`} hypothesis={hyp} />
        ))}
      </div>
    </div>
  );
}

function ActionCard({ finding }: { finding: DiagnosisFinding }) {
  const risk = finding.riskLevel || "medium";
  const isHypothesis = finding.actionFraming === "hypothesis";

  return (
    <div className={`rounded-lg border p-4 ${RISK_COLORS[risk]}`}>
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h5 className="text-sm font-medium text-[var(--text-primary)]">{finding.title}</h5>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`flex items-center gap-1 text-[10px] font-medium ${RISK_TEXT[risk]}`}>
            {risk === "high" && <AlertTriangle className="h-2.5 w-2.5" />}
            {risk === "low" && <CheckCircle2 className="h-2.5 w-2.5" />}
            {RISK_LABELS[risk]}
          </span>
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${isHypothesis ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
            {isHypothesis ? <FlaskConical className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {isHypothesis ? "השערה" : "תצפית"}
          </span>
        </div>
      </div>

      {/* Why this matters */}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
        {finding.interpretation}
      </p>

      {/* Action */}
      <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2.5 space-y-1.5">
        <div className="flex items-start gap-2 text-[11px]">
          <Target className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
          <span className="text-[var(--text-primary)] font-medium">{finding.suggestedAction}</span>
        </div>
        {finding.validationMetric && (
          <p className="text-[10px] text-[var(--text-muted)] mr-5">
            מדד אימות: {finding.validationMetric}
          </p>
        )}
      </div>

      {/* Confidence footer */}
      <div className="mt-2 flex items-center justify-between">
        <div className="h-1 flex-1 rounded-full bg-[var(--line)] overflow-hidden ml-3">
          <div
            className={`h-full rounded-full ${finding.confidence >= 0.7 ? "bg-emerald-400" : finding.confidence >= 0.4 ? "bg-amber-400" : "bg-rose-400"}`}
            style={{ width: `${Math.round(finding.confidence * 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
          ביטחון: {Math.round(finding.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}

function BreakdownCard({ hypothesis }: { hypothesis: BreakdownHypothesis }) {
  const dimensionLabels: Record<string, string> = {
    age: "גיל",
    gender: "מגדר",
    placement: "מיקום",
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
            {dimensionLabels[hypothesis.dimension] || hypothesis.dimension}
          </span>
          <h5 className="text-sm font-medium text-[var(--text-primary)]">{hypothesis.segment}</h5>
        </div>
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
          <FlaskConical className="h-2.5 w-2.5" />
          השערה לבדיקה
        </span>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-1">{hypothesis.observation}</p>
      <p className="text-xs text-[var(--text-muted)] italic mb-2">{hypothesis.hypothesis}</p>

      {hypothesis.testPlan && (
        <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2.5">
          <div className="flex items-start gap-2 text-[11px]">
            <FlaskConical className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
            <span className="text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">תכנית בדיקה: </span>
              {hypothesis.testPlan}
            </span>
          </div>
        </div>
      )}

      <div className="mt-2 text-[10px] text-[var(--text-muted)]">
        ביטחון: {Math.round(hypothesis.confidence * 100)}%
      </div>
    </div>
  );
}
