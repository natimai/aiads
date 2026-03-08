import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Download, Play, Clock, Settings2, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReports, generateReport, getReportConfigs, saveReportConfig } from "../services/api";

export default function Reports() {
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);

  const [reportType, setReportType] = useState<"daily" | "weekly">("daily");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [channels, setChannels] = useState<string[]>(["telegram"]);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
    staleTime: 5 * 60 * 1000,
  });

  const { data: configs } = useQuery({
    queryKey: ["reportConfigs"],
    queryFn: getReportConfigs,
  });

  useEffect(() => {
    const current = configs?.find((item) => item.reportType === reportType) ?? configs?.[0];
    if (!current) return;
    setReportType(current.reportType);
    setScheduleTime(current.scheduleTime);
    setTimezone(current.timezone);
    setChannels(current.deliveryChannels?.length ? current.deliveryChannels : ["telegram"]);
  }, [configs]);

  const generate = useMutation({
    mutationFn: generateReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const save = useMutation({
    mutationFn: () =>
      saveReportConfig({
        reportType,
        deliveryChannels: channels,
        scheduleTime,
        timezone,
        enabled: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reportConfigs"] }),
  });

  const sortedReports = useMemo(
    () => [...(reports ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [reports]
  );

  const toggleChannel = (channel: string) => {
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]
    );
  };

  return (
    <div className="space-y-6 reveal-up">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="brand-display text-2xl text-[var(--text-primary)]">דוחות ביצועים</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">הפקה, תזמון והפצה אוטומטית בלחיצה אחת</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowConfig((value) => !value)}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              <Settings2 className="h-4 w-4" />
              הגדרות תזמון
            </button>
            <button
              onClick={() => generate.mutate(reportType)}
              disabled={generate.isPending}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,#5fe8c2_0%,#81b8ff_100%)] px-4 text-sm font-semibold text-[#041325] disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {generate.isPending ? "מייצר דוח..." : "יצירת דוח עכשיו"}
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="panel-soft mt-4 p-4">
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">תצורת הפצה אוטומטית</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <ConfigField label="סוג דוח">
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value as "daily" | "weekly")}
                  className="focus-ring w-full rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="daily">יומי</option>
                  <option value="weekly">שבועי</option>
                </select>
              </ConfigField>

              <ConfigField label="שעת שליחה">
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                  className="focus-ring ltr w-full rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </ConfigField>

              <ConfigField label="אזור זמן">
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="focus-ring w-full rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="Asia/Jerusalem">Asia/Jerusalem</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </ConfigField>

              <ConfigField label="ערוצי הפצה">
                <div className="flex flex-wrap gap-3 pt-1">
                  {["telegram", "email"].map((channel) => (
                    <label key={channel} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel)}
                        onChange={() => toggleChannel(channel)}
                        className="accent-[var(--accent-2)]"
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </ConfigField>
            </div>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "שומר..." : "שמירת תצורה"}
            </button>
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel h-24 skeleton" />
          ))}
        </div>
      ) : sortedReports.length > 0 ? (
        <div className="space-y-3">
          {sortedReports.map((report) => (
            <article key={report.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
                  <FileText className="h-5 w-5 text-[var(--accent-2)]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    דוח {report.type === "daily" ? "יומי" : "שבועי"}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(report.createdAt).toLocaleString("he-IL")}
                    </span>
                    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-0.5">
                      {report.status}
                    </span>
                  </div>
                </div>
              </div>
              {report.downloadUrl && (
                <a
                  href={report.downloadUrl}
                  className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  הורדת PDF
                </a>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel flex flex-col items-center justify-center py-16 text-center">
          <FileText className="mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">טרם נוצרו דוחות</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">לאחר הפקה, הדוחות יופיעו כאן להורדה</p>
        </div>
      )}
    </div>
  );
}

function ConfigField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}
