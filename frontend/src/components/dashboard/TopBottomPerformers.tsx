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
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
        <div className="mb-4 h-5 w-40 rounded bg-slate-800 skeleton" />
        <div className="h-64 rounded bg-slate-800 skeleton" />
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
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
      <h3 className="mb-4 text-sm font-semibold text-white">Top / Bottom Performers by ROAS</h3>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              stroke="#334155"
            />
            <Tooltip
              formatter={(value: number) => formatROAS(value)}
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Bar dataKey="roas" name="ROAS" radius={[0, 4, 4, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.roas >= 1.5 ? "#22c55e" : entry.roas >= 1 ? "#eab308" : "#ef4444"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          No performance data available
        </div>
      )}
    </div>
  );
}
