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
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
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
        onClick={() => setOpen((value) => !value)}
        className="focus-ring btn-secondary inline-flex min-h-11 items-center gap-2 px-3 text-[13px] font-medium"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--accent-2)]" />
        <span>{dateRange.label}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{displayText}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="panel absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl py-1.5">
          {!customMode ? (
            <>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDateRange(preset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-right text-[13px] transition-colors hover:bg-[var(--bg-soft)] ${
                    dateRange.label === preset.label
                      ? "font-medium text-[var(--accent)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {preset.from === preset.to
                      ? formatDateDisplay(preset.from)
                      : `${formatDateDisplay(preset.from)} – ${formatDateDisplay(preset.to)}`}
                  </span>
                </button>
              ))}
              <div className="mx-3 my-1 border-t border-[var(--line)]" />
              <button
                onClick={() => setCustomMode(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
              >
                <Calendar className="h-3.5 w-3.5" />
                טווח מותאם אישית
              </button>
            </>
          ) : (
            <div className="space-y-3 p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  מתאריך
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="focus-ring ltr w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  עד תאריך
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="focus-ring ltr w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomMode(false)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                >
                  חזרה
                </button>
                <button
                  onClick={() => {
                    setDateRange({ label: "מותאם אישית", from: customFrom, to: customTo });
                    setOpen(false);
                    setCustomMode(false);
                  }}
                  className="focus-ring btn-primary flex-1 px-3 py-1.5 text-[13px]"
                >
                  החל
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
