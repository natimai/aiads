import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAlerts, acknowledgeAlert, getAlertConfigs, saveAlertConfig, deleteAlertConfig } from "../services/api";
import type { AlertConfig } from "../types";

export function useAlerts(params?: {
  accountId?: string;
  type?: string;
  severity?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["alerts", params],
    queryFn: () => getAlerts(params),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, alertId }: { accountId: string; alertId: string }) =>
      acknowledgeAlert(accountId, alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useAlertConfigs() {
  return useQuery({
    queryKey: ["alertConfigs"],
    queryFn: getAlertConfigs,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveAlertConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: Partial<AlertConfig>) => saveAlertConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertConfigs"] });
    },
  });
}

export function useDeleteAlertConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configId: string) => deleteAlertConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertConfigs"] });
    },
  });
}
