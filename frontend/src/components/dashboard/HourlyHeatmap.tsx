import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { InsightData } from "../../types";

interface DayPerformanceChartProps {
  data: InsightData[];
  loading?: boolean;
}

const DAYS = ["ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳", "א׳"];

export function HourlyHeatmap({ data, loading }: DayPerformanceChartProps) {
  const chartData = useMemo(() => {
    const totals: { spend: number; impressions: number; clicks: number }[] = Array.from(
      { length: 7 },
      () => ({ spend: 0, impressions: 0, clicks: 0 })
    );

    for (const insight of data) {
      if (!insight.date) continue;
      const date = new Date(insight.date);
      const day = (date.getDay() + 6) % 7; // Monday = 0
      totals[day]!.spend += insight.spend;
      totals[day]!.impressions += insight.impressions;
      totals[day]!.clicks += insight.clicks;
    }

    return DAYS.map((day, i) => ({
      day,
      spend: Number(totals[i]!.spend.toFixed(2)),
      ctr: totals[i]!.impressions > 0
        ? Number(((totals[i]!.clicks / totals[i]!.impressions) * 100).toFixed(2))
        : 0,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="panel p-6">
        <div className="mb-4 h-5 w-48 rounded bg-[var(--line)] skeleton" />
        <div className="h-48 rounded bg-[var(--line)] skeleton" />
      </div>
    );
  }

  const hasData = chartData.some((d) => d.spend > 0);

  return (
    <div className="panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">הוצאה לפי יום בשבוע</h3>
        <span className="text-[11px] text-[var(--text-muted)]">מצטבר לכל הטווח</span>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 10px",
              }}
              labelStyle={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number, name: string) => {
                if (name === "spend") return [`$${value.toLocaleString()}`, "הוצאה"];
                return [`${value}%`, "CTR"];
              }}
            />
            <Bar dataKey="spend" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-[var(--text-muted)]">
          אין נתונים זמינים לטווח שנבחר
        </div>
      )}
    </div>
  );
}
