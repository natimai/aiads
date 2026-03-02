import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useCampaignDraft,
  useCreateCampaignDraft,
  usePreflightCampaignDraft,
  usePublishCampaignDraft,
  useRegenerateCampaignBlock,
} from "../hooks/useCampaignBuilder";
import type { CampaignBuilderInputs } from "../types";
import { useAccounts } from "../contexts/AccountContext";

const DEFAULT_INPUTS: CampaignBuilderInputs = {
  objective: "OUTCOME_SALES",
  offer: "",
  country: "US",
  language: "he",
  dailyBudget: 100,
  campaignName: "",
  pageId: "",
  destinationUrl: "",
  brandVoice: "",
};

export default function CampaignBuilder() {
  const { setSelectedAccountId } = useAccounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftIdFromQuery = searchParams.get("draftId") ?? undefined;
  const accountIdFromQuery = searchParams.get("accountId") ?? undefined;

  const [inputs, setInputs] = useState<CampaignBuilderInputs>(DEFAULT_INPUTS);
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(draftIdFromQuery);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [confirmHighBudget, setConfirmHighBudget] = useState(false);

  const createMutation = useCreateCampaignDraft(accountIdFromQuery);
  const regenMutation = useRegenerateCampaignBlock(accountIdFromQuery);
  const preflightMutation = usePreflightCampaignDraft(accountIdFromQuery);
  const publishMutation = usePublishCampaignDraft(accountIdFromQuery);

  const draftQuery = useCampaignDraft(activeDraftId, accountIdFromQuery);
  const draft = draftQuery.data;

  useEffect(() => {
    if (draftIdFromQuery && draftIdFromQuery !== activeDraftId) {
      setActiveDraftId(draftIdFromQuery);
    }
  }, [draftIdFromQuery, activeDraftId]);

  useEffect(() => {
    if (accountIdFromQuery) {
      setSelectedAccountId(accountIdFromQuery);
    }
  }, [accountIdFromQuery, setSelectedAccountId]);

  useEffect(() => {
    if (draft?.inputs) {
      setInputs({ ...DEFAULT_INPUTS, ...draft.inputs });
    }
  }, [draft?.inputs]);

  const safety = useMemo(() => {
    return preflightMutation.data ?? draft?.safety;
  }, [preflightMutation.data, draft?.safety]);

  const busy =
    createMutation.isPending ||
    draftQuery.isLoading ||
    regenMutation.isPending ||
    preflightMutation.isPending ||
    publishMutation.isPending;
  const blockedByErrors = (safety?.errors?.length ?? 0) > 0;
  const blockedByBudget = Boolean(safety?.requiresExplicitConfirm && !confirmHighBudget);

  const handleCreateDraft = async () => {
    const res = await createMutation.mutateAsync(inputs);
    setActiveDraftId(res.draftId);
    const next: Record<string, string> = { draftId: res.draftId };
    if (accountIdFromQuery) {
      next.accountId = accountIdFromQuery;
    }
    setSearchParams(next);
    setConfirmHighBudget(false);
  };

  const regenerate = async (blockType: "campaignPlan" | "audiencePlan" | "creativePlan" | "reasoning") => {
    if (!activeDraftId) return;
    await regenMutation.mutateAsync({
      draftId: activeDraftId,
      blockType,
      instruction: instructions[blockType] ?? "",
    });
  };

  const runPreflight = async () => {
    if (!activeDraftId) return;
    await preflightMutation.mutateAsync(activeDraftId);
  };

  const publish = async () => {
    if (!activeDraftId) return;
    await publishMutation.mutateAsync({ draftId: activeDraftId, confirmHighBudget });
  };

  const error =
    (createMutation.error as Error | null)?.message ||
    (draftQuery.error as Error | null)?.message ||
    (regenMutation.error as Error | null)?.message ||
    (preflightMutation.error as Error | null)?.message ||
    (publishMutation.error as Error | null)?.message ||
    "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">AI Campaign Builder</h2>
        <p className="text-sm text-slate-500">
          Build campaign drafts from account data, regenerate by block, then publish with safety checks.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Step 1: Inputs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Campaign Name" value={inputs.campaignName} onChange={(v) => setInputs((s) => ({ ...s, campaignName: v }))} />
          <Input label="Objective" value={inputs.objective} onChange={(v) => setInputs((s) => ({ ...s, objective: v }))} />
          <Input label="Offer" value={inputs.offer} onChange={(v) => setInputs((s) => ({ ...s, offer: v }))} />
          <Input label="Country" value={inputs.country} onChange={(v) => setInputs((s) => ({ ...s, country: v }))} />
          <Input label="Language" value={inputs.language} onChange={(v) => setInputs((s) => ({ ...s, language: v }))} />
          <Input
            label="Daily Budget"
            value={String(inputs.dailyBudget)}
            onChange={(v) => setInputs((s) => ({ ...s, dailyBudget: Number(v) || 0 }))}
          />
          <Input label="Meta Page ID (optional)" value={inputs.pageId ?? ""} onChange={(v) => setInputs((s) => ({ ...s, pageId: v }))} />
          <Input label="Destination URL (optional)" value={inputs.destinationUrl ?? ""} onChange={(v) => setInputs((s) => ({ ...s, destinationUrl: v }))} />
        </div>

        <button
          onClick={handleCreateDraft}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "Generating..." : "Generate Draft"}
        </button>
      </div>

      {draft && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Step 2: Draft Blocks</h3>
            <BlockCard
              title="Campaign Plan"
              content={JSON.stringify(draft.blocks.campaignPlan, null, 2)}
              instruction={instructions.campaignPlan ?? ""}
              onInstruction={(v) => setInstructions((s) => ({ ...s, campaignPlan: v }))}
              onRegenerate={() => regenerate("campaignPlan")}
              loading={regenMutation.isPending}
            />
            <BlockCard
              title="Audience Plan"
              content={JSON.stringify(draft.blocks.audiencePlan, null, 2)}
              instruction={instructions.audiencePlan ?? ""}
              onInstruction={(v) => setInstructions((s) => ({ ...s, audiencePlan: v }))}
              onRegenerate={() => regenerate("audiencePlan")}
              loading={regenMutation.isPending}
            />
            <BlockCard
              title="Creative Plan"
              content={JSON.stringify(draft.blocks.creativePlan, null, 2)}
              instruction={instructions.creativePlan ?? ""}
              onInstruction={(v) => setInstructions((s) => ({ ...s, creativePlan: v }))}
              onRegenerate={() => regenerate("creativePlan")}
              loading={regenMutation.isPending}
            />
            <BlockCard
              title="Reasoning"
              content={draft.blocks.reasoning}
              instruction={instructions.reasoning ?? ""}
              onInstruction={(v) => setInstructions((s) => ({ ...s, reasoning: v }))}
              onRegenerate={() => regenerate("reasoning")}
              loading={regenMutation.isPending}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Step 3: Safety & Publish</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={runPreflight}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {preflightMutation.isPending ? "Running preflight..." : "Run Preflight"}
              </button>
              <span className="text-xs text-slate-500">Status: {safety?.safetyStatus ?? "not-run"}</span>
            </div>

            {safety?.budgetCheck?.isOver10x && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                Budget warning: proposed {safety.budgetCheck.proposedDailyBudget} is above 10x average ({safety.budgetCheck.avgDailyBudget}).
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={confirmHighBudget}
                    onChange={(e) => setConfirmHighBudget(e.target.checked)}
                  />
                  I explicitly confirm this high budget.
                </label>
              </div>
            )}

            {draft.validation.errors.length > 0 && (
              <ul className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 space-y-1">
                {draft.validation.errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            )}
            {(safety?.warnings?.length ?? 0) > 0 && (
              <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                {safety?.warnings?.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}

            <button
              onClick={publish}
              disabled={
                busy ||
                !activeDraftId ||
                blockedByErrors ||
                blockedByBudget
              }
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishMutation.isPending ? "Publishing..." : "Publish Draft"}
            </button>

            {publishMutation.data && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                Published successfully. Campaign: {publishMutation.data.campaignId}, Watch card: {publishMutation.data.watchCardId}
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function BlockCard({
  title,
  content,
  instruction,
  onInstruction,
  onRegenerate,
  loading,
}: {
  title: string;
  content: string;
  instruction: string;
  onInstruction: (value: string) => void;
  onRegenerate: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-700">{content}</pre>
      <input
        value={instruction}
        onChange={(e) => onInstruction(e.target.value)}
        placeholder="Optional instruction for this block"
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700"
      />
    </div>
  );
}
