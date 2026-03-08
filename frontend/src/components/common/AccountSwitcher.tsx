import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2, Globe, Settings, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useAccounts } from "../../contexts/AccountContext";

export function AccountSwitcher() {
  const {
    activeAccounts,
    selectedAccountIds,
    setSelectedAccountIds,
    toggleSelectedAccountId,
  } = useAccounts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isAllSelected = selectedAccountIds.length === 0;

  const displayLabel = isAllSelected
    ? "כל החשבונות הפעילים"
    : selectedAccountIds.length === 1
    ? (activeAccounts.find((item) => item.id === selectedAccountIds[0])?.accountName ?? "חשבון אחד")
    : `${selectedAccountIds.length} חשבונות`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-3 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--line-strong)]"
      >
        {isAllSelected ? (
          <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--accent-2)]" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent-2)]" />
        )}
        <span className="max-w-[180px] truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="panel absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl py-2">
          <button
            onClick={() => {
              setSelectedAccountIds([]);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-right text-[13px] transition-colors hover:bg-[var(--bg-soft)] ${
              isAllSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
            }`}
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                isAllSelected
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : "border-[var(--line-strong)]"
              }`}
            >
              {isAllSelected && <Check className="h-3 w-3 text-[#041325]" strokeWidth={3} />}
            </div>
            <Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <div>
              <div className="font-medium">כל החשבונות הפעילים</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {activeAccounts.length} חשבונות פעילים
              </div>
            </div>
          </button>

          {activeAccounts.length > 0 && <div className="mx-3 my-1 border-t border-[var(--line)]" />}

          {activeAccounts.map((account) => {
            const isSelected = selectedAccountIds.includes(account.id);
            return (
              <button
                key={account.id}
                onClick={() => toggleSelectedAccountId(account.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-right text-[13px] transition-colors hover:bg-[var(--bg-soft)] ${
                  isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    isSelected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)]"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-[#041325]" strokeWidth={3} />}
                </div>
                <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{account.accountName}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    <span className="ltr">{account.currency}</span>
                    {account.businessName ? ` · ${account.businessName}` : ""}
                  </div>
                </div>
              </button>
            );
          })}

          {activeAccounts.length === 0 && (
            <div className="px-3 py-3 text-center text-[12px] text-[var(--text-muted)]">
              אין חשבונות פעילים.
              <br />
              <Link
                to="/settings/accounts"
                onClick={() => setOpen(false)}
                className="text-[var(--accent-2)] underline underline-offset-2"
              >
                מעבר לניהול חשבונות
              </Link>
            </div>
          )}

          <div className="mx-3 my-1 border-t border-[var(--line)]" />
          <Link
            to="/settings/accounts"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <Settings className="h-3.5 w-3.5" />
            ניהול חשבונות
          </Link>
        </div>
      )}
    </div>
  );
}
