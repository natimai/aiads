import { useState } from "react";
import { FileText, Download, Play, Clock, Settings2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReports, generateReport, getReportConfigs, saveReportConfig } from "../services/api";

export default function Reports() {
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
    staleTime: 5 * 60 * 1000,
  });

  const { data: configs } = useQuery({
    queryKey: ["reportConfigs"],
    queryFn: getReportConfigs,
  });

  const generate = useMutation({
    mutationFn: generateReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500">Auto-generated performance reports</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Settings2 className="h-4 w-4" />
            Configure
          </button>
          <button
            onClick={() => generate.mutate("daily")}
            disabled={generate.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            <Play className="h-4 w-4" />
            Generate Daily Report
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Report Schedule</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Daily Report Time</label>
              <input
                type="time"
                defaultValue={configs?.[0]?.scheduleTime ?? "08:00"}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Timezone</label>
              <select className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400">
                <option>UTC</option>
                <option>Asia/Jerusalem</option>
                <option>America/New_York</option>
                <option>Europe/London</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Delivery Channels</label>
              <div className="flex gap-3 pt-1">
                {["Telegram", "Email"].map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" defaultChecked={ch === "Telegram"} className="rounded border-slate-300 accent-indigo-600" />
                    {ch}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white skeleton" />
          ))}
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue/10">
                  <FileText className="h-5 w-5 text-accent-blue" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {report.type === "daily" ? "Daily" : "Weekly"} Report
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      report.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {report.status}
                    </span>
                  </div>
                </div>
              </div>
              {report.downloadUrl && (
                <a
                  href={report.downloadUrl}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16">
          <FileText className="mb-4 h-12 w-12 text-slate-600" />
          <p className="text-sm text-slate-400">No reports generated yet</p>
          <p className="text-xs text-slate-500">Reports will appear here after generation</p>
        </div>
      )}
    </div>
  );
}
