import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCampaignDraft,
  getCampaignDraft,
  preflightCampaignDraft,
  publishCampaignDraft,
  regenerateCampaignDraftBlock,
} from "../services/api";
import { useAccounts } from "../contexts/AccountContext";
import type { CampaignBuilderInputs } from "../types";

export function useCampaignDraft(draftId?: string, accountIdOverride?: string) {
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = accountIdOverride ?? selectedAccountId ?? accounts[0]?.id;

  return useQuery({
    queryKey: ["campaignDraft", accountId, draftId],
    queryFn: () => getCampaignDraft(accountId!, draftId!),
    enabled: !!accountId && !!draftId,
    staleTime: 30_000,
  });
}

export function useCreateCampaignDraft(accountIdOverride?: string) {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = accountIdOverride ?? selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (inputs: CampaignBuilderInputs) => {
      if (!accountId) throw new Error("No account selected");
      return createCampaignDraft(accountId, inputs);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaignDraft", accountId, data.draftId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useRegenerateCampaignBlock(accountIdOverride?: string) {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = accountIdOverride ?? selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: {
      draftId: string;
      blockType: "campaignPlan" | "audiencePlan" | "creativePlan" | "reasoning";
      instruction?: string;
    }) => {
      if (!accountId) throw new Error("No account selected");
      return regenerateCampaignDraftBlock(
        accountId,
        payload.draftId,
        payload.blockType,
        payload.instruction
      );
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(["campaignDraft", accountId, draft.id], draft);
      queryClient.invalidateQueries({ queryKey: ["campaignDraft", accountId, draft.id] });
    },
  });
}

export function usePreflightCampaignDraft(accountIdOverride?: string) {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = accountIdOverride ?? selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (draftId: string) => {
      if (!accountId) throw new Error("No account selected");
      return preflightCampaignDraft(accountId, draftId);
    },
    onSuccess: (_, draftId) => {
      queryClient.invalidateQueries({ queryKey: ["campaignDraft", accountId, draftId] });
    },
  });
}

export function usePublishCampaignDraft(accountIdOverride?: string) {
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useAccounts();
  const accountId = accountIdOverride ?? selectedAccountId ?? accounts[0]?.id;

  return useMutation({
    mutationFn: async (payload: { draftId: string; confirmHighBudget?: boolean }) => {
      if (!accountId) throw new Error("No account selected");
      return publishCampaignDraft(accountId, payload.draftId, Boolean(payload.confirmHighBudget));
    },
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ["campaignDraft", accountId, payload.draftId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
