import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveRecommendation,
  executeRecommendation,
  getExecutePreview,
  getRecommendationPolicy,
  generateRecommendations,
  getRollbackPreview,
  getRecommendationExecutions,
  getRecommendations,
  rollbackRecommendation,
  saveRecommendationPolicy,
  rejectRecommendation,
} from "../services/api";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";
import type { RecommendationStatus, RecommendationType } from "../types";

export function useRecommendations(filters?: {
  status?: RecommendationStatus;
  type?: RecommendationType;
  priority?: "high" | "medium" | "low";
  limit?: number;
}) {
  const { selectedAccountId, accounts } = useAccounts();
  const { dateRange } = useDateRange();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useQuery({
    queryKey: [
      "recommendations",
      accountId,
      dateRange.from,
      dateRange.to,
      filters?.status,
      filters?.type,
      filters?.priority,
      filters?.limit,
    ],
    queryFn: () =>
      getRecommendations(accountId!, {
        ...filters,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      }),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useGenerateRecommendations() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const { dateRange } = useDateRange();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("No account selected");
      return generateRecommendations(accountId, dateRange.from, dateRange.to);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useReviewRecommendation() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: {
      recommendationId: string;
      decision: "approve" | "reject";
      reason?: string;
      modifications?: Record<string, unknown>;
    }) => {
      if (!accountId) throw new Error("No account selected");
      if (payload.decision === "approve") {
        await approveRecommendation(
          accountId,
          payload.recommendationId,
          payload.reason ?? "",
          payload.modifications
        );
      } else {
        await rejectRecommendation(accountId, payload.recommendationId, payload.reason ?? "");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useExecuteRecommendation() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: { recommendationId: string }) => {
      if (!accountId) throw new Error("No account selected");
      return executeRecommendation(accountId, payload.recommendationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useRecommendationExecutions(recommendationId?: string, enabled = false) {
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;
  return useQuery({
    queryKey: ["recommendationExecutions", accountId, recommendationId],
    queryFn: () => getRecommendationExecutions(accountId!, recommendationId!, 20),
    enabled: !!accountId && !!recommendationId && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRollbackRecommendation() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: { recommendationId: string }) => {
      if (!accountId) throw new Error("No account selected");
      return rollbackRecommendation(accountId, payload.recommendationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["recommendationExecutions"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useRollbackPreview(recommendationId?: string, enabled = false) {
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;
  return useQuery({
    queryKey: ["rollbackPreview", accountId, recommendationId],
    queryFn: () => getRollbackPreview(accountId!, recommendationId!),
    enabled: !!accountId && !!recommendationId && enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useExecutePreview(recommendationId?: string, enabled = false) {
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;
  return useQuery({
    queryKey: ["executePreview", accountId, recommendationId],
    queryFn: () => getExecutePreview(accountId!, recommendationId!),
    enabled: !!accountId && !!recommendationId && enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRecommendationPolicy() {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = selectedAccountId ?? accounts[0]?.id;

  const query = useQuery({
    queryKey: ["recommendationPolicy", accountId],
    queryFn: () => getRecommendationPolicy(accountId!),
    enabled: !!accountId,
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      allowExecute: boolean;
      allowRollback: boolean;
      minConfidenceToExecute: number;
      maxBudgetDeltaPct: number;
    }) => {
      if (!accountId) throw new Error("No account selected");
      return saveRecommendationPolicy(accountId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendationPolicy", accountId] });
    },
  });

  return { ...query, saveMutation };
}
