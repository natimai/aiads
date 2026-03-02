import { useMemo } from "react";
import type { InsightData } from "../../types";

interface HourlyHeatmapProps {
  data: InsightData[];
  metric?: "spend" | "impressions" | "clicks" | "ctr" | "cpm";
  loading?: boolean;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function HourlyHeatmap({ data, metric = "spend", loading }: HourlyHeatmapProps) {
  const grid = useMemo(() => {
    const cells: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxVal = 0;

    for (const insight of data) {
      if (!insight.date) continue;
      const date = new Date(insight.date);
      const day = (date.getDay() + 6) % 7; // Monday = 0
      const val = (insight as unknown as Record<string, number>)[metric] ?? 0;
      // Distribute evenly across hours if no hourly data
      for (let h = 0; h < 24; h++) {
        cells[day]![h]! += val / 24;
        maxVal = Math.max(maxVal, cells[day]![h]!);
      }
    }

    return { cells, maxVal };
  }, [data, metric]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
        <div className="mb-4 h-5 w-40 rounded bg-slate-800 skeleton" />
        <div className="h-48 rounded bg-slate-800 skeleton" />
      </div>
    );
  }

  const getColor = (val: number): string => {
    if (grid.maxVal === 0) return "#1e293b";
    const intensity = val / grid.maxVal;
    if (intensity < 0.2) return "#1e293b";
    if (intensity < 0.4) return "#1e3a5f";
    if (intensity < 0.6) return "#1d4ed8";
    if (intensity < 0.8) return "#2563eb";
    return "#3b82f6";
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 p-6">
      <h3 className="mb-4 text-sm font-semibold text-white">Performance Heatmap</h3>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="mb-1 flex">
            <div className="w-10" />
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center text-[10px] text-slate-500">
                {h % 3 === 0 ? `${h}h` : ""}
              </div>
            ))}
          </div>

          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-0.5 mb-0.5">
              <div className="w-10 text-xs text-slate-400">{day}</div>
              {HOURS.map((hour) => {
                const val = grid.cells[dayIdx]?.[hour] ?? 0;
                return (
                  <div
                    key={hour}
                    className="flex-1 rounded-sm transition-colors"
                    style={{
                      backgroundColor: getColor(val),
                      height: 20,
                    }}
                    title={`${day} ${hour}:00 — ${metric}: ${val.toFixed(2)}`}
                  />
                );
              })}
            </div>
          ))}

          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-400">
            <span>Low</span>
            {["#1e293b", "#1e3a5f", "#1d4ed8", "#2563eb", "#3b82f6"].map((c) => (
              <div key={c} className="h-3 w-5 rounded-sm" style={{ backgroundColor: c }} />
            ))}
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
