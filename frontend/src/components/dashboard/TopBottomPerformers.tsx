import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Campaign } from "../../types";
import { formatROAS } from "../../utils/format";

interface TopBottomPerformersProps {
  campaigns: Campaign[];
  loading?: boolean;
}

export function TopBottomPerformers({ campaigns, loading }: TopBottomPerformersProps) {
  if (loading) {
    return (
      <div className="panel p-6">
        <div className="mb-4 h-5 w-40 rounded bg-[var(--line)] skeleton" />
        <div className="h-64 rounded bg-[var(--line)] skeleton" />
      </div>
    );
  }

  const withRoas = campaigns
    .filter((c) => c.todayInsights && c.todayInsights.spend > 0)
    .map((c) => ({
      name: c.name.length > 25 ? c.name.slice(0, 25) + "..." : c.name,
      roas: c.todayInsights!.roas,
    }))
    .sort((a, b) => b.roas - a.roas);

  const top5 = withRoas.slice(0, 5);
  const bottom5 = withRoas.slice(-5).reverse();
  const data = [...top5, ...bottom5.filter((b) => !top5.some((t) => t.name === b.name))];

  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">מובילים וחלשים</h3>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
              }}
              labelStyle={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 2 }}
              formatter={(value: number) => [formatROAS(value), "ROAS"]}
            />
            <Bar dataKey="roas" name="ROAS" radius={[0, 3, 3, 0]} maxBarSize={18}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.roas >= 1.5 ? "#22c55e" : entry.roas >= 1 ? "#eab308" : "#ef4444"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
          אין נתוני ביצועים זמינים
        </div>
      )}
    </div>
  );
}
