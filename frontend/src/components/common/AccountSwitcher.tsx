import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2, Globe } from "lucide-react";
import { useAccounts } from "../../contexts/AccountContext";

export function AccountSwitcher() {
  const { accounts, selectedAccountId, setSelectedAccountId, selectedAccount } = useAccounts();
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

  const displayName = selectedAccount
    ? selectedAccount.accountName
    : "All Accounts";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-navy-700 dark:border-slate-700 dark:bg-navy-800"
      >
        {selectedAccountId ? (
          <Building2 className="h-4 w-4 text-accent-blue" />
        ) : (
          <Globe className="h-4 w-4 text-accent-green" />
        )}
        <span className="max-w-[180px] truncate">{displayName}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-700 bg-navy-900 py-1 shadow-xl dark:border-slate-700 dark:bg-navy-900">
          <button
            onClick={() => {
              setSelectedAccountId(null);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-800 ${
              selectedAccountId === null ? "bg-accent-blue/10 text-accent-blue" : "text-slate-300"
            }`}
          >
            <Globe className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">All Accounts</div>
              <div className="text-xs text-slate-500">{accounts.length} accounts</div>
            </div>
          </button>

          <div className="mx-3 my-1 border-t border-slate-700/50" />

          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => {
                setSelectedAccountId(account.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-800 ${
                selectedAccountId === account.id
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-slate-300"
              }`}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{account.accountName}</div>
                <div className="text-xs text-slate-500">
                  {account.currency}
                  {account.businessName ? ` · ${account.businessName}` : ""}
                </div>
              </div>
              {!account.isActive && (
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                  Inactive
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
