import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { InsightData } from "../../types";

interface PerformanceChartProps {
  data: InsightData[];
  loading?: boolean;
}

const METRICS = [
  { key: "spend", label: "Spend", color: "#3b82f6", yAxisId: "left" },
  { key: "cpi", label: "CPI", color: "#ef4444", yAxisId: "right" },
  { key: "roas", label: "ROAS", color: "#22c55e", yAxisId: "right" },
  { key: "ctr", label: "CTR %", color: "#eab308", yAxisId: "right" },
  { key: "cpm", label: "CPM", color: "#a855f7", yAxisId: "right" },
];

export function PerformanceChart({ data, loading }: PerformanceChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(["spend", "cpi"])
  );

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
        <div className="mb-4 h-5 w-40 rounded bg-slate-800 skeleton" />
        <div className="h-64 rounded bg-slate-800 skeleton" />
      </div>
    );
  }

  interface Aggregated { spend: number; impressions: number; clicks: number; installs: number; purchaseValue: number; }
  const aggregated = data.reduce<Record<string, Aggregated>>((acc, d) => {
    const date = d.date;
    if (!acc[date]) acc[date] = { spend: 0, impressions: 0, clicks: 0, installs: 0, purchaseValue: 0 };
    const row = acc[date]!;
    row.spend += d.spend;
    row.impressions += d.impressions;
    row.clicks += d.clicks;
    row.installs += d.installs ?? 0;
    row.purchaseValue += d.purchaseValue ?? 0;
    return acc;
  }, {});

  const chartData = Object.entries(aggregated)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5),
      spend: Number(v.spend.toFixed(2)),
      cpi: v.installs > 0 ? Number((v.spend / v.installs).toFixed(2)) : 0,
      roas: v.spend > 0 ? Number((v.purchaseValue / v.spend).toFixed(2)) : 0,
      ctr: v.impressions > 0 ? Number(((v.clicks / v.impressions) * 100).toFixed(2)) : 0,
      cpm: v.impressions > 0 ? Number(((v.spend / v.impressions) * 1000).toFixed(2)) : 0,
    }));

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Performance Over Time</h3>
        <div className="flex gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeMetrics.has(m.key)
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              style={{
                backgroundColor: activeMetrics.has(m.key) ? `${m.color}20` : "transparent",
                borderColor: activeMetrics.has(m.key) ? `${m.color}40` : "transparent",
                borderWidth: 1,
              }}
            >
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
            <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#e2e8f0" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Legend />
            {METRICS.filter((m) => activeMetrics.has(m.key)).map((m) => (
              <Line
                key={m.key}
                yAxisId={m.yAxisId}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name={m.label}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          No data available for the selected period
        </div>
      )}
    </div>
  );
}
