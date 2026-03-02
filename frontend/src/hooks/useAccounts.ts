import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "../services/api";
import { useAccounts as useAccountContext } from "../contexts/AccountContext";
import { useEffect } from "react";

export function useAccountsQuery() {
  const { setAccounts, selectedAccountId, setSelectedAccountId } = useAccountContext();

  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) {
      setAccounts(query.data);
      const firstAccount = query.data[0];
      if (selectedAccountId === null && firstAccount) {
        setSelectedAccountId(firstAccount.id);
      }
    }
  }, [query.data, setAccounts, selectedAccountId, setSelectedAccountId]);

  return query;
}
