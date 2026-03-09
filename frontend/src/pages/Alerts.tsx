import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Filter, Settings2 } from "lucide-react";
import { useAlerts, useAcknowledgeAlert } from "../hooks/useAlerts";
import type { AlertSeverity, AlertType } from "../types";

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: "border-rose-500/35 bg-rose-500/12 text-[var(--text-primary)]",
  warning: "border-amber-500/35 bg-amber-500/12 text-[var(--text-primary)]",
  info: "border-cyan-500/35 bg-cyan-500/12 text-[var(--text-primary)]",
};

const TYPE_LABELS: Record<AlertType, string> = {
  roas_drop: "ירידת ROAS",
  creative_fatigue: "עייפות קריאייטיב",
  budget_anomaly: "חריגת תקציב",
  cpi_spike: "עלייה ב-CPI",
  campaign_status: "סטטוס קמפיין",
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "קריטית",
  warning: "אזהרה",
  info: "מידע",
};

export default function Alerts() {
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "">("");
  const [typeFilter, setTypeFilter] = useState<AlertType | "">("");
  const { data: alerts, isLoading } = useAlerts({
    severity: severityFilter || undefined,
    type: typeFilter || undefined,
    limit: 100,
  });
  const acknowledge = useAcknowledgeAlert();

  return (
    <div className="space-y-6 reveal-up">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Monitor</p>
            <h2 className="brand-display text-2xl text-[var(--text-primary)]">מרכז התראות</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              סדר עבודה: חומרה → השפעה → פעולה.
            </p>
          </div>
          <Link
            to="/alerts/config"
            className="focus-ring btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium"
          >
            <Settings2 className="h-4 w-4" />
            הגדרת התראות
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="חומרה"
            value={severityFilter}
            onChange={(value) => setSeverityFilter(value as AlertSeverity | "")}
            options={[
              { value: "", label: "כל הרמות" },
              { value: "critical", label: "קריטית" },
              { value: "warning", label: "אזהרה" },
              { value: "info", label: "מידע" },
            ]}
          />
          <FilterSelect
            label="סוג התראה"
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as AlertType | "")}
            options={[
              { value: "", label: "כל הסוגים" },
              { value: "roas_drop", label: "ירידת ROAS" },
              { value: "creative_fatigue", label: "עייפות קריאייטיב" },
              { value: "budget_anomaly", label: "חריגת תקציב" },
              { value: "cpi_spike", label: "עלייה ב-CPI" },
              { value: "campaign_status", label: "סטטוס קמפיין" },
            ]}
          />
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel h-28 skeleton" />
          ))}
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article key={`${alert.accountId}-${alert.id}`} className={`panel px-4 py-4 ${SEVERITY_STYLES[alert.severity]}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                      {TYPE_LABELS[alert.type] ?? alert.type}
                    </span>
                    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {SEVERITY_LABELS[alert.severity]}
                    </span>
                    {alert.acknowledged && (
                      <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                        טופל
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{alert.message}</p>
                  <div className="flex flex-wrap gap-3 text-xs opacity-90">
                    {alert.campaignName && <span>קמפיין: {alert.campaignName}</span>}
                    {alert.accountName && <span>חשבון: {alert.accountName}</span>}
                    <span>
                      ערך בפועל: <span className="ltr">{String(alert.actualValue)}</span>
                    </span>
                    <span>
                      סף: <span className="ltr">{String(alert.thresholdValue)}</span>
                    </span>
                    <span>{new Date(alert.createdAt).toLocaleString("he-IL")}</span>
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledge.mutate({ accountId: alert.accountId, alertId: alert.id })}
                    className="focus-ring btn-secondary inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-xs font-medium"
                  >
                    <Check className="h-3.5 w-3.5" />
                    סימון כטופל
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel flex flex-col items-center justify-center py-16 text-center">
          <Bell className="mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">אין התראות פתוחות כרגע</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">כשהמערכת תזהה חריגה, היא תופיע כאן</p>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="panel-soft flex items-center gap-2 px-3 py-2">
      <Filter className="h-4 w-4 text-[var(--text-muted)]" />
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring mr-auto rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1 text-xs text-[var(--text-primary)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
