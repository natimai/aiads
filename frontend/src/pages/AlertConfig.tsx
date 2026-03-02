import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlertConfigs, useSaveAlertConfig, useDeleteAlertConfig } from "../hooks/useAlerts";
import { useAccounts } from "../contexts/AccountContext";
import type { AlertType } from "../types";

const ALERT_TYPES: { value: AlertType; label: string; description: string; defaultThreshold: number }[] = [
  { value: "roas_drop", label: "ROAS Drop", description: "Triggers when ROAS falls below threshold", defaultThreshold: 1.5 },
  { value: "creative_fatigue", label: "Creative Fatigue", description: "Detects declining creative performance (frequency threshold)", defaultThreshold: 3.0 },
  { value: "budget_anomaly", label: "Budget Anomaly", description: "Alerts on spend deviations from expected budget (%)", defaultThreshold: 30 },
  { value: "cpi_spike", label: "CPI Spike", description: "Triggers when CPI exceeds threshold value", defaultThreshold: 5.0 },
  { value: "campaign_status", label: "Campaign Status", description: "Alerts on campaign paused/rejected/issues", defaultThreshold: 0 },
];

export default function AlertConfig() {
  const { accounts } = useAccounts();
  const { data: configs, isLoading } = useAlertConfigs();
  const saveConfig = useSaveAlertConfig();
  const deleteConfig = useDeleteAlertConfig();
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  const handleToggle = (alertType: AlertType, enabled: boolean) => {
    if (!selectedAccount) return;
    const existing = configs?.find(
      (c) => c.alertType === alertType && c.accountId === selectedAccount
    );
    saveConfig.mutate({
      id: existing?.id,
      accountId: selectedAccount,
      alertType,
      enabled,
      threshold: existing?.threshold ?? ALERT_TYPES.find((t) => t.value === alertType)!.defaultThreshold,
      cooldownHours: existing?.cooldownHours ?? 6,
      channels: existing?.channels ?? ["telegram"],
    });
  };

  const handleThresholdChange = (alertType: AlertType, threshold: number) => {
    if (!selectedAccount) return;
    const existing = configs?.find(
      (c) => c.alertType === alertType && c.accountId === selectedAccount
    );
    saveConfig.mutate({
      id: existing?.id,
      accountId: selectedAccount,
      alertType,
      enabled: existing?.enabled ?? true,
      threshold,
      cooldownHours: existing?.cooldownHours ?? 6,
      channels: existing?.channels ?? ["telegram"],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/alerts" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-white">Alert Configuration</h2>
          <p className="text-sm text-slate-400">Configure alert thresholds and delivery channels</p>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">Select Account</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-700 bg-navy-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent-blue"
        >
          <option value="">Choose an account...</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>{acc.accountName}</option>
          ))}
        </select>
      </div>

      {selectedAccount && (
        <div className="space-y-4">
          {ALERT_TYPES.map((alertType) => {
            const config = configs?.find(
              (c) => c.alertType === alertType.value && c.accountId === selectedAccount
            );
            const isEnabled = config?.enabled ?? false;
            const threshold = config?.threshold ?? alertType.defaultThreshold;
            const cooldown = config?.cooldownHours ?? 6;

            return (
              <div
                key={alertType.value}
                className="rounded-xl border border-slate-800 bg-navy-900 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">{alertType.label}</h3>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => handleToggle(alertType.value, e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="h-5 w-9 rounded-full bg-slate-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-blue peer-checked:after:translate-x-full" />
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{alertType.description}</p>
                  </div>
                </div>

                {alertType.value !== "campaign_status" && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">Threshold</label>
                      <input
                        type="number"
                        step="0.1"
                        value={threshold}
                        onChange={(e) => handleThresholdChange(alertType.value, parseFloat(e.target.value) || 0)}
                        className="w-full rounded-md border border-slate-600 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-accent-blue"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">Cooldown (hours)</label>
                      <input
                        type="number"
                        value={cooldown}
                        onChange={() => {}}
                        className="w-full rounded-md border border-slate-600 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-accent-blue"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">Channels</label>
                      <div className="flex gap-2 pt-1">
                        {["telegram", "email", "sms"].map((ch) => (
                          <label key={ch} className="flex items-center gap-1.5 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              defaultChecked={ch === "telegram"}
                              className="rounded border-slate-600 bg-navy-800"
                            />
                            {ch}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {config?.id && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => deleteConfig.mutate(config.id!)}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
