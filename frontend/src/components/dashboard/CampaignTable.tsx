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
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAUSED: "bg-amber-50 text-amber-700",
  DELETED: "bg-rose-50 text-rose-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
  WITH_ISSUES: "bg-rose-50 text-rose-700",
};

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
    { key: "name" as SortKey, label: "Campaign" },
    { key: "status" as SortKey, label: "Status" },
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-6 flex-1 rounded bg-slate-100 skeleton" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const expandedRowColspan = columns.length + 2; // expand toggle + dynamic columns + actions

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Campaigns ({sorted.length})</h3>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="w-8 px-2 py-3" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`cursor-pointer px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 ${
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
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                      isExpanded ? "bg-indigo-50/30" : ""
                    }`}
                  >
                    <td className="px-2 py-3">
                      <button
                        onClick={() => toggleExpand(campaign.id)}
                        className={`rounded p-0.5 transition-colors ${
                          hasAdsets
                            ? "text-slate-400 hover:text-slate-600"
                            : "cursor-default text-slate-200"
                        }`}
                        disabled={!hasAdsets}
                        title={hasAdsets ? "Show ad sets" : "No ad sets available"}
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
                        <span className="max-w-[18rem] truncate font-medium text-slate-800">
                          {campaign.name}
                        </span>
                        {(recommendationsByCampaign[campaign.id] ?? 0) > 0 && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            {recommendationsByCampaign[campaign.id]} AI
                          </span>
                        )}
                        {hasAdsets && (
                          <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                            <Layers className="h-3 w-3" />
                            {campaign.adsets!.length}
                          </span>
                        )}
                      </div>
                      {campaign.accountName && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {campaign.accountName}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[campaign.status] ?? "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {campaign.status}
                      </span>
                    </td>

                    {metricColumns.map((metric) => (
                      <td
                        key={`${campaign.id}-${metric.key}`}
                        className="px-3 py-3 text-right font-mono text-sm text-slate-700"
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
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        title={campaign.status === "ACTIVE" ? "Pause" : "Resume"}
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
                    <tr className="border-b border-slate-100 bg-indigo-50/20">
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
        <div className="py-12 text-center text-sm text-slate-400">
          {search ? "No campaigns match your search" : "No campaigns found"}
        </div>
      )}
    </div>
  );
}

function AdSetsTable({ adsets, currency }: { adsets: AdSet[]; currency: string }) {
  return (
    <div className="my-2 ml-8 mr-2 overflow-hidden rounded-lg border border-slate-100 border-l-4 border-indigo-200 bg-indigo-50/30">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
        <Layers className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Ad Sets ({adsets.length})
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Name
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Status
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Optimization
            </th>
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Bid Strategy
            </th>
            <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Daily Budget
            </th>
            <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Ads
            </th>
          </tr>
        </thead>
        <tbody>
          {adsets.map((adset) => (
            <tr
              key={adset.id}
              className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-white/60"
            >
              <td className="px-4 py-2 text-slate-700">{adset.name}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_COLORS[adset.status] ?? "bg-slate-100 text-slate-500"
                  }`}
                >
                  {adset.status}
                </span>
              </td>
              <td className="px-4 py-2 text-[12px] text-slate-500">
                {adset.optimizationGoal ?? "—"}
              </td>
              <td className="px-4 py-2 text-[12px] text-slate-500">
                {adset.bidStrategy ?? "—"}
              </td>
              <td className="px-4 py-2 text-right font-mono text-[12px] text-slate-700">
                {formatCurrency(adset.dailyBudget, currency)}
              </td>
              <td className="px-4 py-2 text-right text-[12px] text-slate-500">
                {adset.ads?.length ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
