import { createContext, useContext, useState, type ReactNode } from "react";
import type { MetaAccount } from "../types";

interface AccountContextValue {
  accounts: MetaAccount[];
  setAccounts: (accounts: MetaAccount[]) => void;

  /** Single-account selection (null = "All") — kept for backward compat */
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  /** Multi-account selection. Empty array = "All Active" */
  selectedAccountIds: string[];
  setSelectedAccountIds: (ids: string[]) => void;
  toggleSelectedAccountId: (id: string) => void;

  /** Active managed accounts (shown in the header dropdown) */
  activeAccounts: MetaAccount[];

  /** The primary selected account (first in selection, or null) */
  selectedAccount: MetaAccount | null;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  setAccounts: () => {},
  selectedAccountId: null,
  setSelectedAccountId: () => {},
  selectedAccountIds: [],
  setSelectedAccountIds: () => {},
  toggleSelectedAccountId: () => {},
  activeAccounts: [],
  selectedAccount: null,
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const activeAccounts = accounts.filter((a) => a.isManagedByPlatform);

  const selectedAccountId: string | null =
    selectedAccountIds.length === 1 ? (selectedAccountIds[0] ?? null) : null;

  const setSelectedAccountId = (id: string | null) => {
    setSelectedAccountIds(id ? [id] : []);
  };

  const toggleSelectedAccountId = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectedAccount =
    selectedAccountIds.length === 1
      ? (accounts.find((a) => a.id === selectedAccountIds[0]) ?? null)
      : null;

  return (
    <AccountContext.Provider
      value={{
        accounts,
        setAccounts,
        selectedAccountId,
        setSelectedAccountId,
        selectedAccountIds,
        setSelectedAccountIds,
        toggleSelectedAccountId,
        activeAccounts,
        selectedAccount,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export const useAccounts = () => useContext(AccountContext);
