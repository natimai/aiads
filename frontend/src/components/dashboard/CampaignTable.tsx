import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  ArrowUpDown,
  Search,
  Layers,
} from "lucide-react";
import { formatCurrency } from "../../utils/format";
import { useCampaignAction } from "../../hooks/useCampaigns";
import {
  formatInsightMetric,
  getMetricsForVertical,
  metricSortValue,
} from "../../utils/metricsConfig";
import type {
  AccountVertical,
  Campaign,
  AdSet,
  DashboardMetricKey,
} from "../../types";

interface CampaignTableProps {
  campaigns: Campaign[];
  currency?: string;
  loading?: boolean;
  recommendationsByCampaign?: Record<string, number>;
  vertical: AccountVertical;
}

type SortKey = "name" | "status" | DashboardMetricKey;
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  PAUSED: "bg-amber-500/15 text-amber-200",
  DELETED: "bg-rose-500/15 text-rose-200",
  ARCHIVED: "bg-slate-500/15 text-slate-300",
  WITH_ISSUES: "bg-rose-500/15 text-rose-200",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  PAUSED: "מושהה",
  DELETED: "נמחק",
  ARCHIVED: "בארכיון",
  WITH_ISSUES: "עם תקלות",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function CampaignTable({
  campaigns,
  currency = "USD",
  loading,
  recommendationsByCampaign = {},
  vertical,
}: CampaignTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const campaignAction = useCampaignAction();

  const metricColumns = getMetricsForVertical(vertical);
  const columns: Array<{ key: SortKey; label: string; align?: "right" }> = [
    { key: "name" as SortKey, label: "קמפיין" },
    { key: "status" as SortKey, label: "סטטוס" },
    ...metricColumns.map((metric) => ({
      key: metric.key as SortKey,
      label: metric.label,
      align: "right" as const,
    })),
  ];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    if (sortKey === "name") {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortKey === "status") {
      aVal = a.status;
      bVal = b.status;
    } else {
      aVal = metricSortValue(a.todayInsights, sortKey);
      bVal = metricSortValue(b.todayInsights, sortKey);
    }

    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (loading) {
    return (
      <div className="panel p-4">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-6 flex-1 rounded bg-[var(--line)] skeleton" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const expandedRowColspan = columns.length + 2; // expand toggle + dynamic columns + actions

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">קמפיינים ({sorted.length})</h3>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש קמפיינים..."
            className="focus-ring w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] py-1.5 pl-3 pr-9 text-sm text-[var(--text-primary)] sm:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--bg-soft)]">
              <th className="w-8 px-2 py-3" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`cursor-pointer px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <ArrowUpDown className="h-3 w-3 text-indigo-500" />
                    )}
                  </span>
                </th>
              ))}
              <th className="w-16 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((campaign) => {
              const insights = campaign.todayInsights;
              const isExpanded = expandedIds.has(campaign.id);
              const hasAdsets = (campaign.adsets?.length ?? 0) > 0;

              return (
                <Fragment key={campaign.id}>
                  <tr
                    className={`border-b border-[var(--line)] transition-colors hover:bg-[var(--bg-soft)] ${
                      isExpanded ? "bg-[var(--bg-soft-2)]/40" : ""
                    }`}
                  >
                    <td className="px-2 py-3">
                      <button
                        onClick={() => toggleExpand(campaign.id)}
                        className={`rounded p-0.5 transition-colors ${
                          hasAdsets
                            ? "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            : "cursor-default text-[var(--line-strong)]"
                        }`}
                        disabled={!hasAdsets}
                        title={hasAdsets ? "הצגת קבוצות מודעות" : "אין קבוצות מודעות"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[18rem] truncate font-medium text-[var(--text-primary)]">
                          {campaign.name}
                        </span>
                        {(recommendationsByCampaign[campaign.id] ?? 0) > 0 && (
                          <span className="rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-200">
                            {recommendationsByCampaign[campaign.id]} AI
                          </span>
                        )}
                        {hasAdsets && (
                          <span className="flex items-center gap-0.5 text-[11px] text-[var(--text-muted)]">
                            <Layers className="h-3 w-3" />
                            {campaign.adsets!.length}
                          </span>
                        )}
                      </div>
                      {campaign.accountName && (
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                          {campaign.accountName}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[campaign.status] ?? "bg-slate-500/15 text-slate-300"
                        }`}
                      >
                        {statusLabel(campaign.status)}
                      </span>
                    </td>

                    {metricColumns.map((metric) => (
                      <td
                        key={`${campaign.id}-${metric.key}`}
                        className="px-3 py-3 text-right font-mono text-sm text-[var(--text-primary)]"
                      >
                        {formatInsightMetric(insights, metric.key, currency)}
                      </td>
                    ))}

                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() =>
                          campaignAction.mutate({
                            accountId: campaign.accountId ?? "",
                            campaignId: campaign.id,
                            action:
                              campaign.status === "ACTIVE" ? "pause" : "resume",
                          })
                        }
                        className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text-secondary)]"
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

                  {isExpanded && hasAdsets && (
                    <tr className="border-b border-[var(--line)] bg-[var(--bg-soft)]/50">
                      <td colSpan={expandedRowColspan} className="px-0 py-0">
                        <AdSetsTable adsets={campaign.adsets!} currency={currency} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          {search ? "לא נמצאו קמפיינים לחיפוש שהוזן" : "לא נמצאו קמפיינים"}
        </div>
      )}
    </div>
  );
}

function AdSetsTable({ adsets, currency }: { adsets: AdSet[]; currency: string }) {
  return (
    <div className="my-2 ml-8 mr-2 overflow-hidden rounded-lg border border-[var(--line)] border-l-4 border-indigo-300/40 bg-[var(--bg-soft)]/50">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2">
        <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          קבוצות מודעות ({adsets.length})
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              שם
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              סטטוס
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              אופטימיזציה
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              אסטרטגיית ביד
            </th>
            <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              תקציב יומי
            </th>
            <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              מודעות
            </th>
          </tr>
        </thead>
        <tbody>
          {adsets.map((adset) => (
            <tr
              key={adset.id}
              className="border-b border-[var(--line)] transition-colors last:border-b-0 hover:bg-[var(--bg-soft)]"
            >
              <td className="px-4 py-2 text-[var(--text-primary)]">{adset.name}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_COLORS[adset.status] ?? "bg-slate-500/15 text-slate-300"
                  }`}
                >
                  {statusLabel(adset.status)}
                </span>
              </td>
              <td className="px-4 py-2 text-[12px] text-[var(--text-secondary)]">
                {adset.optimizationGoal ?? "—"}
              </td>
              <td className="px-4 py-2 text-[12px] text-[var(--text-secondary)]">
                {adset.bidStrategy ?? "—"}
              </td>
              <td className="px-4 py-2 text-right font-mono text-[12px] text-[var(--text-primary)]">
                {formatCurrency(adset.dailyBudget, currency)}
              </td>
              <td className="px-4 py-2 text-right text-[12px] text-[var(--text-secondary)]">
                {adset.ads?.length ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
