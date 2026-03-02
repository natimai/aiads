import { TrendingUp, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat" };
  invertDelta?: boolean;
  icon?: ReactNode;
  tooltip?: string;
  loading?: boolean;
}

export function MetricCard({ title, value, delta, invertDelta, icon, tooltip, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <div className="mb-2.5 h-3 w-16 rounded bg-slate-200 skeleton" />
        <div className="mb-2 h-6 w-20 rounded bg-slate-200 skeleton" />
        <div className="h-3 w-12 rounded bg-slate-200 skeleton" />
      </div>
    );
  }

  const isGoodDirection = (() => {
    if (!delta || delta.direction === "flat") return null;
    const isPositiveGood = !invertDelta;
    return delta.direction === "up" ? isPositiveGood : !isPositiveGood;
  })();

  const deltaColor =
    isGoodDirection === null
      ? "text-slate-400"
      : isGoodDirection
        ? "text-emerald-600"
        : "text-rose-600";

  return (
    <div
      className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm transition-colors hover:border-slate-200"
      title={tooltip}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-slate-400 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{title}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-slate-900 leading-tight">{value}</div>
      {delta ? (
        <div className={`mt-1 flex items-center gap-0.5 text-[11px] font-medium ${deltaColor}`}>
          {delta.direction === "up" && <TrendingUp className="h-3 w-3 shrink-0" />}
          {delta.direction === "down" && <TrendingDown className="h-3 w-3 shrink-0" />}
          <span>{delta.text}</span>
          <span className="ml-0.5 text-slate-400">vs prev</span>
        </div>
      ) : (
        <div className="mt-1 h-4" />
      )}
    </div>
  );
}
