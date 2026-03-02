import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { useDateRange } from "../../contexts/DateRangeContext";
import { getDateRangePresets, formatDateDisplay } from "../../utils/dates";

export function DateRangePicker() {
  const { dateRange, setDateRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo, setCustomTo] = useState(dateRange.to);
  const ref = useRef<HTMLDivElement>(null);
  const presets = getDateRangePresets();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomMode(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayText =
    dateRange.from === dateRange.to
      ? formatDateDisplay(dateRange.from)
      : `${formatDateDisplay(dateRange.from)} – ${formatDateDisplay(dateRange.to)}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-navy-700"
      >
        <Calendar className="h-4 w-4 text-slate-400" />
        <span>{dateRange.label}</span>
        <span className="text-xs text-slate-500">({displayText})</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-slate-700 bg-navy-900 p-2 shadow-xl">
          {!customMode ? (
            <>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDateRange(preset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${
                    dateRange.label === preset.label
                      ? "bg-accent-blue/10 text-accent-blue"
                      : "text-slate-300"
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-xs text-slate-500">
                    {preset.from === preset.to
                      ? formatDateDisplay(preset.from)
                      : `${formatDateDisplay(preset.from)} – ${formatDateDisplay(preset.to)}`}
                  </span>
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-slate-700/50" />
              <button
                onClick={() => setCustomMode(true)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                <Calendar className="h-4 w-4" />
                Custom Range
              </button>
            </>
          ) : (
            <div className="space-y-3 p-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-accent-blue"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-navy-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-accent-blue"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setDateRange({ label: "Custom", from: customFrom, to: customTo });
                    setOpen(false);
                    setCustomMode(false);
                  }}
                  className="flex-1 rounded-md bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
