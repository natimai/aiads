import { format, subDays, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import type { DateRange } from "../types";

export function getDateRangePresets(): DateRange[] {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  return [
    { label: "היום", from: fmt(today), to: fmt(today) },
    { label: "אתמול", from: fmt(subDays(today, 1)), to: fmt(subDays(today, 1)) },
    { label: "7 ימים אחרונים", from: fmt(subDays(today, 6)), to: fmt(today) },
    { label: "14 ימים אחרונים", from: fmt(subDays(today, 13)), to: fmt(today) },
    { label: "30 ימים אחרונים", from: fmt(subDays(today, 29)), to: fmt(today) },
    {
      label: "השבוע",
      from: fmt(startOfWeek(today, { weekStartsOn: 1 })),
      to: fmt(today),
    },
    {
      label: "שבוע שעבר",
      from: fmt(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
      to: fmt(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
    },
  ];
}

export function formatDateDisplay(dateStr: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}
