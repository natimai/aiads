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
        className="flex items-center gap-2 rounded border border-slate-700/60 bg-navy-800/60 px-3 py-1.5 text-[13px] font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-navy-700/80"
      >
        {selectedAccountId ? (
          <Building2 className="h-3.5 w-3.5 text-accent-blue shrink-0" />
        ) : (
          <Globe className="h-3.5 w-3.5 text-accent-green shrink-0" />
        )}
        <span className="max-w-[160px] truncate">{displayName}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-navy-900 py-1 shadow-2xl">
          <button
            onClick={() => {
              setSelectedAccountId(null);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-800/80 ${
              selectedAccountId === null ? "text-accent-blue" : "text-slate-300"
            }`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">All Accounts</div>
              <div className="text-[11px] text-slate-500">{accounts.length} connected</div>
            </div>
            {selectedAccountId === null && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-blue" />}
          </button>

          {accounts.length > 0 && <div className="mx-3 my-0.5 border-t border-slate-800" />}

          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => {
                setSelectedAccountId(account.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-800/80 ${
                selectedAccountId === account.id ? "text-accent-blue" : "text-slate-300"
              }`}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{account.accountName}</div>
                <div className="text-[11px] text-slate-500">
                  {account.currency}
                  {account.businessName ? ` · ${account.businessName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!account.isActive && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
                    Inactive
                  </span>
                )}
                {selectedAccountId === account.id && <div className="h-1.5 w-1.5 rounded-full bg-accent-blue" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
