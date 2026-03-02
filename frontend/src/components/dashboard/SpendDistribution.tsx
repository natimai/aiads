import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 h-4 w-36 rounded bg-slate-800 skeleton" />
        <div className="mx-auto h-44 w-44 rounded-full bg-slate-800 skeleton" />
      </div>
    );
  }

  const data = campaigns
    .filter((c) => c.todayInsights && c.todayInsights.spend > 0)
    .map((c) => ({
      name: c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name,
      value: c.todayInsights!.spend,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const totalSpend = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Spend Distribution</h3>

      {data.length > 0 ? (
        <div className="flex items-center gap-5">
          <ResponsiveContainer width="45%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]!} fillOpacity={0.9} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                }}
                labelStyle={{ display: "none" }}
                formatter={(value: number, _: string, props: any) => [
                  `${formatCurrency(value, currency)} (${totalSpend > 0 ? ((value / totalSpend) * 100).toFixed(0) : 0}%)`,
                  props.payload.name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-1.5 min-w-0">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="truncate text-[12px] text-slate-400">{d.name}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-[12px] text-slate-200">{formatCurrency(d.value, currency)}</span>
                  <span className="ml-1.5 text-[11px] text-slate-600">
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
