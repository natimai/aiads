import { Fragment, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ImageOff,
  Pause,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import { useCampaignAction } from "../../hooks/useCampaigns";
import { formatCurrency } from "../../utils/format";
import { formatInsightMetric } from "../../utils/metricsConfig";
import type {
  AccountVertical,
  Ad,
  AdSet,
  Campaign,
  DashboardMetricKey,
} from "../../types";

interface CampaignExplorerProps {
  campaigns: Campaign[];
  currency?: string;
  loading?: boolean;
  vertical: AccountVertical;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20",
  PAUSED: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20",
  DELETED: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20",
  ARCHIVED: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20",
  WITH_ISSUES: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20",
};

const METRICS_BY_VERTICAL: Record<
  AccountVertical,
  {
    result: DashboardMetricKey;
    efficiency: DashboardMetricKey;
    quality: DashboardMetricKey;
  }
> = {
  LEAD_GEN: { result: "leads", efficiency: "cpl", quality: "ctr" },
  ECOMMERCE: { result: "purchases", efficiency: "cpa", quality: "roas" },
  APP_INSTALLS: { result: "installs", efficiency: "cpi", quality: "ctr" },
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  PAUSED: "מושהה",
  DELETED: "נמחק",
  ARCHIVED: "בארכיון",
  WITH_ISSUES: "עם תקלות",
};

const METRIC_LABELS: Partial<Record<DashboardMetricKey, string>> = {
  spend: "הוצאה",
  leads: "לידים",
  purchases: "רכישות",
  installs: "התקנות",
  cpl: "עלות לליד",
  cpa: "עלות לרכישה",
  cpi: "עלות להתקנה",
  ctr: "CTR",
  roas: "ROAS",
};

function statusClass(status: string) {
  return STATUS_COLORS[status] ?? "bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/20";
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function metricLabel(metric: DashboardMetricKey) {
  return METRIC_LABELS[metric] ?? metric.toUpperCase();
}

function objectiveLabel(objective?: string) {
  if (!objective) return "ללא יעד מוגדר";
  const normalized = objective.toLowerCase();
  if (normalized.includes("lead")) return "לידים";
  if (normalized.includes("sale")) return "מכירות";
  if (normalized.includes("install")) return "התקנות";
  return objective;
}

function campaignMatchesSearch(campaign: Campaign, query: string) {
  if (campaign.name.toLowerCase().includes(query)) return true;

  for (const adset of campaign.adsets ?? []) {
    if (adset.name.toLowerCase().includes(query)) return true;
    for (const ad of adset.ads ?? []) {
      if (ad.name.toLowerCase().includes(query)) return true;
      const copy = adPrimaryText(ad).toLowerCase();
      if (copy.includes(query)) return true;
    }
  }

  return false;
}

function extractAudience(adset: AdSet): string {
  const record = adset as unknown as Record<string, unknown>;
  const interests = record.interests;
  if (Array.isArray(interests) && interests.length > 0) {
    const names = interests
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 2);
    if (names.length > 0) return names.join(" · ");
  }
  if (adset.targetingSummary?.trim()) return adset.targetingSummary;
  return "קהל רחב";
}

function extractLocation(adset: AdSet): string {
  const record = adset as unknown as Record<string, unknown>;
  const targeting = record.targeting;
  if (!targeting || typeof targeting !== "object" || Array.isArray(targeting)) {
    return "כל המיקומים";
  }

  const geo = (targeting as Record<string, unknown>).geo_locations;
  if (!geo || typeof geo !== "object" || Array.isArray(geo)) {
    return "כל המיקומים";
  }

  const countries = (geo as Record<string, unknown>).countries;
  if (!Array.isArray(countries) || countries.length === 0) {
    return "כל המיקומים";
  }

  const values = countries
    .filter((item): item is string => typeof item === "string")
    .slice(0, 3);

  if (values.length === 0) return "כל המיקומים";
  return values.join(", ");
}

function adPrimaryText(ad: Ad): string {
  const record = ad as unknown as Record<string, unknown>;
  const candidates = [
    record.primaryText,
    record.primary_text,
    record.copy,
    record.text,
    record.body,
    record.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return ad.name;
}

function adCtr(ad: Ad): number | null {
  const record = ad as unknown as Record<string, unknown>;
  for (const key of ["ctr", "todayCtr", "linkCtr"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function AdCard({
  ad,
  expanded,
  onToggleExpand,
}: {
  ad: Ad;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const primaryText = adPrimaryText(ad);
  const ctr = adCtr(ad);
  const hasLongCopy = primaryText.length > 140;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-800">
          {ad.creativeThumbnailUrl ? (
            <img
              src={ad.creativeThumbnailUrl}
              alt={ad.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-500">
              <ImageOff className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-100">{ad.name}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(ad.status)}`}>
              {statusLabel(ad.status)}
            </span>
          </div>

          <p className={`text-xs text-slate-300 ${expanded ? "" : "clamp-2"}`}>{primaryText}</p>
          {hasLongCopy && (
            <button
              onClick={onToggleExpand}
              className="mt-1 text-[11px] font-medium text-cyan-300 transition-colors hover:text-cyan-200"
            >
              {expanded ? "הצג פחות" : "הצג עוד"}
            </button>
          )}

          <div className="mt-2 text-[11px] text-slate-400">
            CTR {ctr !== null ? `${ctr.toFixed(2)}%` : "—"}
            {ad.creativeId ? ` · קריאייטיב ${ad.creativeId.slice(-6)}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-800/70" />
      ))}
    </div>
  );
}

export function CampaignExplorer({
  campaigns,
  currency = "USD",
  loading,
  vertical,
}: CampaignExplorerProps) {
  const campaignAction = useCampaignAction();
  const [search, setSearch] = useState("");
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<Set<string>>(new Set());
  const [expandedAdSetIds, setExpandedAdSetIds] = useState<Set<string>>(new Set());
  const [expandedCopyIds, setExpandedCopyIds] = useState<Set<string>>(new Set());
  const [mobileCampaignId, setMobileCampaignId] = useState<string | null>(null);
  const [mobileAdSetId, setMobileAdSetId] = useState<string | null>(null);

  const metricBundle = METRICS_BY_VERTICAL[vertical];

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query
      ? campaigns.filter((campaign) => campaignMatchesSearch(campaign, query))
      : campaigns;

    return [...base].sort(
      (a, b) => (b.todayInsights?.spend ?? 0) - (a.todayInsights?.spend ?? 0)
    );
  }, [campaigns, search]);

  const totals = useMemo(() => {
    return filteredCampaigns.reduce(
      (acc, campaign) => {
        const adSetCount = campaign.adsets?.length ?? 0;
        const adCount = (campaign.adsets ?? []).reduce(
          (sum, adset) => sum + (adset.ads?.length ?? 0),
          0
        );

        return {
          campaigns: acc.campaigns + 1,
          adsets: acc.adsets + adSetCount,
          ads: acc.ads + adCount,
        };
      },
      { campaigns: 0, adsets: 0, ads: 0 }
    );
  }, [filteredCampaigns]);

  const selectedCampaign =
    mobileCampaignId === null
      ? null
      : filteredCampaigns.find((campaign) => campaign.id === mobileCampaignId) ?? null;

  const selectedAdSet =
    mobileAdSetId === null
      ? null
      : selectedCampaign?.adsets?.find((adset) => adset.id === mobileAdSetId) ?? null;

  const toggleCampaignExpand = (campaignId: string) => {
    setExpandedCampaignIds((current) => {
      const next = new Set(current);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  const toggleAdSetExpand = (campaignId: string, adSetId: string) => {
    const key = `${campaignId}:${adSetId}`;
    setExpandedAdSetIds((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleCopyExpand = (id: string) => {
    setExpandedCopyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const emptyState =
    !loading && filteredCampaigns.length === 0 ? (
      <div className="px-5 py-12 text-center">
        <p className="text-sm font-medium text-slate-200">לא נמצאו קמפיינים בתצוגה הנוכחית.</p>
        <p className="mt-1 text-xs text-slate-400">אין פעולות פעילות כרגע.</p>
      </div>
    ) : null;

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] bg-[var(--bg-soft)]/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">סייר קמפיינים</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {totals.campaigns} קמפיינים · {totals.adsets} קבוצות מודעות · {totals.ads} מודעות
            </p>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="text"
              placeholder="חיפוש קמפיין, קבוצת מודעות או מודעה"
              className="focus-ring w-full rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <ExplorerSkeleton />
      ) : (
        <>
          <div className="md:hidden">
            {selectedCampaign === null ? (
              <div className="space-y-3 p-4">
                {filteredCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="clamp-2 text-sm font-semibold text-slate-100">{campaign.name}</p>
                        {campaign.accountName && (
                          <p className="mt-1 truncate text-xs text-slate-400">{campaign.accountName}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(campaign.status)}`}>
                        {statusLabel(campaign.status)}
                      </span>
                    </div>

                    <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-slate-800/80 bg-[#0c1328] px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{metricLabel("spend")}</p>
                        <p className="text-xs font-semibold text-slate-200">
                          {formatInsightMetric(campaign.todayInsights, "spend", currency)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-800/80 bg-[#0c1328] px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{metricLabel(metricBundle.result)}</p>
                        <p className="text-xs font-semibold text-slate-200">
                          {formatInsightMetric(campaign.todayInsights, metricBundle.result, currency)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-800/80 bg-[#0c1328] px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{metricLabel(metricBundle.efficiency)}</p>
                        <p className="text-xs font-semibold text-slate-200">
                          {formatInsightMetric(campaign.todayInsights, metricBundle.efficiency, currency)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setMobileCampaignId(campaign.id);
                          setMobileAdSetId(null);
                        }}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-cyan-500/20 px-3 text-sm font-medium text-cyan-200 ring-1 ring-cyan-400/30"
                      >
                        צפייה בקבוצות מודעות ({campaign.adsets?.length ?? 0})
                      </button>

                      <button
                        onClick={() =>
                          campaignAction.mutate({
                            accountId: campaign.accountId ?? "",
                            campaignId: campaign.id,
                            action: campaign.status === "ACTIVE" ? "pause" : "resume",
                          })
                        }
                        disabled={!campaign.accountId}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {campaign.status === "ACTIVE" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : selectedAdSet === null ? (
              <div className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => setMobileCampaignId(null)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-300"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{selectedCampaign.name}</p>
                    <p className="text-xs text-slate-400">קבוצות מודעות ({selectedCampaign.adsets?.length ?? 0})</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(selectedCampaign.adsets ?? []).map((adset) => (
                    <div
                      key={adset.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="clamp-2 text-sm font-semibold text-slate-100">{adset.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(adset.status)}`}>
                          {statusLabel(adset.status)}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-300">
                        <p className="truncate">קהל: {extractAudience(adset)}</p>
                        <p className="truncate">מיקומים: {extractLocation(adset)}</p>
                        <p>תקציב יומי: {formatCurrency(adset.dailyBudget, currency)}</p>
                      </div>

                      <button
                        onClick={() => setMobileAdSetId(adset.id)}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-500/20 text-sm font-medium text-indigo-200 ring-1 ring-indigo-400/35"
                      >
                        צפייה במודעות ({adset.ads?.length ?? 0})
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => setMobileAdSetId(null)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-300"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{selectedAdSet.name}</p>
                    <p className="text-xs text-slate-400">מודעות ({selectedAdSet.ads?.length ?? 0})</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(selectedAdSet.ads ?? []).map((ad) => {
                    const copyKey = `${selectedAdSet.id}:${ad.id}`;
                    return (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        expanded={expandedCopyIds.has(copyKey)}
                        onToggleExpand={() => toggleCopyExpand(copyKey)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#0b1227]">
                    <th className="w-10 px-3 py-3" />
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      קמפיין
                    </th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      סטטוס
                    </th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {metricLabel("spend")}
                    </th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {metricLabel(metricBundle.result)}
                    </th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {metricLabel(metricBundle.efficiency)}
                    </th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {metricLabel(metricBundle.quality)}
                    </th>
                    <th className="w-16 px-3 py-3" />
                  </tr>
                </thead>

                <tbody>
                  {filteredCampaigns.map((campaign) => {
                    const adsets = campaign.adsets ?? [];
                    const hasAdsets = adsets.length > 0;
                    const isCampaignExpanded = expandedCampaignIds.has(campaign.id);

                    return (
                      <Fragment key={campaign.id}>
                        <tr className="border-b border-slate-800/70 bg-[#070d1f] transition-colors hover:bg-[#111a34]">
                          <td className="px-3 py-3">
                            <button
                              disabled={!hasAdsets}
                              onClick={() => toggleCampaignExpand(campaign.id)}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                                hasAdsets
                                  ? "text-slate-300 hover:bg-slate-800"
                                  : "cursor-default text-slate-700"
                              }`}
                              title={hasAdsets ? "הצגת קבוצות מודעות" : "אין קבוצות מודעות"}
                            >
                              {isCampaignExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-3">
                            <p className="max-w-[24rem] truncate font-medium text-slate-100">{campaign.name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {objectiveLabel(campaign.objective)}
                              {campaign.accountName ? ` · ${campaign.accountName}` : ""}
                            </p>
                          </td>

                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(campaign.status)}`}>
                              {statusLabel(campaign.status)}
                            </span>
                          </td>

                          <td className="px-3 py-3 text-right font-mono text-sm text-slate-200">
                            {formatInsightMetric(campaign.todayInsights, "spend", currency)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-sm text-slate-200">
                            {formatInsightMetric(campaign.todayInsights, metricBundle.result, currency)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-sm text-slate-200">
                            {formatInsightMetric(campaign.todayInsights, metricBundle.efficiency, currency)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-sm text-slate-200">
                            {formatInsightMetric(campaign.todayInsights, metricBundle.quality, currency)}
                          </td>

                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() =>
                                campaignAction.mutate({
                                  accountId: campaign.accountId ?? "",
                                  campaignId: campaign.id,
                                  action: campaign.status === "ACTIVE" ? "pause" : "resume",
                                })
                              }
                              disabled={!campaign.accountId}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              title={campaign.status === "ACTIVE" ? "עצירת קמפיין" : "הפעלת קמפיין"}
                            >
                              {campaign.status === "ACTIVE" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {isCampaignExpanded && hasAdsets && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <div className="border-b border-slate-800/70 bg-[#0b1126] px-4 py-4">
                                <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                                  <table className="min-w-[880px] w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-800/70 bg-slate-900/60">
                                        <th className="w-10 px-3 py-2" />
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          קבוצת מודעות
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          סטטוס
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          קהלים
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          מיקומים
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          תקציב יומי
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                          מודעות
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {adsets.map((adset) => {
                                        const adsetKey = `${campaign.id}:${adset.id}`;
                                        const isAdSetExpanded = expandedAdSetIds.has(adsetKey);
                                        const hasAds = (adset.ads?.length ?? 0) > 0;

                                        return (
                                          <Fragment key={adset.id}>
                                            <tr className="border-b border-slate-800/60 bg-[#0f162d] transition-colors hover:bg-[#161f3f]">
                                              <td className="px-3 py-2.5">
                                                <button
                                                  onClick={() => toggleAdSetExpand(campaign.id, adset.id)}
                                                  disabled={!hasAds}
                                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                                                    hasAds
                                                      ? "text-slate-300 hover:bg-slate-800"
                                                      : "cursor-default text-slate-700"
                                                  }`}
                                                  title={hasAds ? "הצגת מודעות" : "אין מודעות"}
                                                >
                                                  {isAdSetExpanded ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                  ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                  )}
                                                </button>
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <p className="max-w-[17rem] truncate font-medium text-slate-200">
                                                  {adset.name}
                                                </p>
                                                <p className="mt-0.5 max-w-[17rem] truncate text-xs text-slate-500">
                                                  {adset.optimizationGoal ?? "ללא אופטימיזציה מוגדרת"}
                                                </p>
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(adset.status)}`}>
                                                  {statusLabel(adset.status)}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2.5 text-xs text-slate-300">
                                                {extractAudience(adset)}
                                              </td>
                                              <td className="px-3 py-2.5 text-xs text-slate-300">
                                                {extractLocation(adset)}
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-200">
                                                {formatCurrency(adset.dailyBudget, currency)}
                                              </td>
                                              <td className="px-3 py-2.5 text-right text-xs text-slate-300">
                                                {adset.ads?.length ?? 0}
                                              </td>
                                            </tr>

                                            {isAdSetExpanded && hasAds && (
                                              <tr className="border-b border-slate-800/60 bg-[#090f21]">
                                                <td colSpan={7} className="px-3 py-3">
                                                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                    פירוט ברמת מודעה
                                                  </div>
                                                  <div className="grid gap-3 xl:grid-cols-2">
                                                    {(adset.ads ?? []).map((ad) => {
                                                      const copyKey = `${adset.id}:${ad.id}`;
                                                      return (
                                                        <AdCard
                                                          key={ad.id}
                                                          ad={ad}
                                                          expanded={expandedCopyIds.has(copyKey)}
                                                          onToggleExpand={() =>
                                                            toggleCopyExpand(copyKey)
                                                          }
                                                        />
                                                      );
                                                    })}
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {emptyState}
        </>
      )}
    </div>
  );
}
