import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Rocket,
  Sparkles,
  Target,
  WandSparkles,
  type LucideIcon,
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
  targetGeo: "IL",
  budget: 100,
  language: "he",
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

    if (budget <= 0) {
      errors.push("Daily budget must be greater than 0.");
    }
    if (!primaryTexts.length || primaryTexts.every((text) => !String(text).trim())) {
      errors.push("At least one primary text is required.");
    }
    if (!headlines.length || headlines.every((text) => !String(text).trim())) {
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
      if (accountIdFromQuery) {
        nextParams.accountId = accountIdFromQuery;
      }
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
      .map((value) => value.trim())
      .filter(Boolean);
    const interests = audienceForm.interestsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const lookalikeHints = audienceForm.strategyNote
      .split(",")
      .map((value) => value.trim())
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
      .map((value) => value.trim())
      .filter(Boolean);
    const headlines = creativeForm.headlines
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const angles = creativeForm.hooks
      .split("\n")
      .map((value) => value.trim())
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

  const handleRegenerateImages = async (userInstructions?: string) => {
    if (!activeDraftId) return;

    setErrorMessage("");
    try {
      await regenerateImagesMutation.mutateAsync({
        draftId: activeDraftId,
        userInstructions,
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
      const result = await publishMutation.mutateAsync({ draftId: activeDraftId });
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
      const message = err instanceof Error ? err.message : "Publish failed";
      if (message.includes("Budget exceeds safety limits")) {
        setErrorMessage("Budget exceeds safety limits. Please edit the budget block.");
      } else {
        setErrorMessage(message);
      }
    }
  };

  return (
    <div className="space-y-6 pb-36 md:pb-10">
      <header className="rounded-3xl border border-slate-800 bg-[#070d1f] p-5 shadow-[0_25px_70px_-45px_rgba(56,189,248,0.55)] sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
              <WandSparkles className="h-3.5 w-3.5" />
              AI Campaign Builder
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
              Build and Publish in Minutes
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Brief your goal, refine AI blocks, and publish to Meta from one guided wizard.
            </p>
          </div>
          <p className="text-xs text-slate-500">Draft ID: {activeDraftId ?? "Not generated"}</p>
        </div>
      </header>

      <div className="sticky top-20 z-20 rounded-2xl border border-slate-800 bg-[#070d1f]/95 p-3 backdrop-blur-xl">
        <WizardSteps step={step} />
      </div>

      {step === 1 && (
        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_60px_-42px_rgba(99,102,241,0.35)] dark:border-slate-800 dark:bg-[#070d1f] dark:shadow-[0_20px_60px_-42px_rgba(99,102,241,0.6)] sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-700 dark:text-indigo-100">
              1. Brief
            </h2>
          </div>

          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Define objective, market, and offer. The agent will generate a complete AI draft.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BriefFieldCard
              title="Campaign Setup"
              subtitle="Structured controls for objective, market, and spend."
            >
              <IconSelectField
                label="Campaign Objective"
                value={brief.objective}
                onChange={(value) =>
                  setBrief((prev) => ({ ...prev, objective: value as "lead" | "sales" }))
                }
                icon={Target}
              >
                <option value="lead">Lead</option>
                <option value="sales">Sales</option>
              </IconSelectField>

              <IconInputField
                label="Target Geo"
                value={brief.targetGeo}
                onChange={(value) => setBrief((prev) => ({ ...prev, targetGeo: value }))}
                icon={MapPin}
              />

              <IconInputField
                label="Language"
                value={brief.language}
                onChange={(value) => setBrief((prev) => ({ ...prev, language: value }))}
                icon={Globe}
              />

              <IconInputField
                label="Daily Budget"
                type="number"
                value={String(brief.budget)}
                onChange={(value) => setBrief((prev) => ({ ...prev, budget: Number(value || 0) }))}
                icon={Banknote}
                helperText="Daily spend limit in your account's currency."
              />
            </BriefFieldCard>

            <BriefFieldCard
              title="Offer Brief"
              subtitle="Give the agent context-rich input for better draft quality."
            >
              <IconTextareaField
                label="Product / Offer Description"
                value={brief.offerProduct}
                onChange={(value) => setBrief((prev) => ({ ...prev, offerProduct: value }))}
                icon={FileText}
                rows={5}
                placeholder="e.g., Car insurance by Yair Yosefi, targeting young drivers, offering 24/7 human support..."
                helperText="Paste the client's brief, target audience pain points, and core value proposition."
              />

              <IconInputField
                label="Campaign Name (optional)"
                value={brief.campaignName}
                onChange={(value) => setBrief((prev) => ({ ...prev, campaignName: value }))}
                icon={Sparkles}
              />
            </BriefFieldCard>
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-[#0b1226]">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              Advanced Publish Fields
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <IconInputField
                label="Meta Page ID"
                value={brief.pageId}
                onChange={(value) => setBrief((prev) => ({ ...prev, pageId: value }))}
                icon={FileText}
              />
              <IconInputField
                label="Destination URL"
                value={brief.destinationUrl}
                onChange={(value) => setBrief((prev) => ({ ...prev, destinationUrl: value }))}
                icon={Globe}
              />
            </div>
          </details>

          <button
            onClick={handleGenerateDraft}
            disabled={busy}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50 sm:w-auto"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating AI Draft
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
          <BlockCard
            title="Strategy"
            subtitle="Campaign setup, objective alignment, and rationale."
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
                <InputField
                  label="Campaign Name"
                  value={strategyForm.name}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, name: value }))}
                />
                <InputField
                  label="Objective"
                  value={strategyForm.objective}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, objective: value }))}
                />
                <InputField
                  label="Daily Budget"
                  type="number"
                  value={String(strategyForm.dailyBudget)}
                  onChange={(value) =>
                    setStrategyForm((prev) => ({ ...prev, dailyBudget: Number(value || 0) }))
                  }
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">Strategy Note</span>
                  <textarea
                    rows={4}
                    value={strategyForm.reasoning}
                    onChange={(event) =>
                      setStrategyForm((prev) => ({ ...prev, reasoning: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
                <button
                  onClick={handleSaveStrategy}
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
                >
                  Save Strategy
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <ReadOnlyField label="Campaign" value={draft.blocks.campaignPlan.name} />
                <ReadOnlyField label="Objective" value={draft.blocks.campaignPlan.objective} />
                <ReadOnlyField
                  label="Daily Budget"
                  value={`$${draft.blocks.campaignPlan.dailyBudget}`}
                />
                <div className="md:col-span-2 rounded-2xl border border-slate-700 bg-[#0d1430] p-3 text-sm text-slate-300">
                  {draft.blocks.reasoning}
                </div>
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="Audience"
            subtitle="Geo, age, interests, and lookalike hints."
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
                <InputField
                  label="Geo (comma separated)"
                  value={audienceForm.countriesCsv}
                  onChange={(value) =>
                    setAudienceForm((prev) => ({ ...prev, countriesCsv: value }))
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="Age Min"
                    type="number"
                    value={String(audienceForm.ageMin)}
                    onChange={(value) =>
                      setAudienceForm((prev) => ({ ...prev, ageMin: Number(value || 21) }))
                    }
                  />
                  <InputField
                    label="Age Max"
                    type="number"
                    value={String(audienceForm.ageMax)}
                    onChange={(value) =>
                      setAudienceForm((prev) => ({ ...prev, ageMax: Number(value || 55) }))
                    }
                  />
                </div>
                <InputField
                  label="Interests"
                  value={audienceForm.interestsText}
                  onChange={(value) =>
                    setAudienceForm((prev) => ({ ...prev, interestsText: value }))
                  }
                />
                <InputField
                  label="Lookalike Hints"
                  value={audienceForm.strategyNote}
                  onChange={(value) =>
                    setAudienceForm((prev) => ({ ...prev, strategyNote: value }))
                  }
                />
                <button
                  onClick={handleSaveAudience}
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
                >
                  Save Audience
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <ReadOnlyField
                  label="Geo"
                  value={(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ") || "-"}
                />
                <ReadOnlyField
                  label="Age"
                  value={`${draft.blocks.audiencePlan.ageRange?.min}-${draft.blocks.audiencePlan.ageRange?.max}`}
                />
                <ReadOnlyField
                  label="Interests"
                  value={(draft.blocks.audiencePlan.interests ?? []).join(", ") || "-"}
                />
                <ReadOnlyField
                  label="Lookalike Hints"
                  value={(draft.blocks.audiencePlan.lookalikeHints ?? []).join(", ") || "-"}
                />
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="Creative"
            subtitle="Primary texts, headlines, hooks, and generated image concepts."
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
                  <span className="mb-1 block text-xs font-medium text-slate-300">
                    Primary Texts (one per line)
                  </span>
                  <textarea
                    rows={5}
                    value={creativeForm.primaryTexts}
                    onChange={(event) =>
                      setCreativeForm((prev) => ({ ...prev, primaryTexts: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">
                    Headlines (one per line)
                  </span>
                  <textarea
                    rows={4}
                    value={creativeForm.headlines}
                    onChange={(event) =>
                      setCreativeForm((prev) => ({ ...prev, headlines: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">Hooks (one per line)</span>
                  <textarea
                    rows={4}
                    value={creativeForm.hooks}
                    onChange={(event) =>
                      setCreativeForm((prev) => ({ ...prev, hooks: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1228] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  />
                </label>
                <button
                  onClick={handleSaveCreative}
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
                >
                  Save Creative
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <ListPanel
                  title="Primary Texts"
                  values={(draft.blocks.creativePlan.primaryTexts ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="No primary texts generated yet."
                />
                <ListPanel
                  title="Headlines"
                  values={(draft.blocks.creativePlan.headlines ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="No headlines generated yet."
                />
                <ListPanel
                  title="Hooks"
                  values={(draft.blocks.creativePlan.angles ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="No hooks generated yet."
                />
              </div>
            )}

            <ImageGallery
              imageConcepts={draft.blocks.imageConcepts}
              onRegenerate={handleRegenerateImages}
              regenerating={regenerateImagesMutation.isPending}
            />
          </BlockCard>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => setStep(1)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-700 bg-[#0e1630] px-3 text-sm text-slate-200 hover:bg-[#162041] sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Brief
            </button>
            <button
              onClick={() => setStep(3)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 sm:w-auto"
            >
              Review and Publish
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <section className="space-y-4 pb-24 md:pb-0">
          <div className="rounded-3xl border border-slate-800 bg-[#070d1f] p-5 shadow-[0_22px_65px_-48px_rgba(16,185,129,0.65)] sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-200">
              3. Review & Publish
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ReadOnlyField label="Campaign" value={draft.blocks.campaignPlan.name} />
              <ReadOnlyField label="Objective" value={draft.blocks.campaignPlan.objective} />
              <ReadOnlyField label="Budget" value={`$${draft.blocks.campaignPlan.dailyBudget}/day`} />
              <ReadOnlyField
                label="Geo"
                value={(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ") || "-"}
              />
              <ReadOnlyField
                label="Primary Text Variations"
                value={String((draft.blocks.creativePlan.primaryTexts ?? []).length)}
              />
              <ReadOnlyField
                label="Generated Images"
                value={String((draft.blocks.imageConcepts?.imageUrls ?? []).length)}
              />
            </div>
          </div>

          {!publishValidation.valid && (
            <div className="rounded-2xl border border-rose-400/35 bg-rose-500/12 p-4 text-sm text-rose-100">
              <p className="font-semibold">Fix these before publishing:</p>
              <ul className="mt-1 list-disc pl-5">
                {publishValidation.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="hidden items-center justify-between md:flex">
            <button
              onClick={() => setStep(2)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-[#0e1630] px-3 text-sm text-slate-200 hover:bg-[#162041]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to AI Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={busy || !publishValidation.valid}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Publish to Meta
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <div className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-slate-700 bg-[#070d1f]/95 p-3 shadow-2xl backdrop-blur md:hidden">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setStep(2)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-700 bg-[#111a34] text-sm text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to AI Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={busy || !publishValidation.valid}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Publish to Meta
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {publishSuccess && (
        <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/12 p-3 text-sm text-emerald-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {publishSuccess}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-rose-400/35 bg-rose-500/12 p-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function WizardSteps({ step }: { step: Step }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <StepItem step={1} active={step === 1} done={step > 1} label="Brief" />
      <StepItem step={2} active={step === 2} done={step > 2} label="AI Draft" />
      <StepItem
        step={3}
        active={step === 3}
        done={false}
        label="Review & Publish"
      />
    </div>
  );
}

function StepItem({
  step,
  active,
  done,
  label,
}: {
  step: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
        active
          ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-100"
          : done
          ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-100"
          : "border-slate-700 bg-[#0d152d] text-slate-400"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Step {step}</p>
      <p className="truncate font-medium">{label}</p>
    </div>
  );
}

function BlockCard({
  title,
  subtitle,
  loading,
  onRegenerate,
  onEdit,
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  onRegenerate: () => void;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#070d1f] p-5 shadow-[0_22px_65px_-48px_rgba(56,189,248,0.7)] sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-700 bg-[#111a34] px-3 text-xs font-medium text-slate-200 hover:bg-[#182345]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
          <button
            onClick={onEdit}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-700 bg-[#111a34] px-3 text-xs font-medium text-slate-200 hover:bg-[#182345]"
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
      <div className="h-3 w-40 animate-pulse rounded bg-slate-700" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-700" />
      <div className="h-3 w-[92%] animate-pulse rounded bg-slate-700" />
      <div className="h-3 w-[76%] animate-pulse rounded bg-slate-700" />
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
    <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/12 p-3">
      <label className="block text-xs font-medium text-indigo-100">
        Regeneration Instructions
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Example: More premium tone with stronger urgency"
        className="mt-1 w-full rounded-xl border border-indigo-400/30 bg-[#0c1430] px-3 py-2 text-sm text-slate-100"
      />
      <button
        onClick={onSubmit}
        disabled={busy}
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-indigo-500 px-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
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
  onRegenerate: (userInstructions?: string) => void;
  regenerating: boolean;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const urls = imageConcepts?.imageUrls ?? [];
  const prompts = imageConcepts?.image_generation_prompts ?? [];
  const reasoning = imageConcepts?.creative_concept_reasoning ?? "";

  return (
    <div className="mt-5 rounded-2xl border border-slate-700 bg-[#0c1329] p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-cyan-300" />
          <p className="text-sm font-semibold text-slate-100">Nano Banana Image Gallery</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPromptOpen((value) => !value)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-700 bg-[#101935] px-3 text-xs font-medium text-slate-200"
          >
            <WandSparkles className="h-3.5 w-3.5" />
            Add Prompt
          </button>
          <button
            onClick={() => onRegenerate(prompt.trim() || undefined)}
            disabled={regenerating}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cyan-500 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate Images
          </button>
        </div>
      </div>

      {promptOpen && (
        <div className="mb-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
          <label className="block text-xs font-medium text-cyan-100">Image Direction</label>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Example: Brighter lifestyle visuals with high contrast"
            className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-[#0b1228] px-3 py-2 text-sm text-slate-100"
          />
        </div>
      )}

      {reasoning && (
        <p className="mb-3 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3 text-xs text-indigo-100">
          {reasoning}
        </p>
      )}

      <div className="relative">
        {urls.length > 0 ? (
          <>
            <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:hidden">
              {urls.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="w-[76%] shrink-0 snap-center overflow-hidden rounded-xl border border-slate-700"
                >
                  <img
                    src={url}
                    alt={`Concept ${index + 1}`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            <div className="hidden md:columns-3 md:gap-3">
              {urls.map((url, index) => (
                <div key={`${url}-${index}`} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-slate-700">
                  <img src={url} alt={`Concept ${index + 1}`} className="w-full object-cover" loading="lazy" />
                  {prompts[index] && (
                    <p className="border-t border-slate-700 bg-[#0c1329] p-2 text-xs text-slate-300">{prompts[index]}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : prompts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Prompt set generated, waiting for image URLs:</p>
            {prompts.map((value, index) => (
              <p key={index} className="rounded-xl border border-slate-700 bg-[#111936] p-2 text-xs text-slate-300">
                {index + 1}. {value}
              </p>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700 bg-[#0b1227] p-4 text-sm text-slate-400">
            No images yet. Use "Regenerate Images" to create a fresh creative set.
          </p>
        )}

        {regenerating && (
          <div className="absolute inset-0 z-20 rounded-xl bg-[#070d1f]/85 p-3 backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating new image set
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-square animate-pulse rounded-xl bg-slate-700/80" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ListPanel({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0d1430] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">{title}</p>
      {values.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
          {values.map((value, index) => (
            <li key={`${value}-${index}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-400">{empty}</p>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0d1430] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

function BriefFieldCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

const BRIEF_INPUT_BASE =
  "w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-[inset_0_1px_2px_rgba(2,6,23,0.65)] dark:placeholder:text-slate-500";

function IconInputField({
  label,
  value,
  onChange,
  icon: Icon,
  helperText,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  helperText?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          value={value}
          type={type}
          onChange={(event) => onChange(event.target.value)}
          className={BRIEF_INPUT_BASE}
        />
      </div>
      {helperText && <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>}
    </label>
  );
}

function IconSelectField({
  label,
  value,
  onChange,
  icon: Icon,
  children,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  children: ReactNode;
  helperText?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${BRIEF_INPUT_BASE} appearance-none`}
        >
          {children}
        </select>
      </div>
      {helperText && <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>}
    </label>
  );
}

function IconTextareaField({
  label,
  value,
  onChange,
  icon: Icon,
  rows = 5,
  placeholder,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  rows?: number;
  placeholder?: string;
  helperText?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
        <textarea
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${BRIEF_INPUT_BASE} min-h-[130px] resize-y pt-3`}
        />
      </div>
      {helperText && <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>}
    </label>
  );
}

function InputField({
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
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-[#0c1328] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400"
      />
    </label>
  );
}
