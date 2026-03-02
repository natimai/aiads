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
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span>{dateRange.label}</span>
        <span className="text-[11px] text-slate-400">{displayText}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {!customMode ? (
            <>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDateRange(preset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-slate-50 ${
                    dateRange.label === preset.label
                      ? "text-indigo-600 font-medium"
                      : "text-slate-700"
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[11px] text-slate-400">
                    {preset.from === preset.to
                      ? formatDateDisplay(preset.from)
                      : `${formatDateDisplay(preset.from)} – ${formatDateDisplay(preset.to)}`}
                  </span>
                </button>
              ))}
              <div className="mx-3 my-1 border-t border-slate-100" />
              <button
                onClick={() => setCustomMode(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <Calendar className="h-3.5 w-3.5" />
                Custom Range
              </button>
            </>
          ) : (
            <div className="space-y-3 p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  From
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  To
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setDateRange({ label: "Custom", from: customFrom, to: customTo });
                    setOpen(false);
                    setCustomMode(false);
                  }}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-700 transition-colors"
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
