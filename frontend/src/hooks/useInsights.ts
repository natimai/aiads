import { useQuery } from "@tanstack/react-query";
import { getInsights } from "../services/api";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";

export function useInsights(campaignId?: string) {
  const { selectedAccountId, accounts } = useAccounts();
  const { dateRange } = useDateRange();

  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useQuery({
    queryKey: ["insights", accountId, dateRange.from, dateRange.to, campaignId],
    queryFn: () => getInsights(accountId!, dateRange.from, dateRange.to, campaignId),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
