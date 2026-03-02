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
      if (selectedAccountId === null) {
        const firstManaged = query.data.find((a) => a.isManagedByPlatform);
        const fallback = query.data[0];
        const pick = firstManaged ?? fallback;
        if (pick) setSelectedAccountId(pick.id);
      }
    }
  }, [query.data, setAccounts, selectedAccountId, setSelectedAccountId]);

  return query;
}
