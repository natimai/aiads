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
        className="flex items-center gap-2 rounded border border-slate-700/60 bg-navy-800/60 px-3 py-1.5 text-[13px] font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-navy-700/80"
      >
        <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span>{dateRange.label}</span>
        <span className="text-[11px] text-slate-500">{displayText}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-700 bg-navy-900 py-1 shadow-2xl">
          {!customMode ? (
            <>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDateRange(preset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-800/80 ${
                    dateRange.label === preset.label
                      ? "text-accent-blue"
                      : "text-slate-300"
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[11px] text-slate-500">
                    {preset.from === preset.to
                      ? formatDateDisplay(preset.from)
                      : `${formatDateDisplay(preset.from)} – ${formatDateDisplay(preset.to)}`}
                  </span>
                </button>
              ))}
              <div className="mx-3 my-0.5 border-t border-slate-800" />
              <button
                onClick={() => setCustomMode(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-200"
              >
                <Calendar className="h-3.5 w-3.5" />
                Custom Range
              </button>
            </>
          ) : (
            <div className="space-y-3 p-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-navy-800 px-3 py-1.5 text-[13px] text-slate-200 outline-none focus:border-accent-blue"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-navy-800 px-3 py-1.5 text-[13px] text-slate-200 outline-none focus:border-accent-blue"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 rounded border border-slate-700 px-3 py-1.5 text-[13px] text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setDateRange({ label: "Custom", from: customFrom, to: customTo });
                    setOpen(false);
                    setCustomMode(false);
                  }}
                  className="flex-1 rounded bg-accent-blue px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-500 transition-colors"
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
