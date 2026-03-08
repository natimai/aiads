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
      <div className="panel-soft p-3">
        <div className="mb-2.5 h-3 w-16 rounded bg-[var(--line)] skeleton" />
        <div className="mb-2 h-6 w-20 rounded bg-[var(--line)] skeleton" />
        <div className="h-3 w-12 rounded bg-[var(--line)] skeleton" />
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
      className="panel-soft p-3 transition-colors hover:border-[var(--line-strong)]"
      title={tooltip}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-[var(--text-muted)] [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{title}</span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-tight text-[var(--text-primary)]">{value}</div>
      {delta ? (
        <div className={`mt-1 flex items-center gap-0.5 text-[11px] font-medium ${deltaColor}`}>
          {delta.direction === "up" && <TrendingUp className="h-3 w-3 shrink-0" />}
          {delta.direction === "down" && <TrendingDown className="h-3 w-3 shrink-0" />}
          <span>{delta.text}</span>
          <span className="text-[var(--text-muted)]">מול טווח קודם</span>
        </div>
      ) : (
        <div className="mt-1 h-4" />
      )}
    </div>
  );
}
