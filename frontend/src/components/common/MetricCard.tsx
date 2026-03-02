import { TrendingUp, TrendingDown, Minus } from "lucide-react";
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
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-4 dark:border-slate-800 dark:bg-navy-900">
        <div className="mb-3 h-4 w-20 rounded bg-slate-800 skeleton" />
        <div className="mb-2 h-7 w-28 rounded bg-slate-800 skeleton" />
        <div className="h-4 w-16 rounded bg-slate-800 skeleton" />
      </div>
    );
  }

  const deltaColor = delta
    ? (() => {
        const isPositiveGood = !invertDelta;
        if (delta.direction === "up") return isPositiveGood ? "text-accent-green" : "text-accent-red";
        if (delta.direction === "down") return isPositiveGood ? "text-accent-red" : "text-accent-green";
        return "text-slate-400";
      })()
    : "";

  const DeltaIcon =
    delta?.direction === "up"
      ? TrendingUp
      : delta?.direction === "down"
        ? TrendingDown
        : Minus;

  return (
    <div className="group relative rounded-xl border border-slate-800 bg-navy-900 p-4 transition-colors hover:border-slate-700 dark:border-slate-800 dark:bg-navy-900" title={tooltip}>
      <div className="mb-1 flex items-center gap-2">
        {icon && <span className="text-slate-400">{icon}</span>}
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</span>
      </div>
      <div className="text-2xl font-bold text-white dark:text-white">{value}</div>
      {delta && (
        <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
          <DeltaIcon className="h-3 w-3" />
          <span>{delta.text}</span>
          <span className="text-slate-500">vs prev</span>
        </div>
      )}
    </div>
  );
}
