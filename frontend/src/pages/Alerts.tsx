import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Filter, Settings2 } from "lucide-react";
import { useAlerts, useAcknowledgeAlert } from "../hooks/useAlerts";
import type { AlertSeverity, AlertType } from "../types";

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-400",
  warning: "bg-yellow-400",
  info: "bg-blue-400",
};

const TYPE_LABELS: Record<AlertType, string> = {
  roas_drop: "ROAS Drop",
  creative_fatigue: "Creative Fatigue",
  budget_anomaly: "Budget Anomaly",
  cpi_spike: "CPI Spike",
  campaign_status: "Campaign Status",
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Alerts</h2>
          <p className="text-sm text-slate-400">Monitor and manage campaign alerts</p>
        </div>
        <Link
          to="/alerts/config"
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          <Settings2 className="h-4 w-4" />
          Configure Alerts
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | "")}
          className="rounded-lg border border-slate-700 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AlertType | "")}
          className="rounded-lg border border-slate-700 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none"
        >
          <option value="">All Types</option>
          <option value="roas_drop">ROAS Drop</option>
          <option value="creative_fatigue">Creative Fatigue</option>
          <option value="budget_anomaly">Budget Anomaly</option>
          <option value="cpi_spike">CPI Spike</option>
          <option value="campaign_status">Campaign Status</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-navy-900 skeleton" />
          ))}
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={`${alert.accountId}-${alert.id}`}
              className={`rounded-xl border p-4 transition-colors ${
                alert.acknowledged
                  ? "border-slate-800 bg-navy-900/50 opacity-60"
                  : SEVERITY_STYLES[alert.severity]
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {TYPE_LABELS[alert.type] ?? alert.type}
                      </span>
                      <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs text-slate-400">
                        {alert.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{alert.message}</p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                      {alert.campaignName && <span>Campaign: {alert.campaignName}</span>}
                      {alert.accountName && <span>Account: {alert.accountName}</span>}
                      <span>Value: {alert.actualValue} (threshold: {alert.thresholdValue})</span>
                      <span>{new Date(alert.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledge.mutate({ accountId: alert.accountId, alertId: alert.id })}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-navy-900 py-16">
          <Bell className="mb-4 h-12 w-12 text-slate-600" />
          <p className="text-sm text-slate-400">No alerts found</p>
          <p className="text-xs text-slate-500">Alerts will appear here when triggered</p>
        </div>
      )}
    </div>
  );
}
