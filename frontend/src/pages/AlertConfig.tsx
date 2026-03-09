import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlertConfigs, useSaveAlertConfig, useDeleteAlertConfig } from "../hooks/useAlerts";
import { useAccounts } from "../contexts/AccountContext";
import type { AlertType } from "../types";

const ALERT_TYPES: { value: AlertType; label: string; description: string; defaultThreshold: number }[] = [
  { value: "roas_drop", label: "ירידת ROAS", description: "מופעל כאשר ROAS יורד מתחת לסף", defaultThreshold: 1.5 },
  { value: "creative_fatigue", label: "עייפות קריאייטיב", description: "מופעל כשהביצועים נחלשים לאורך זמן", defaultThreshold: 3.0 },
  { value: "budget_anomaly", label: "חריגת תקציב", description: "זיהוי סטייה חריגה מהוצאות רגילות", defaultThreshold: 30 },
  { value: "cpi_spike", label: "עלייה ב-CPI", description: "מופעל כשעלות התקנה חורגת מהסף", defaultThreshold: 5.0 },
  { value: "campaign_status", label: "סטטוס קמפיין", description: "התראות על עצירה, דחייה או תקלה", defaultThreshold: 0 },
];

type ConfigDraft = {
  id?: string;
  enabled: boolean;
  threshold: number;
  cooldownHours: number;
  channels: string[];
};

export default function AlertConfig() {
  const { accounts } = useAccounts();
  const { data: configs } = useAlertConfigs();
  const saveConfig = useSaveAlertConfig();
  const deleteConfig = useDeleteAlertConfig();
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<AlertType, ConfigDraft>>({} as Record<AlertType, ConfigDraft>);

  const accountConfigs = useMemo(
    () => configs?.filter((item) => item.accountId === selectedAccount) ?? [],
    [configs, selectedAccount]
  );

  useEffect(() => {
    if (!selectedAccount) return;

    const nextDrafts = ALERT_TYPES.reduce((acc, typeItem) => {
      const existing = accountConfigs.find((item) => item.alertType === typeItem.value);
      acc[typeItem.value] = {
        id: existing?.id,
        enabled: existing?.enabled ?? false,
        threshold: existing?.threshold ?? typeItem.defaultThreshold,
        cooldownHours: existing?.cooldownHours ?? 6,
        channels: existing?.channels?.length ? existing.channels : ["telegram"],
      };
      return acc;
    }, {} as Record<AlertType, ConfigDraft>);

    setDrafts(nextDrafts);
  }, [selectedAccount, accountConfigs]);

  const setDraftValue = <K extends keyof ConfigDraft>(
    alertType: AlertType,
    key: K,
    value: ConfigDraft[K]
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [alertType]: {
        ...prev[alertType],
        [key]: value,
      },
    }));
  };

  const toggleChannel = (alertType: AlertType, channel: string) => {
    const channels = drafts[alertType]?.channels ?? [];
    const nextChannels = channels.includes(channel)
      ? channels.filter((item) => item !== channel)
      : [...channels, channel];

    setDraftValue(alertType, "channels", nextChannels);
  };

  const handleSave = (alertType: AlertType) => {
    if (!selectedAccount) return;
    const draft = drafts[alertType];
    if (!draft) return;

    saveConfig.mutate({
      id: draft.id,
      accountId: selectedAccount,
      alertType,
      enabled: draft.enabled,
      threshold: draft.threshold,
      cooldownHours: draft.cooldownHours,
      channels: draft.channels,
    });
  };

  const handleDelete = (alertType: AlertType) => {
    const draftId = drafts[alertType]?.id;
    if (!draftId) return;
    deleteConfig.mutate(draftId);
  };

  return (
    <div className="space-y-6 reveal-up">
      <section className="panel p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Link to="/alerts" className="focus-ring rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="section-kicker">Automation Rules</p>
            <h2 className="brand-display text-2xl text-[var(--text-primary)]">תצורת התראות</h2>
            <p className="text-sm text-[var(--text-secondary)]">הגדרת ספים, קירור וערוצי התראה לכל חשבון</p>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">בחירת חשבון</label>
          <select
            value={selectedAccount}
            onChange={(event) => setSelectedAccount(event.target.value)}
            className="focus-ring w-full max-w-xs rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">בחר חשבון...</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountName}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedAccount && (
        <div className="space-y-4">
          {ALERT_TYPES.map((alertType) => {
            const draft = drafts[alertType.value];
            if (!draft) return null;

            const isStatusType = alertType.value === "campaign_status";

            return (
              <article key={alertType.value} className="panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{alertType.label}</h3>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) => setDraftValue(alertType.value, "enabled", event.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="h-5 w-9 rounded-full border border-[var(--line)] bg-[var(--bg-soft)] after:absolute after:right-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-[var(--text-primary)] after:transition-all peer-checked:bg-[var(--accent-2)] peer-checked:after:-translate-x-full" />
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{alertType.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSave(alertType.value)}
                      className="focus-ring btn-secondary inline-flex min-h-10 items-center gap-1 px-3 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      שמירה
                    </button>
                    {draft.id && (
                      <button
                        onClick={() => handleDelete(alertType.value)}
                        className="focus-ring inline-flex min-h-10 items-center gap-1 rounded-xl border border-rose-400/35 bg-rose-500/12 px-3 text-xs font-semibold text-rose-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        מחיקה
                      </button>
                    )}
                  </div>
                </div>

                {!isStatusType && (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field label="סף">
                      <input
                        type="number"
                        step="0.1"
                        value={draft.threshold}
                        onChange={(event) =>
                          setDraftValue(alertType.value, "threshold", parseFloat(event.target.value) || 0)
                        }
                        className="focus-ring ltr w-full rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </Field>

                    <Field label="קירור (שעות)">
                      <input
                        type="number"
                        min={1}
                        value={draft.cooldownHours}
                        onChange={(event) =>
                          setDraftValue(alertType.value, "cooldownHours", Number(event.target.value) || 1)
                        }
                        className="focus-ring ltr w-full rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </Field>

                    <Field label="ערוצי שליחה">
                      <div className="flex gap-3 pt-1">
                        {["telegram", "email", "sms"].map((channel) => (
                          <label key={channel} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <input
                              type="checkbox"
                              checked={draft.channels.includes(channel)}
                              onChange={() => toggleChannel(alertType.value, channel)}
                              className="accent-[var(--accent-2)]"
                            />
                            {channel}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}
