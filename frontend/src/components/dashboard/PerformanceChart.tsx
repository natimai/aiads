import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-40 rounded bg-slate-100 skeleton" />
        <div className="h-64 rounded bg-slate-100 skeleton" />
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

  const hasLeftAxis = METRICS.filter((m) => activeMetrics.has(m.key) && m.yAxisId === "left").length > 0;
  const hasRightAxis = METRICS.filter((m) => activeMetrics.has(m.key) && m.yAxisId === "right").length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Performance Over Time</h3>
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors border ${
                activeMetrics.has(m.key)
                  ? "text-slate-800"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
              style={{
                backgroundColor: activeMetrics.has(m.key) ? `${m.color}15` : "transparent",
                borderColor: activeMetrics.has(m.key) ? `${m.color}30` : "transparent",
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: hasRightAxis ? 10 : 4, left: hasLeftAxis ? 0 : 4, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
            />
            {hasLeftAxis && (
              <YAxis
                yAxisId="left"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                stroke="transparent"
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
            )}
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                stroke="transparent"
                axisLine={false}
                tickLine={false}
              />
            )}
            <Tooltip
              cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: "#1e293b", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "#64748b", padding: "1px 0" }}
              formatter={(value: number, name: string) => {
                const metric = METRICS.find((m) => m.label === name);
                if (!metric) return [value, name];
                if (metric.key === "spend" || metric.key === "cpi" || metric.key === "cpm")
                  return [`$${value.toLocaleString()}`, name];
                if (metric.key === "ctr") return [`${value}%`, name];
                return [value, name];
              }}
            />
            {METRICS.filter((m) => activeMetrics.has(m.key)).map((m) => (
              <Line
                key={m.key}
                yAxisId={m.yAxisId}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name={m.label}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          No data available for the selected period
        </div>
      )}
    </div>
  );
}
