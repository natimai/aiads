import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAIInsights, triggerAIAnalysis } from "../services/api";
import { useAccounts } from "../contexts/AccountContext";

export function useAIInsights() {
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useQuery({
    queryKey: ["aiInsights", accountId],
    queryFn: () => getAIInsights(accountId!),
    enabled: !!accountId,
    staleTime: 60 * 1000,
  });
}

export function useTriggerAIAnalysis() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: {
      type: "daily_summary" | "budget_optimization" | "creative_recommendations" | "creative_copy";
      campaignName?: string;
      objective?: string;
    }) => {
      if (!accountId) throw new Error("No account selected");
      return triggerAIAnalysis(accountId, payload.type, {
        campaignName: payload.campaignName,
        objective: payload.objective,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiInsights", accountId] });
    },
  });
}
