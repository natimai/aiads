import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ApiError, getAccountPages, setAccountDefaultPage } from "../services/api";
import type { DraftBlockType, MetaPageOption, PageAccessStatus } from "../types";

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

function objectiveLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lead" || normalized === "outcome_leads") return "לידים";
  if (normalized === "sales" || normalized === "outcome_sales") return "מכירות";
  return value;
}

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedAccountId, selectedAccountId, accounts } = useAccounts();
  const [searchParams, setSearchParams] = useSearchParams();

  const draftIdFromQuery = searchParams.get("draftId") ?? undefined;
  const accountIdFromQuery = searchParams.get("accountId") ?? undefined;

  const [step, setStep] = useState<Step>(draftIdFromQuery ? 2 : 1);
  const [brief, setBrief] = useState<BriefForm>(DEFAULT_BRIEF);
  const [briefHydratedDraftId, setBriefHydratedDraftId] = useState<string>("");
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
  const [pageSelectDirty, setPageSelectDirty] = useState(false);

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
  const resolvedAccountId = accountIdFromQuery ?? selectedAccountId ?? accounts[0]?.id;
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === resolvedAccountId),
    [accounts, resolvedAccountId]
  );
  const accountClientBrief = useMemo(
    () => String(selectedAccount?.clientBackgroundBrief ?? "").trim(),
    [selectedAccount?.clientBackgroundBrief]
  );

  const pagesQuery = useQuery({
    queryKey: ["accountPages", resolvedAccountId],
    queryFn: () => getAccountPages(resolvedAccountId!),
    enabled: Boolean(resolvedAccountId),
    staleTime: 60_000,
  });

  const saveDefaultPageMutation = useMutation({
    mutationFn: async (payload: { pageId: string; pageName?: string }) => {
      if (!resolvedAccountId) throw new Error("No account selected");
      return setAccountDefaultPage(resolvedAccountId, payload.pageId, payload.pageName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      if (resolvedAccountId) {
        queryClient.invalidateQueries({ queryKey: ["accountPages", resolvedAccountId] });
      }
    },
  });

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
    setPageSelectDirty(false);
  }, [activeDraftId, resolvedAccountId]);

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

    if (draft.id !== briefHydratedDraftId) {
      const objectiveRaw = String(draft.inputs?.objective ?? "").toLowerCase();
      const objective: "lead" | "sales" = objectiveRaw.includes("lead") ? "lead" : "sales";
      const budget = Number(draft.blocks?.campaignPlan?.dailyBudget ?? draft.inputs?.dailyBudget ?? 0);

      setBrief((prev) => ({
        ...prev,
        objective,
        offerProduct: String(draft.inputs?.offer ?? prev.offerProduct ?? ""),
        targetGeo: String(draft.inputs?.country ?? prev.targetGeo ?? "IL"),
        budget: Number.isFinite(budget) && budget > 0 ? budget : prev.budget,
        language: String(draft.inputs?.language ?? prev.language ?? "he"),
        campaignName: String(
          draft.inputs?.campaignName ?? draft.blocks?.campaignPlan?.name ?? prev.campaignName ?? ""
        ),
        pageId: String(draft.inputs?.pageId ?? prev.pageId ?? ""),
        destinationUrl: String(draft.inputs?.destinationUrl ?? prev.destinationUrl ?? ""),
      }));
      setBriefHydratedDraftId(draft.id);
    }
  }, [draft, briefHydratedDraftId]);

  const pageOptions: MetaPageOption[] = useMemo(
    () => (Array.isArray(pagesQuery.data?.pages) ? pagesQuery.data?.pages : []),
    [pagesQuery.data?.pages]
  );
  const pageAccessStatus: PageAccessStatus | undefined = pagesQuery.data?.pageAccessStatus ?? selectedAccount?.pageAccessStatus;
  const resolvedPageId = useMemo(() => {
    const candidate =
      brief.pageId.trim() ||
      String(draft?.inputs?.pageId ?? "").trim() ||
      String(selectedAccount?.defaultPageId ?? "").trim() ||
      String(pageOptions[0]?.pageId ?? "").trim();
    return candidate;
  }, [brief.pageId, draft?.inputs?.pageId, selectedAccount?.defaultPageId, pageOptions]);
  const resolvedPageLabel = useMemo(() => {
    if (!resolvedPageId) return "-";
    const option = pageOptions.find((page) => page.pageId === resolvedPageId);
    if (option) return `${option.pageName} (${option.pageId})`;
    return resolvedPageId;
  }, [pageOptions, resolvedPageId]);

  useEffect(() => {
    if (pageSelectDirty) return;
    if (brief.pageId.trim()) return;
    if (!resolvedPageId) return;
    setBrief((prev) => ({ ...prev, pageId: resolvedPageId }));
  }, [brief.pageId, pageSelectDirty, resolvedPageId]);

  const publishValidation = useMemo(() => {
    const errors: string[] = [];
    if (!draft) return { valid: false, errors: ["צריך לייצר טיוטה לפני פרסום."] };

    const budget = Number(draft.blocks?.campaignPlan?.dailyBudget ?? 0);
    const primaryTexts = draft.blocks?.creativePlan?.primaryTexts ?? [];
    const headlines = draft.blocks?.creativePlan?.headlines ?? [];

    if (budget <= 0) {
      errors.push("התקציב היומי חייב להיות גדול מ־0.");
    }
    if (!primaryTexts.length || primaryTexts.every((text) => !String(text).trim())) {
      errors.push("חובה לפחות טקסט ראשי אחד.");
    }
    if (!headlines.length || headlines.every((text) => !String(text).trim())) {
      errors.push("חובה לפחות כותרת אחת.");
    }
    if (!resolvedPageId) {
      errors.push("יש לבחור עמוד Meta לפרסום לפני המשך.");
    }

    return { valid: errors.length === 0, errors };
  }, [draft, resolvedPageId]);

  const busy =
    createMutation.isPending ||
    regenerateMutation.isPending ||
    regenerateImagesMutation.isPending ||
    updateBlockMutation.isPending ||
    publishMutation.isPending ||
    draftQuery.isLoading;

  const handlePageSelection = (value: string) => {
    const selectedPageId = value.trim();
    setPageSelectDirty(true);
    setBrief((prev) => ({ ...prev, pageId: selectedPageId }));
    if (!selectedPageId || !resolvedAccountId) return;

    const pageName = pageOptions.find((page) => page.pageId === selectedPageId)?.pageName || "";
    saveDefaultPageMutation.mutate(
      { pageId: selectedPageId, pageName: pageName || undefined },
      {
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "שמירת ברירת מחדל לעמוד נכשלה.";
          setErrorMessage(message);
        },
      }
    );
  };

  const handleGenerateDraft = async () => {
    setErrorMessage("");
    setPublishSuccess("");

    if (!brief.offerProduct.trim()) {
      setErrorMessage("יש להזין תיאור מוצר או הצעה.");
      return;
    }
    if (brief.budget <= 0) {
      setErrorMessage("התקציב היומי חייב להיות גדול מ־0.");
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
        clientBackgroundBrief: accountClientBrief || undefined,
      });

      setActiveDraftId(result.draftId);
      const nextParams: Record<string, string> = { draftId: result.draftId };
      if (accountIdFromQuery) {
        nextParams.accountId = accountIdFromQuery;
      }
      setSearchParams(nextParams);
      setStep(2);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "יצירת הטיוטה נכשלה.");
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
      setErrorMessage(err instanceof Error ? err.message : "שחזור הבלוק נכשל.");
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
      setErrorMessage(err instanceof Error ? err.message : "שמירת בלוק האסטרטגיה נכשלה.");
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
      setErrorMessage(err instanceof Error ? err.message : "שמירת בלוק הקהל נכשלה.");
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
      setErrorMessage(err instanceof Error ? err.message : "שמירת בלוק הקריאייטיב נכשלה.");
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
      setErrorMessage(err instanceof Error ? err.message : "יצירת התמונות מחדש נכשלה.");
    }
  };

  const handlePublish = async () => {
    if (!activeDraftId || !publishValidation.valid) return;

    setErrorMessage("");
    setPublishSuccess("");

    try {
      const publishPageId = resolvedPageId.trim();
      const publishDestinationUrl =
        brief.destinationUrl.trim() || String(draft?.inputs?.destinationUrl ?? "").trim();

      const result = await publishMutation.mutateAsync({
        draftId: activeDraftId,
        pageId: publishPageId || undefined,
        destinationUrl: publishDestinationUrl || undefined,
      });
      setPublishSuccess(`הקמפיין פורסם בהצלחה (ID: ${result.campaignId}).`);

      navigate("/", {
        state: {
          toast: {
            type: "success",
            message: "טיוטת הקמפיין פורסמה בהצלחה ל־Meta Ads.",
          },
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "הפרסום נכשל.";
      if (message.includes("Budget exceeds safety limits")) {
        setErrorMessage("התקציב חורג ממגבלות הבטיחות. עדכן את בלוק התקציב לפני פרסום.");
      } else if (err instanceof ApiError && err.code === "PAGE_ID_RESOLUTION_FAILED") {
        setErrorMessage("חסרה הרשאת דפים לחשבון. בצע חיבור מחדש או בחר pageId ידנית.");
      } else if (err instanceof ApiError && err.code === "META_APP_DEVELOPMENT_MODE") {
        setErrorMessage(
          "אפליקציית Meta מחוברת במצב Development. יש להעביר אותה ל-Live/Public ב-Meta Developers ואז לנסות לפרסם שוב."
        );
      } else if (
        err instanceof ApiError &&
        err.code === "PUBLISH_FAILED" &&
        /^Publish failed:\s*$/i.test(message)
      ) {
        setErrorMessage("הפרסום נכשל אך Meta לא החזירה פירוט. נסה שוב בעוד דקה או עדכן אותי עם מזהה הטיוטה.");
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
              בונה קמפיינים חכם
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
              בנייה ופרסום מבוקר בדקות
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              בריף ממוקד, שיפור בלוקים מבוססי AI ופרסום בטוח ממסך אחד.
            </p>
          </div>
          <p className="text-xs text-slate-500">מזהה טיוטה: {activeDraftId ?? "טרם נוצר"}</p>
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
              1. בריף
            </h2>
          </div>

          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            הגדרת יעד, שוק והצעה. המערכת תייצר טיוטת AI מלאה.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BriefFieldCard
              title="הגדרת קמפיין"
              subtitle="שליטה ביעד, שוק ותקציב."
            >
              <IconSelectField
                label="יעד הקמפיין"
                value={brief.objective}
                onChange={(value) =>
                  setBrief((prev) => ({ ...prev, objective: value as "lead" | "sales" }))
                }
                icon={Target}
              >
                <option value="lead">לידים</option>
                <option value="sales">מכירות</option>
              </IconSelectField>

              <IconInputField
                label="מדינת יעד"
                value={brief.targetGeo}
                onChange={(value) => setBrief((prev) => ({ ...prev, targetGeo: value }))}
                icon={MapPin}
                dir="ltr"
              />

              <IconInputField
                label="שפת המודעות"
                value={brief.language}
                onChange={(value) => setBrief((prev) => ({ ...prev, language: value }))}
                icon={Globe}
                dir="ltr"
              />

              <IconInputField
                label="תקציב יומי"
                type="number"
                value={String(brief.budget)}
                onChange={(value) => setBrief((prev) => ({ ...prev, budget: Number(value || 0) }))}
                icon={Banknote}
                helperText="סכום מקסימלי ליום לפי מטבע החשבון."
                dir="ltr"
              />
            </BriefFieldCard>

            <BriefFieldCard
              title="בריף הצעה"
              subtitle="ככל שתספק יותר הקשר, איכות הטיוטה תעלה."
            >
              <IconTextareaField
                label="תיאור מוצר / הצעה"
                value={brief.offerProduct}
                onChange={(value) => setBrief((prev) => ({ ...prev, offerProduct: value }))}
                icon={FileText}
                rows={5}
                placeholder="לדוגמה: ביטוח רכב לנהגים צעירים, מוקד אנושי 24/7, הצעת מחיר תוך 3 דקות."
                helperText="הוסף קהל יעד, כאב מרכזי והצעת ערך כדי לשפר את איכות הטיוטה."
              />
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-700 dark:bg-[#0b1226]">
                <p className="font-semibold text-slate-700 dark:text-slate-200">רקע לקוח קבוע (מהחשבון)</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                  {accountClientBrief || "לא הוגדר. אפשר להגדיר במסך הגדרות > ניהול חשבונות."}
                </p>
              </div>

              <IconInputField
                label="שם קמפיין (אופציונלי)"
                value={brief.campaignName}
                onChange={(value) => setBrief((prev) => ({ ...prev, campaignName: value }))}
                icon={Sparkles}
              />
            </BriefFieldCard>
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-[#0b1226]">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              שדות מתקדמים לפרסום
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-2">
                <IconSelectField
                  label="עמוד פייסבוק לפרסום"
                  value={brief.pageId}
                  onChange={handlePageSelection}
                  icon={FileText}
                  helperText="הבחירה נשמרת כברירת מחדל לחשבון הנוכחי."
                >
                  <option value="">בחר עמוד</option>
                  {pageOptions.map((page) => (
                    <option key={page.pageId} value={page.pageId}>
                      {page.pageName} ({page.pageId})
                    </option>
                  ))}
                </IconSelectField>
                {pagesQuery.isLoading && (
                  <p className="text-[11px] text-slate-500">טוען עמודים מהחשבון...</p>
                )}
                {pageAccessStatus === "missing_permissions" && (
                  <p className="rounded-xl border border-amber-400/35 bg-amber-500/12 p-2 text-xs text-amber-100">
                    חסרות הרשאות דפים לחשבון. יש לבצע reconnect במסך חשבונות.
                  </p>
                )}
                {pageAccessStatus === "token_error" && (
                  <p className="rounded-xl border border-rose-400/35 bg-rose-500/12 p-2 text-xs text-rose-100">
                    לא ניתן למשוך עמודים מהחשבון כרגע. נסה reconnect או הזן pageId ידנית.
                  </p>
                )}
                {pageAccessStatus === "no_pages" && (
                  <p className="rounded-xl border border-slate-400/35 bg-slate-500/10 p-2 text-xs text-slate-300">
                    לא נמצאו עמודים זמינים בחשבון זה.
                  </p>
                )}
              </div>
              <IconInputField
                label="מזהה עמוד Meta (ידני)"
                value={brief.pageId}
                onChange={(value) => {
                  setPageSelectDirty(true);
                  setBrief((prev) => ({ ...prev, pageId: value }));
                }}
                icon={FileText}
                dir="ltr"
              />
              <IconInputField
                label="כתובת יעד"
                value={brief.destinationUrl}
                onChange={(value) => setBrief((prev) => ({ ...prev, destinationUrl: value }))}
                icon={Globe}
                dir="ltr"
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
                מייצר טיוטת AI
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                יצירת טיוטת AI
              </>
            )}
          </button>
        </section>
      )}

      {step === 2 && draft && (
        <section className="space-y-4 pb-24 md:pb-0">
          <BlockCard
            title="אסטרטגיה"
            subtitle="מבנה קמפיין, יישור ליעד ונימוק החלטות."
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
                  label="שם קמפיין"
                  value={strategyForm.name}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, name: value }))}
                />
                <InputField
                  label="יעד"
                  value={strategyForm.objective}
                  onChange={(value) => setStrategyForm((prev) => ({ ...prev, objective: value }))}
                />
                <InputField
                  label="תקציב יומי"
                  type="number"
                  value={String(strategyForm.dailyBudget)}
                  onChange={(value) =>
                    setStrategyForm((prev) => ({ ...prev, dailyBudget: Number(value || 0) }))
                  }
                  dir="ltr"
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">הערת אסטרטגיה</span>
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
                  שמירת אסטרטגיה
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <ReadOnlyField label="קמפיין" value={draft.blocks.campaignPlan.name} />
                <ReadOnlyField label="יעד" value={objectiveLabel(draft.blocks.campaignPlan.objective)} />
                <ReadOnlyField
                  label="תקציב יומי"
                  value={`$${draft.blocks.campaignPlan.dailyBudget}`}
                />
                <div className="md:col-span-2 rounded-2xl border border-slate-700 bg-[#0d1430] p-3 text-sm text-slate-300">
                  {draft.blocks.reasoning}
                </div>
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="קהל יעד"
            subtitle="גיאוגרפיה, גיל, תחומי עניין ורמזי Lookalike."
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
                  label="מדינות יעד (מופרד בפסיקים)"
                  value={audienceForm.countriesCsv}
                  onChange={(value) =>
                    setAudienceForm((prev) => ({ ...prev, countriesCsv: value }))
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="גיל מינימום"
                    type="number"
                    value={String(audienceForm.ageMin)}
                    onChange={(value) =>
                      setAudienceForm((prev) => ({ ...prev, ageMin: Number(value || 21) }))
                    }
                    dir="ltr"
                  />
                  <InputField
                    label="גיל מקסימום"
                    type="number"
                    value={String(audienceForm.ageMax)}
                    onChange={(value) =>
                      setAudienceForm((prev) => ({ ...prev, ageMax: Number(value || 55) }))
                    }
                    dir="ltr"
                  />
                </div>
                <InputField
                  label="תחומי עניין"
                  value={audienceForm.interestsText}
                  onChange={(value) =>
                    setAudienceForm((prev) => ({ ...prev, interestsText: value }))
                  }
                />
                <InputField
                  label="רמזי Lookalike"
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
                  שמירת קהל
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <ReadOnlyField
                  label="מדינות יעד"
                  value={(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ") || "-"}
                />
                <ReadOnlyField
                  label="טווח גיל"
                  value={`${draft.blocks.audiencePlan.ageRange?.min}-${draft.blocks.audiencePlan.ageRange?.max}`}
                />
                <ReadOnlyField
                  label="תחומי עניין"
                  value={(draft.blocks.audiencePlan.interests ?? []).join(", ") || "-"}
                />
                <ReadOnlyField
                  label="רמזי Lookalike"
                  value={(draft.blocks.audiencePlan.lookalikeHints ?? []).join(", ") || "-"}
                />
              </div>
            )}
          </BlockCard>

          <BlockCard
            title="קריאייטיב"
            subtitle="טקסטים ראשיים, כותרות, הוקים וקונספטים לתמונות."
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
                    טקסטים ראשיים (שורה לכל וריאציה)
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
                    כותרות (שורה לכל וריאציה)
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
                  <span className="mb-1 block text-xs font-medium text-slate-300">הוקים (שורה לכל וריאציה)</span>
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
                  שמירת קריאייטיב
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <ListPanel
                  title="טקסטים ראשיים"
                  values={(draft.blocks.creativePlan.primaryTexts ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="עדיין לא נוצרו טקסטים ראשיים."
                />
                <ListPanel
                  title="כותרות"
                  values={(draft.blocks.creativePlan.headlines ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="עדיין לא נוצרו כותרות."
                />
                <ListPanel
                  title="הוקים"
                  values={(draft.blocks.creativePlan.angles ?? []).filter((value) =>
                    String(value).trim()
                  )}
                  empty="עדיין לא נוצרו הוקים."
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
              חזרה לבריף
            </button>
            <button
              onClick={() => setStep(3)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 sm:w-auto"
            >
              בדיקה ופרסום
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <section className="space-y-4 pb-24 md:pb-0">
          <div className="rounded-3xl border border-slate-800 bg-[#070d1f] p-5 shadow-[0_22px_65px_-48px_rgba(16,185,129,0.65)] sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-200">
              3. בדיקה ופרסום
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ReadOnlyField label="קמפיין" value={draft.blocks.campaignPlan.name} />
              <ReadOnlyField label="יעד" value={objectiveLabel(draft.blocks.campaignPlan.objective)} />
              <ReadOnlyField label="תקציב" value={`$${draft.blocks.campaignPlan.dailyBudget} ליום`} />
              <ReadOnlyField
                label="מדינות יעד"
                value={(draft.blocks.audiencePlan.geo?.countries ?? []).join(", ") || "-"}
              />
              <ReadOnlyField label="עמוד פרסום" value={resolvedPageLabel} />
              <ReadOnlyField
                label="כמות וריאציות טקסט"
                value={String((draft.blocks.creativePlan.primaryTexts ?? []).length)}
              />
              <ReadOnlyField
                label="כמות תמונות שנוצרו"
                value={String((draft.blocks.imageConcepts?.imageUrls ?? []).length)}
              />
            </div>
          </div>

          {!publishValidation.valid && (
            <div className="rounded-2xl border border-rose-400/35 bg-rose-500/12 p-4 text-sm text-rose-100">
              <p className="font-semibold">צריך לתקן לפני פרסום:</p>
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
              חזרה לטיוטת AI
            </button>
            <button
              onClick={handlePublish}
              disabled={busy || !publishValidation.valid}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מפרסם
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  פרסום ל־Meta Ads
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
              חזרה לטיוטת AI
            </button>
            <button
              onClick={handlePublish}
              disabled={busy || !publishValidation.valid}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מפרסם
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  פרסום ל־Meta Ads
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
      <StepItem step={1} active={step === 1} done={step > 1} label="בריף" />
      <StepItem step={2} active={step === 2} done={step > 2} label="טיוטת AI" />
      <StepItem
        step={3}
        active={step === 3}
        done={false}
        label="בדיקה ופרסום"
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">שלב {step}</p>
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
            צור מחדש
          </button>
          <button
            onClick={onEdit}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-700 bg-[#111a34] px-3 text-xs font-medium text-slate-200 hover:bg-[#182345]"
          >
            <Pencil className="h-3.5 w-3.5" />
            עריכה
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
      <label className="block text-xs font-medium text-indigo-100">הנחיות לשחזור</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="לדוגמה: טון יותר פרימיום עם דחיפות גבוהה יותר"
        className="mt-1 w-full rounded-xl border border-indigo-400/30 bg-[#0c1430] px-3 py-2 text-sm text-slate-100"
      />
      <button
        onClick={onSubmit}
        disabled={busy}
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-indigo-500 px-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
        שחזור בלוק
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
    imageGenerationError?: string;
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
          <p className="text-sm font-semibold text-slate-100">גלריית תמונות Nano Banana</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPromptOpen((value) => !value)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-700 bg-[#101935] px-3 text-xs font-medium text-slate-200"
          >
            <WandSparkles className="h-3.5 w-3.5" />
            הוסף הנחיה
          </button>
          <button
            onClick={() => onRegenerate(prompt.trim() || undefined)}
            disabled={regenerating}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cyan-500 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            צור תמונות מחדש
          </button>
        </div>
      </div>

      {promptOpen && (
        <div className="mb-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
          <label className="block text-xs font-medium text-cyan-100">כיוון קריאייטיב לתמונה</label>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="לדוגמה: ויז'ואלים חיים יותר עם קונטרסט גבוה"
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
                    alt={`קונספט ${index + 1}`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            <div className="hidden md:grid md:grid-cols-3 md:gap-3">
              {urls.map((url, index) => (
                <div key={`${url}-${index}`} className="overflow-hidden rounded-xl border border-slate-700">
                  <img src={url} alt={`קונספט ${index + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                  {prompts[index] && (
                    <p className="border-t border-slate-700 bg-[#0c1329] p-2 text-xs text-slate-300">{prompts[index]}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : prompts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">נוצר סט פרומפטים, ממתין לכתובות תמונה:</p>
            {prompts.map((value, index) => (
              <p key={index} className="rounded-xl border border-slate-700 bg-[#111936] p-2 text-xs text-slate-300">
                {index + 1}. {value}
              </p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-[#0b1227] p-6 text-center">
            {imageConcepts?.imageGenerationError ? (
              <p className="text-sm text-amber-400">{imageConcepts.imageGenerationError}</p>
            ) : (
              <p className="text-sm text-slate-400">
                עדיין אין תמונות. לחץ על &quot;צור תמונות מחדש&quot; כדי לקבל סט קריאייטיב חדש.
              </p>
            )}
            <button
              onClick={() => onRegenerate()}
              disabled={regenerating}
              className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              צור תמונות מחדש
            </button>
          </div>
        )}

        {regenerating && (
          <div className="absolute inset-0 z-20 rounded-xl bg-[#070d1f]/85 p-3 backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              יוצר סט תמונות חדש
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
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
  "w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-3 pr-10 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-[inset_0_1px_2px_rgba(2,6,23,0.65)] dark:placeholder:text-slate-500";

function IconInputField({
  label,
  value,
  onChange,
  icon: Icon,
  helperText,
  type = "text",
  dir = "rtl",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  helperText?: string;
  type?: "text" | "number";
  dir?: "rtl" | "ltr";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          value={value}
          type={type}
          dir={dir}
          onChange={(event) => onChange(event.target.value)}
          className={`${BRIEF_INPUT_BASE} ${dir === "ltr" ? "ltr" : ""}`}
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
        <Icon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
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
        <Icon className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
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
  dir = "rtl",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  dir?: "rtl" | "ltr";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      <input
        value={value}
        type={type}
        dir={dir}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border border-slate-700 bg-[#0c1328] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400 ${
          dir === "ltr" ? "ltr" : ""
        }`}
      />
    </label>
  );
}
