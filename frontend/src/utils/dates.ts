import { format, subDays, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import type { DateRange } from "../types";

export function getDateRangePresets(): DateRange[] {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  return [
    { label: "Today", from: fmt(today), to: fmt(today) },
    { label: "Yesterday", from: fmt(subDays(today, 1)), to: fmt(subDays(today, 1)) },
    { label: "Last 7 Days", from: fmt(subDays(today, 6)), to: fmt(today) },
    { label: "Last 14 Days", from: fmt(subDays(today, 13)), to: fmt(today) },
    { label: "Last 30 Days", from: fmt(subDays(today, 29)), to: fmt(today) },
    {
      label: "This Week",
      from: fmt(startOfWeek(today, { weekStartsOn: 1 })),
      to: fmt(today),
    },
    {
      label: "Last Week",
      from: fmt(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
      to: fmt(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
    },
  ];
}

export function formatDateDisplay(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy");
}
