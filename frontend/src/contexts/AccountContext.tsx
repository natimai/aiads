import { createContext, useContext, useState, type ReactNode } from "react";
import type { MetaAccount } from "../types";

interface AccountContextValue {
  accounts: MetaAccount[];
  setAccounts: (accounts: MetaAccount[]) => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  selectedAccount: MetaAccount | null;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  setAccounts: () => {},
  selectedAccountId: null,
  setSelectedAccountId: () => {},
  selectedAccount: null,
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount =
    selectedAccountId === null
      ? null
      : accounts.find((a) => a.id === selectedAccountId) ?? null;

  return (
    <AccountContext.Provider
      value={{ accounts, setAccounts, selectedAccountId, setSelectedAccountId, selectedAccount }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export const useAccounts = () => useContext(AccountContext);
