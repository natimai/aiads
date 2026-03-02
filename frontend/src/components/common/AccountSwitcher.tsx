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
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isAllSelected = selectedAccountIds.length === 0;

  const displayLabel = isAllSelected
    ? "All Active Accounts"
    : selectedAccountIds.length === 1
    ? (activeAccounts.find((a) => a.id === selectedAccountIds[0])?.accountName ?? "1 Account")
    : `${selectedAccountIds.length} Accounts`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        {isAllSelected ? (
          <Globe className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        )}
        <span className="max-w-[180px] truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {/* All Active option */}
          <button
            onClick={() => {
              setSelectedAccountIds([]);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-slate-50 ${
              isAllSelected ? "text-indigo-600" : "text-slate-700"
            }`}
          >
            <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
              isAllSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
            }`}>
              {isAllSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
            <Globe className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <div className="font-medium">All Active Accounts</div>
              <div className="text-[11px] text-slate-400">
                {activeAccounts.length} account{activeAccounts.length !== 1 ? "s" : ""} active
              </div>
            </div>
          </button>

          {activeAccounts.length > 0 && (
            <div className="mx-3 my-1 border-t border-slate-100" />
          )}

          {activeAccounts.map((account) => {
            const isSelected = selectedAccountIds.includes(account.id);
            return (
              <button
                key={account.id}
                onClick={() => toggleSelectedAccountId(account.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-slate-50 ${
                  isSelected ? "text-indigo-600" : "text-slate-700"
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{account.accountName}</div>
                  <div className="text-[11px] text-slate-400">
                    {account.currency}
                    {account.businessName ? ` · ${account.businessName}` : ""}
                  </div>
                </div>
              </button>
            );
          })}

          {activeAccounts.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-slate-400 text-center">
              No active accounts. <br />
              <Link to="/settings/accounts" onClick={() => setOpen(false)} className="text-indigo-600 underline underline-offset-2">
                Add one in Settings
              </Link>
            </div>
          )}

          <div className="mx-3 my-1 border-t border-slate-100" />
          <Link
            to="/settings/accounts"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage Accounts
          </Link>
        </div>
      )}
    </div>
  );
}
