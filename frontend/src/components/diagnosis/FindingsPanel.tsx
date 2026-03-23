import { AlertTriangle, FlaskConical, Eye, TrendingDown, TrendingUp } from "lucide-react";
import type { DiagnosisFinding, RiskLevel } from "../../types";

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", label: "סיכון גבוה" },
  medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "סיכון בינוני" },
  low: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "סיכון נמוך" },
};

const FRAMING_STYLES: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
  hypothesis: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    label: "השערה",
    icon: <FlaskConical className="h-2.5 w-2.5" />,
  },
  observation: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    label: "תצפית",
    icon: <Eye className="h-2.5 w-2.5" />,
  },
};

function formatEvidenceValue(value: number | string): string {
  if (typeof value === "number") {
    if (value >= 1000) return value.toLocaleString("he-IL");
    if (value % 1 !== 0) return value.toFixed(2);
    return String(value);
  }
  return String(value);
}

function formatMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    cpm: "CPM",
    ctr: "CTR",
    cpc: "CPC",
    cpa: "CPA",
    cpi: "CPI",
    roas: "ROAS",
    frequency: "תדירות",
    reach: "חשיפה",
    spend: "הוצאה",
    impressions: "הופעות",
    clicks: "קליקים",
    conversions: "המרות",
  };
  return labels[key.toLowerCase()] || key;
}

export function FindingsPanel({ findings }: { findings: DiagnosisFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <h4 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">ממצאים</h4>
      <div className="space-y-3">
        {findings.map((finding, i) => (
          <FindingCard key={i} finding={finding} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: DiagnosisFinding }) {
  const risk = finding.riskLevel ? RISK_STYLES[finding.riskLevel] : null;
  const framing = FRAMING_STYLES[finding.actionFraming] || FRAMING_STYLES.observation;
  const confidencePct = Math.round(finding.confidence * 100);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-4">
      {/* Header: title + badges */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h5 className="text-sm font-medium text-[var(--text-primary)]">{finding.title}</h5>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Risk badge */}
          {risk && (
            <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${risk.bg} ${risk.text}`}>
              {finding.riskLevel === "high" && <AlertTriangle className="h-2.5 w-2.5" />}
              {risk.label}
            </span>
          )}
          {/* Framing badge */}
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${framing.bg} ${framing.text}`}>
            {framing.icon}
            {framing.label}
          </span>
          {/* Confidence */}
          <span className={`text-[10px] font-medium ${confidencePct >= 70 ? "text-emerald-600" : confidencePct >= 40 ? "text-amber-600" : "text-rose-600"}`}>
            {confidencePct}%
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
        {finding.interpretation}
      </p>

      {/* Evidence pills */}
      {finding.evidence && Object.keys(finding.evidence).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(finding.evidence).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
            >
              <span className="font-medium">{formatMetricLabel(k)}</span>
              <span className="text-[var(--text-muted)]">{formatEvidenceValue(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Action row: suggested action + validation metric */}
      <div className="flex flex-col gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2.5">
        {finding.suggestedAction && (
          <div className="flex items-start gap-2 text-[11px]">
            <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
            <span className="text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">פעולה מוצעת: </span>
              {finding.suggestedAction}
            </span>
          </div>
        )}
        {finding.validationMetric && (
          <div className="flex items-start gap-2 text-[11px]">
            <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
            <span className="text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">מדד אימות: </span>
              {finding.validationMetric}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
