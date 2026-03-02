import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { Campaign } from "../../types";
import { formatCurrency } from "../../utils/format";

interface SpendDistributionProps {
  campaigns: Campaign[];
  currency?: string;
  loading?: boolean;
}

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#ec4899"];

export function SpendDistribution({ campaigns, currency = "USD", loading }: SpendDistributionProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
        <div className="mb-4 h-5 w-40 rounded bg-slate-800 skeleton" />
        <div className="mx-auto h-48 w-48 rounded-full bg-slate-800 skeleton" />
      </div>
    );
  }

  const data = campaigns
    .filter((c) => c.todayInsights && c.todayInsights.spend > 0)
    .map((c) => ({
      name: c.name.length > 20 ? c.name.slice(0, 20) + "..." : c.name,
      value: c.todayInsights!.spend,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const totalSpend = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
      <h3 className="mb-4 text-sm font-semibold text-white">Spend Distribution</h3>

      {data.length > 0 ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value, currency)}
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                itemStyle={{ color: "#e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-300">{d.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-slate-200">{formatCurrency(d.value, currency)}</span>
                  <span className="ml-2 text-slate-500">
                    {totalSpend > 0 ? `${((d.value / totalSpend) * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          No spend data available
        </div>
      )}
    </div>
  );
}
