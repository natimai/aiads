import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  useCampaignDraft,
  useCreateCampaignDraft,
  usePublishCampaignDraft,
  useRegenerateCampaignBlock,
  useRegenerateCampaignImages,
  useUpdateCampaignBlock,
} from "../hooks/useCampaignBuilder";
import { useAccounts } from "../contexts/AccountContext";
import type { DraftBlockType } from "../types";

type Step = 1 | 2 | 3;

type BriefForm = {
  objective: "lead" | "sales";
  offerProduct: string;
  targetGeo: string;
  budget: number;
  language: string;
  campaignName: string;
  pageId: string;
  destinationUrl: string;
};

const DEFAULT_BRIEF: BriefForm = {
  objective: "sales",
  offerProduct: "",
  targetGeo: "US",
  budget: 100,
  language: "en",
  campaignName: "",
  pageId: "",
  destinationUrl: "",
};

type StrategyForm = {
  name: string;
  objective: string;
  dailyBudget: number;
  reasoning: string;
};

type AudienceForm = {
  countriesCsv: string;
  ageMin: number;
  ageMax: number;
  interestsText: string;
  strategyNote: string;
};

type CreativeForm = {
  primaryTexts: string;
  headlines: string;
  hooks: string;
};

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const { setSelectedAccountId } = useAccounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftIdFromQuery = searchParams.get("draftId") ?? undefined;
  const accountIdFromQuery = searchParams.get("accountId") ?? undefined;

  const [step, setStep] = useState<Step>(draftIdFromQuery ? 2 : 1);
  const [brief, setBrief] = useState<BriefForm>(DEFAULT_BRIEF);
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(draftIdFromQuery);
  const [errorMessage, setErrorMessage] = useState("");
  const [publishSuccess, setPublishSuccess] = useState("");

  const [editing, setEditing] = useState<Record<"strategy" | "audience" | "creative", boolean>>({
    strategy: false,
    audience: false,
    creative: false,
  });
  const [regenOpen, setRegenOpen] = useState<Record<"strategy" | "audience" | "creative", boolean>>({
    strategy: false,
    audience: false,
    creative: false,
  });
  const [regenPrompt, setRegenPrompt] = useState<Record<"strategy" | "audience" | "creative", string>>({
    strategy: "",
    audience: "",
    creative: "",
  });
  const [regeneratingBlock, setRegeneratingBlock] = useState<DraftBlockType | null>(null);

  const [strategyForm, setStrategyForm] = useState<StrategyForm>({
    name: "",
    objective: "OUTCOME_SALES",
    dailyBudget: 0,
    reasoning: "",
  });
  const [audienceForm, setAudienceForm] = useState<AudienceForm>({
    countriesCsv: "",
    ageMin: 21,
    ageMax: 55,
    interestsText: "",
    strategyNote: "",
  });
  const [creativeForm, setCreativeForm] = useState<CreativeForm>({
    primaryTexts: "",
    headlines: "",
    hooks: "",
  });

  const createMutation = useCreateCampaignDraft(accountIdFromQuery);
  const regenerateMutation = useRegenerateCampaignBlock(accountIdFromQuery);
  const regenerateImagesMutation = useRegenerateCampaignImages(accountIdFromQuery);
  const updateBlockMutation = useUpdateCampaignBlock(accountIdFromQuery);
  const publishMutation = usePublishCampaignDraft(accountIdFromQuery);

  const draftQuery = useCampaignDraft(activeDraftId, accountIdFromQuery);
  const draft = draftQuery.data;

  useEffect(() => {
    if (accountIdFromQuery) {
      setSelectedAccountId(accountIdFromQuery);
    }
  }, [accountIdFromQuery, setSelectedAccountId]);

  useEffect(() => {
    if (!draftIdFromQuery) return;
    setActiveDraftId(draftIdFromQuery);
    setStep(2);
  }, [draftIdFromQuery]);

  useEffect(() => {
    if (!draft) return;
    const cp = draft.blocks?.campaignPlan;
    const ap = draft.blocks?.audiencePlan;
    const cr = draft.blocks?.creativePlan;
    const reason = draft.blocks?.reasoning ?? "";

    setStrategyForm({
      name: cp?.name ?? "",
      objective: cp?.objective ?? "OUTCOME_SALES",
      dailyBudget: Number(cp?.dailyBudget ?? 0),
      reasoning: reason,
    });
    setAudienceForm({
      countriesCsv: (ap?.geo?.countries ?? []).join(", "),
      ageMin: Number(ap?.ageRange?.min ?? 21),
      ageMax: Number(ap?.ageRange?.max ?? 55),
      interestsText: (ap?.interests ?? []).join(", "),
      strategyNote: (ap?.lookalikeHints ?? []).join(", "),
    });
    setCreativeForm({
      primaryTexts: (cr?.primaryTexts ?? []).join("\n\n"),
      headlines: (cr?.headlines ?? []).join("\n"),
      hooks: (cr?.angles ?? []).join("\n"),
    });
  }, [draft]);

  const publishValidation = useMemo(() => {
    const errors: string[] = [];
    if (!draft) return { valid: false, errors: ["Generate a draft first."] };
    const budget = Number(draft.blocks?.campaignPlan?.dailyBudget ?? 0);
    const primaryTexts = draft.blocks?.creativePlan?.primaryTexts ?? [];
    const headlines = draft.blocks?.creativePlan?.headlines ?? [];
    if (budget <= 0) errors.push("Daily budget must be greater than 0.");
    if (!primaryTexts.length || primaryTexts.every((t) => !String(t).trim())) {
      errors.push("At least one primary text is required.");
    }
    if (!headlines.length || headlines.every((t) => !String(t).trim())) {
      errors.push("At least one headline is required.");
    }
    return { valid: errors.length === 0, errors };
  }, [draft]);

  const busy =
    createMutation.isPending ||
    regenerateMutation.isPending ||
    regenerateImagesMutation.isPending ||
    updateBlockMutation.isPending ||
    publishMutation.isPending ||
    draftQuery.isLoading;

  const handleGenerateDraft = async () => {
    setErrorMessage("");
    setPublishSuccess("");
    if (!brief.offerProduct.trim()) {
      setErrorMessage("Product / offer description is required.");
      return;
    }
    if (brief.budget <= 0) {
      setErrorMessage("Daily budget must be greater than 0.");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        objective: brief.objective,
        offerProduct: brief.offerProduct,
        targetGeo: brief.targetGeo,
        budget: brief.budget,
        language: brief.language,
        campaignName: brief.campaignName,
        pageId: brief.pageId,
        destinationUrl: brief.destinationUrl,
      });
      setActiveDraftId(result.draftId);
      const nextParams: Record<string, string> = { draftId: result.draftId };
      if (accountIdFromQuery) nextParams.accountId = accountIdFromQuery;
      setSearchParams(nextParams);
      setStep(2);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate draft");
    }
  };

  const handleRegenerate = async (
    section: "strategy" | "audience" | "creative",
    blockType: DraftBlockType
  ) => {
    if (!activeDraftId) return;
    setErrorMessage("");
    try {
      setRegeneratingBlock(blockType);
      await regenerateMutation.mutateAsync({
        draftId: activeDraftId,
        blockType,
        userInstructions: regenPrompt[section],
      });
      setRegenOpen((prev) => ({ ...prev, [section]: false }));
      setRegenPrompt((prev) => ({ ...prev, [section]: "" }));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegeneratingBlock(null);
    }
  };

  const handleSaveStrategy = async () => {
    if (!activeDraftId) return;
    setErrorMessage("");
    try {
      await updateBlockMutation.mutateAsync({
        draftId: activeDraftId,
        blockType: "campaignPlan",
        value: {
          name: strategyForm.name,
          objective: strategyForm.objective,
          dailyBudget: Number(strategyForm.dailyBudget || 0),
        },
      });
      await updateBlockMutation.mutateAsync({
        draftId: activeDraftId,
        blockType: "reasoning",
        value: strategyForm.reasoning,
      });
      setEditing((prev) => ({ ...prev, strategy: false }));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed saving strategy block");
    }
  };

  const handleSaveAudience = async () => {
    if (!activeDraftId) return;
    setErrorMessage("");
    const countries = audienceForm.countriesCsv
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const interests = audienceForm.interestsText
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const lookalikeHints = audienceForm.strategyNote
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await updateBlockMutation.mutateAsync({
        draftId: activeDraftId,
        blockType: "AUDIENCE",
        value: {
          geo: { countries: countries.length ? countries : ["US"] },
          ageRange: {
            min: Number(audienceForm.ageMin || 21),
            max: Number(audienceForm.ageMax || 55),
          },
          interests,
          lookalikeHints,
        },
      });
      setEditing((prev) => ({ ...prev, audience: false }));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed saving audience block");
    }
  };

  const handleSaveCreative = async () => {
    if (!activeDraftId) return;
    setErrorMessage("");
    const primaryTexts = creativeForm.primaryTexts
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const headlines = creativeForm.headlines
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const angles = creativeForm.hooks
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await updateBlockMutation.mutateAsync({
        draftId: activeDraftId,
        blockType: "CREATIVE",
        value: {
          primaryTexts,
          headlines,
          angles,
        },
      });
      setEditing((prev) => ({ ...prev, creative: false }));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed saving creative block");
    }
  };

  const handleRegenerateImages = async () => {
    if (!activeDraftId) return;
    setErrorMessage("");
    try {
      await regenerateImagesMutation.mutateAsync({
        draftId: activeDraftId,
      });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Image regeneration failed");
    }
  };

  const handlePublish = async () => {
    if (!activeDraftId || !publishValidation.valid) return;
    setErrorMessage("");
    setPublishSuccess("");
    try {
      const result = await publishMutation.mutateAsync({
        draftId: activeDraftId,
      });
      setPublishSuccess(`Published campaign ${result.campaignId} successfully.`);
      navigate("/", {
        state: {
          toast: {
            type: "success",
            message: "Campaign draft published to Meta Ads successfully.",
          },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Publish failed";
      if (msg.includes("Budget exceeds safety limits")) {
        setErrorMessage("Budget exceeds safety limits. Please edit the budget block.");
      } else {
        setErrorMessage(msg);
      }
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
              <WandSparkles className="h-3.5 w-3.5" />
              AI Campaign Builder
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Create Campaign</h1>
            <p className="text-sm text-slate-500">
              Generate, iterate, and publish a full campaign draft in three guided steps.
            </p>
          </div>
          <StepTracker step={step} />
        </div>
      </header>

      {step === 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Step 1: The Brief</h2>
          <p className="mt-1 text-sm text-slate-500">
            Define the campaign objective and core offer so Gemini can produce a launch-ready draft.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Campaign Objective</span>
              <select
                value={brief.objective}
                onChange={(e) => setBrief((prev) => ({ ...prev, objective: e.target.value as "lead" | "sales" }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="lead">Lead</option>
                <option value="sales">Sales</option>
              </select>
            </label>

            <Input
              label="Target Geo"
              value={brief.targetGeo}
              onChange={(value) => setBrief((prev) => ({ ...prev, targetGeo: value }))}
            />
            <Input
              label="Product / Offer Description"
              value={brief.offerProduct}
              onChange={(value) => setBrief((prev) => ({ ...prev, offerProduct: value }))}
            />
            <Input
              label="Language"
              value={brief.language}
              onChange={(value) => setBrief((prev) => ({ ...prev, language: value }))}
            />
            <Input
              label="Daily Budget"
              type="number"
              value={String(brief.budget)}
              onChange={(value) => setBrief((prev) => ({ ...prev, budget: Number(value || 0) }))}
            />
            <Input
              label="Campaign Name (optional)"
              value={brief.campaignName}
              onChange={(value) => setBrief((prev) => ({ ...prev, campaignName: value }))}
            />
          </div>

          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Advanced Publish Fields (optional)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Meta Page ID"
                value={brief.pageId}
                onChange={(value) => setBrief((prev) => ({ ...prev, pageId: value }))}
              />
              <Input
                label="Destination URL"
                value={brief.destinationUrl}
                onChange={(value) => setBrief((prev) => ({ ...prev, destinationUrl: value }))}
              />
            </div>
          </details>

          <button
            onClick={handleGenerateDraft}
            disabled={busy}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 sm:w-auto"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gemini is crafting your draft...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate AI Draft
              </>
            )}
          </button>
        </section>
      )}

      {step === 2 && draft && (
        <section className="space-y-4 pb-24 md:pb-0">
          <h2 className="text-sm font-semibold text-slate-800">Step 2: Block Editor</h2>

          <BlockCard
            title="Strategy & Setup"
            loading={regeneratingBlock === "STRATEGY" && regenerateMutation.isPending}
            onEdit={() => setEditing((prev) => ({ ...prev, strategy: !prev.strategy }))}
            onRegenerate={() => setRegenOpen((prev) => ({ ...prev, strategy: !prev.strategy }))}
          >
            <RegeneratePrompt
              open={regenOpen.strategy}
              value={regenPrompt.strategy}
              onChange={(value) => setRegenPrompt((prev) => ({ ...prev, strategy: value }))}
              onSubmit={() => handleRegenerate("strategy", "STRATEGY")}
              busy={regenerateMutation.isPending}
            />

            {editing.strategy ? (
              <div className="space-y-3">
                <Input
                  label="Campaign Name"
                  value={strategyForm.name}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, name: value }))}
                />
                <Input
                  label="Objective"
                  value={strategyForm.objective}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, objective: value }))}
                />
                <Input
                  label="Daily Budget"
                  type="number"
                  value={String(strategyForm.dailyBudget)}
                  onChange={(value) =>
                    setStrategyForm((prev) => ({ ...prev, dailyBudget: Number(value || 0) }))
                  }
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Strategy Note</span>
                  <textarea
                    rows={3}
                    value={strategyForm.reasoning}
                    onChange={(e) =>
                      setStrategyForm((prev) => ({ ...prev, reasoning: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <button
                  onClick={handleSaveStrategy}
                  disabled={busy}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Strategy
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Campaign:</span> {draft.blocks.campaignPlan.name}
                </p>
                <p>
                  <span className="font-semibold">Objective:</span> {draft.blocks.campaignPlan.objective}
                </p>
                <p>
                  <span className="font-semibold">Daily Budget:</span> ${draft.blocks.campaignPlan.dailyBudget}
                </p>
                <p className="rounded-lg bg-slate-50 p-2 text-slate-600">{draft.blocks.reasoning}</p>
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="Audience"
            loading={regeneratingBlock === "AUDIENCE" && regenerateMutation.isPending}
            onEdit={() => setEditing((prev) => ({ ...prev, audience: !prev.audience }))}
            onRegenerate={() => setRegenOpen((prev) => ({ ...prev, audience: !prev.audience }))}
          >
            <RegeneratePrompt
              open={regenOpen.audience}
              value={regenPrompt.audience}
              onChange={(value) => setRegenPrompt((prev) => ({ ...prev, audience: value }))}
              onSubmit={() => handleRegenerate("audience", "AUDIENCE")}
              busy={regenerateMutation.isPending}
            />

            {editing.audience ? (
              <div className="space-y-3">
                <Input
                  label="Geo (comma separated countries)"
                  value={audienceForm.countriesCsv}
                  onChange={(value) => setAudienceForm((prev) => ({ ...prev, countriesCsv: value }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Age Min"
                    type="number"
                    value={String(audienceForm.ageMin)}
                    onChange={(value) => setAudienceForm((prev) => ({ ...prev, ageMin: Number(value || 21) }))}
                  />
                  <Input
                    label="Age Max"
                    type="number"
                    value={String(audienceForm.ageMax)}
                    onChange={(value) => setAudienceForm((prev) => ({ ...prev, ageMax: Number(value || 55) }))}
                  />
                </div>
                <Input
                  label="Interests (comma separated)"
                  value={audienceForm.interestsText}
                  onChange={(value) => setAudienceForm((prev) => ({ ...prev, interestsText: value }))}
                />
                <Input
                  label="Strategy Note / Lookalikes"
                  value={audienceForm.strategyNote}
                  onChange={(value) => setAudienceForm((prev) => ({ ...prev, strategyNote: value }))}
                />
                <button
                  onClick={handleSaveAudience}
                  disabled={busy}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Audience
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Geo:</span>{" "}
                  {(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ")}
                </p>
                <p>
                  <span className="font-semibold">Age:</span>{" "}
                  {draft.blocks.audiencePlan.ageRange?.min}-{draft.blocks.audiencePlan.ageRange?.max}
                </p>
                <p>
                  <span className="font-semibold">Interests:</span>{" "}
                  {(draft.blocks.audiencePlan.interests ?? []).join(", ")}
                </p>
                <p className="rounded-lg bg-slate-50 p-2 text-slate-600">
                  {(draft.blocks.audiencePlan.lookalikeHints ?? []).join(", ")}
                </p>
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="Creative"
            loading={regeneratingBlock === "CREATIVE" && regenerateMutation.isPending}
            onEdit={() => setEditing((prev) => ({ ...prev, creative: !prev.creative }))}
            onRegenerate={() => setRegenOpen((prev) => ({ ...prev, creative: !prev.creative }))}
          >
            <RegeneratePrompt
              open={regenOpen.creative}
              value={regenPrompt.creative}
              onChange={(value) => setRegenPrompt((prev) => ({ ...prev, creative: value }))}
              onSubmit={() => handleRegenerate("creative", "CREATIVE")}
              busy={regenerateMutation.isPending}
            />

            {editing.creative ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Primary Texts (one per line)
                  </span>
                  <textarea
                    rows={5}
                    value={creativeForm.primaryTexts}
                    onChange={(e) =>
                      setCreativeForm((prev) => ({ ...prev, primaryTexts: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Headlines (one per line)
                  </span>
                  <textarea
                    rows={3}
                    value={creativeForm.headlines}
                    onChange={(e) =>
                      setCreativeForm((prev) => ({ ...prev, headlines: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Hooks (one per line)
                  </span>
                  <textarea
                    rows={3}
                    value={creativeForm.hooks}
                    onChange={(e) =>
                      setCreativeForm((prev) => ({ ...prev, hooks: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <button
                  onClick={handleSaveCreative}
                  disabled={busy}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Creative
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-700">
                <div>
                  <p className="mb-1 font-semibold">Primary Text Variations</p>
                  {(draft.blocks.creativePlan.primaryTexts ?? []).filter((t) => String(t).trim()).length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {(draft.blocks.creativePlan.primaryTexts ?? []).map((text, idx) => (
                        <li key={idx}>{text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-amber-600">
                      No primary texts generated. Click &quot;Regenerate&quot; to create new content.
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-1 font-semibold">Headlines</p>
                  {(draft.blocks.creativePlan.headlines ?? []).filter((t) => String(t).trim()).length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {(draft.blocks.creativePlan.headlines ?? []).map((text, idx) => (
                        <li key={idx}>{text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-amber-600">
                      No headlines generated. Click &quot;Regenerate&quot; to create new content.
                    </p>
                  )}
                </div>
              </div>
            )}

            <ImageGallery
              imageConcepts={draft.blocks.imageConcepts}
              onRegenerate={handleRegenerateImages}
              regenerating={regenerateImagesMutation.isPending}
            />
          </BlockCard>

          <div className="hidden items-center justify-between md:flex">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Brief
            </button>
            <button
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Review & Publish
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="fixed inset-x-3 bottom-20 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:hidden">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep(1)}
                className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Brief
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Review & Publish
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <section className="space-y-4 pb-24 md:pb-0">
          <h2 className="text-sm font-semibold text-slate-800">Step 3: Review & Publish</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Campaign:</span> {draft.blocks.campaignPlan.name}
              </p>
              <p>
                <span className="font-semibold">Objective:</span> {draft.blocks.campaignPlan.objective}
              </p>
              <p>
                <span className="font-semibold">Budget:</span> ${draft.blocks.campaignPlan.dailyBudget}/day
              </p>
              <p>
                <span className="font-semibold">Geo:</span>{" "}
                {(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ")}
              </p>
              <p>
                <span className="font-semibold">Creative Texts:</span>{" "}
                {(draft.blocks.creativePlan.primaryTexts ?? []).length} variations
              </p>
              <p>
                <span className="font-semibold">Images:</span>{" "}
                {(draft.blocks.imageConcepts?.imageUrls ?? []).length} generated
              </p>
            </div>
          </div>

          {!publishValidation.valid && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <p className="font-semibold">Fix these before publishing:</p>
              <ul className="mt-1 list-disc pl-5">
                {publishValidation.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="hidden items-center justify-between md:flex">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Editor
            </button>
            <button
              onClick={handlePublish}
              disabled={busy || !publishValidation.valid}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Publish to Meta Ads
                </>
              )}
            </button>
          </div>

          <div className="fixed inset-x-3 bottom-20 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:hidden">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep(2)}
                className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Editor
              </button>
              <button
                onClick={handlePublish}
                disabled={busy || !publishValidation.valid}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {publishMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Publish to Meta Ads
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {publishSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {publishSuccess}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function StepTracker({ step }: { step: Step }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StepPill active={step === 1} label="1. Brief" />
      <StepPill active={step === 2} label="2. Blocks" />
      <StepPill active={step === 3} label="3. Publish" />
    </div>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}

function BlockCard({
  title,
  loading,
  onRegenerate,
  onEdit,
  children,
}: {
  title: string;
  loading: boolean;
  onRegenerate: () => void;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      </div>
      {loading ? <BlockSkeleton /> : children}
    </div>
  );
}

function BlockSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function RegeneratePrompt({
  open,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  if (!open) return null;
  return (
    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
      <label className="block text-xs font-medium text-indigo-700">
        Any specific instructions for the AI?
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Example: Make it funnier and add stronger urgency"
        className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700"
      />
      <button
        onClick={onSubmit}
        disabled={busy}
        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
        Regenerate Block
      </button>
    </div>
  );
}

function ImageGallery({
  imageConcepts,
  onRegenerate,
  regenerating,
}: {
  imageConcepts?: {
    creative_concept_reasoning?: string;
    image_generation_prompts?: string[];
    imageUrls?: string[];
  };
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const urls = imageConcepts?.imageUrls ?? [];
  const prompts = imageConcepts?.image_generation_prompts ?? [];
  const reasoning = imageConcepts?.creative_concept_reasoning ?? "";

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-indigo-600" />
          <p className="text-sm font-semibold text-slate-800">AI Art Director — Image Concepts</p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {regenerating ? "Generating..." : "Regenerate Images"}
        </button>
      </div>

      {reasoning && (
        <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-xs text-indigo-700">
          {reasoning}
        </p>
      )}

      {urls.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {urls.map((url, idx) => (
            <div key={idx} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={url}
                alt={`AI concept ${idx + 1}`}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              {prompts[idx] && (
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-3 text-xs text-white">{prompts[idx]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : prompts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Image prompts generated (images pending):</p>
          {prompts.map((p, idx) => (
            <p key={idx} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {idx + 1}. {p}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          No image concepts generated yet. Click "Regenerate Images" to create them.
        </p>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
      />
    </label>
  );
}
