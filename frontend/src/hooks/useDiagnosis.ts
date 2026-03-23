import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDiagnosis, runDiagnosis, getAccountFreshness } from "../services/api";

export function useDiagnosis(accountId?: string) {
  return useQuery({
    queryKey: ["diagnosis", accountId],
    queryFn: () => getDiagnosis(accountId!),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTriggerDiagnosis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      dateFrom,
      dateTo,
    }: {
      accountId: string;
      dateFrom?: string;
      dateTo?: string;
    }) => runDiagnosis(accountId, dateFrom, dateTo),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", variables.accountId] });
    },
  });
}

export function useAccountFreshness(accountId?: string) {
  return useQuery({
    queryKey: ["freshness", accountId],
    queryFn: () => getAccountFreshness(accountId!),
    enabled: !!accountId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
