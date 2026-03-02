import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Campaign } from "../../types";
import { formatCurrency, formatROAS } from "../../utils/format";

interface CreativeMatrixProps {
  campaigns: Campaign[];
  currency?: string;
  loading?: boolean;
}

export function CreativeMatrix({ campaigns, currency = "USD", loading }: CreativeMatrixProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
        <div className="mb-4 h-5 w-40 rounded bg-slate-800 skeleton" />
        <div className="h-64 rounded bg-slate-800 skeleton" />
      </div>
    );
  }

  const data = campaigns
    .filter((c) => c.todayInsights && c.todayInsights.spend > 0)
    .map((c) => ({
      name: c.name,
      x: c.todayInsights!.spend,
      y: c.todayInsights!.roas,
      z: c.todayInsights!.impressions,
      fill: c.todayInsights!.roas >= 1.5 ? "#22c55e" : c.todayInsights!.roas < 1 ? "#ef4444" : "#eab308",
    }));

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Creative Performance Matrix</h3>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> ROAS {">"}1.5x</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" /> ROAS 1-1.5x</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> ROAS {"<"}1x</span>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="x"
              name="Spend"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              stroke="#334155"
              label={{ value: "Spend", position: "bottom", fill: "#64748b", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="ROAS"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              stroke="#334155"
              label={{ value: "ROAS", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="Impressions" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              formatter={(value: number, name: string) => {
                if (name === "Spend") return formatCurrency(value, currency);
                if (name === "ROAS") return formatROAS(value);
                return value.toLocaleString();
              }}
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload as { name?: string } | undefined;
                return item?.name ?? "";
              }}
            />
            <Scatter data={data}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} fillOpacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          No campaign data available for matrix view
        </div>
      )}
    </div>
  );
}
