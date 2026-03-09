import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAIInsights, triggerAIAnalysis } from "../services/api";
import { useAccounts } from "../contexts/AccountContext";
import type { AnalysisType } from "../types";

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
      type: AnalysisType;
      campaignName?: string;
      objective?: string;
      language?: string;
    }) => {
      if (!accountId) throw new Error("No account selected");
      return triggerAIAnalysis(accountId, payload.type, {
        campaignName: payload.campaignName,
        objective: payload.objective,
        language: payload.language,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiInsights", accountId] });
    },
  });
}
