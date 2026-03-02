import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCampaigns, campaignAction } from "../services/api";
import { useAccounts } from "../contexts/AccountContext";

export function useCampaigns(expand = false) {
  const { selectedAccountId } = useAccounts();

  return useQuery({
    queryKey: ["campaigns", selectedAccountId, expand],
    queryFn: () => getCampaigns(selectedAccountId ?? undefined, expand),
    enabled: !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCampaignAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      accountId,
      campaignId,
      action,
    }: {
      accountId: string;
      campaignId: string;
      action: "pause" | "resume";
    }) => campaignAction(accountId, campaignId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
