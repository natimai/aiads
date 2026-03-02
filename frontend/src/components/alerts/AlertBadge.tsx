import { useAlerts } from "../../hooks/useAlerts";

export function AlertBadge() {
  const { data: alerts } = useAlerts({ limit: 100 });
  const unacknowledged = alerts?.filter((a) => !a.acknowledged).length ?? 0;

  if (unacknowledged === 0) return null;

  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-red px-1.5 text-xs font-bold text-white">
      {unacknowledged > 99 ? "99+" : unacknowledged}
    </span>
  );
}
