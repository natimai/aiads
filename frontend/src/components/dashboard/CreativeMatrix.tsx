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
      <div className="rounded-xl border border-slate-200 bg-white p-6">
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Spend vs. ROAS</h3>
        <div className="flex gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {">"}1.5x</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> 1–1.5x</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {"<"}1x</span>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="x"
              name="Spend"
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              label={{ value: "Spend", position: "insideBottom", offset: -10, fill: "#475569", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="ROAS"
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="transparent"
              axisLine={false}
              tickLine={false}
              label={{ value: "ROAS", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[30, 300]} name="Impressions" />
            <Tooltip
              cursor={{ strokeDasharray: "2 4", stroke: "#334155" }}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
              }}
              labelStyle={{ display: "none" }}
              formatter={(value: number, name: string) => {
                if (name === "Spend") return [formatCurrency(value, currency), "Spend"];
                if (name === "ROAS") return [formatROAS(value), "ROAS"];
                return [value.toLocaleString(), "Impressions"];
              }}
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload as { name?: string } | undefined;
                return item?.name ?? "";
              }}
            />
            <Scatter data={data}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          No campaign data available
        </div>
      )}
    </div>
  );
}
