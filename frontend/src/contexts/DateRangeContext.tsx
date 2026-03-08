import { createContext, useContext, useState, type ReactNode } from "react";
import { format, subDays } from "date-fns";
import type { DateRange } from "../types";

interface DateRangeContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

const today = format(new Date(), "yyyy-MM-dd");

const defaultRange: DateRange = {
  label: "30 ימים אחרונים",
  from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  to: today,
};

const DateRangeContext = createContext<DateRangeContextValue>({
  dateRange: defaultRange,
  setDateRange: () => {},
});

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export const useDateRange = () => useContext(DateRangeContext);
