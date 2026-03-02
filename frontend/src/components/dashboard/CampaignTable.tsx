import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent, formatROAS } from "../../utils/format";
import { useCampaignAction } from "../../hooks/useCampaigns";
import type { Campaign } from "../../types";

interface CampaignTableProps {
  campaigns: Campaign[];
  currency?: string;
  loading?: boolean;
  recommendationsByCampaign?: Record<string, number>;
}

type SortKey = "name" | "status" | "spend" | "leads" | "costPerLead" | "ctr" | "cpm" | "impressions" | "clicks";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400",
  PAUSED: "bg-yellow-500/20 text-yellow-400",
  DELETED: "bg-red-500/20 text-red-400",
  ARCHIVED: "bg-slate-500/20 text-slate-400",
  WITH_ISSUES: "bg-red-500/20 text-red-400",
};

export function CampaignTable({
  campaigns,
  currency = "USD",
  loading,
  recommendationsByCampaign = {},
}: CampaignTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const campaignAction = useCampaignAction();

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

  const getInsightValue = (c: Campaign, key: string): number => {
    const insights = c.todayInsights;
    if (!insights) return 0;
    return (insights as unknown as Record<string, number>)[key] ?? 0;
  };

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    if (sortKey === "name") {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortKey === "status") {
      aVal = a.status;
      bVal = b.status;
    } else {
      aVal = getInsightValue(a, sortKey);
      bVal = getInsightValue(b, sortKey);
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-6 flex-1 rounded bg-slate-800 skeleton" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "name", label: "Campaign" },
    { key: "status", label: "Status" },
    { key: "spend", label: "Spend", align: "right" },
    { key: "leads", label: "Leads", align: "right" },
    { key: "costPerLead", label: "CPL", align: "right" },
    { key: "ctr", label: "CTR", align: "right" },
    { key: "cpm", label: "CPM", align: "right" },
    { key: "impressions", label: "Impr.", align: "right" },
    { key: "clicks", label: "Clicks", align: "right" },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-navy-900 dark:border-slate-800 dark:bg-navy-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Campaigns ({sorted.length})</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="rounded-lg border border-slate-700 bg-navy-800 py-1.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="w-8 px-2 py-3" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`cursor-pointer px-3 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 hover:text-slate-200 ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <ArrowUpDown className="h-3 w-3 text-accent-blue" />
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
              const rowColor = "hover:bg-slate-800/50";

              return (
                <tr
                  key={campaign.id}
                  className={`border-b border-slate-800/50 transition-colors ${rowColor}`}
                >
                  <td className="px-2 py-3">
                    <button
                      onClick={() => toggleExpand(campaign.id)}
                      className="rounded p-0.5 text-slate-500 hover:text-slate-300"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-white">{campaign.name}</div>
                      {(recommendationsByCampaign[campaign.id] ?? 0) > 0 && (
                        <span className="rounded bg-accent-blue/20 px-2 py-0.5 text-xs text-accent-blue">
                          {recommendationsByCampaign[campaign.id]} AI
                        </span>
                      )}
                    </div>
                    {campaign.accountName && (
                      <div className="text-xs text-slate-500">{campaign.accountName}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status] ?? "bg-slate-600/20 text-slate-400"}`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights ? formatCurrency(insights.spend, currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights && (insights as any).leads ? formatNumber((insights as any).leads) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights && (insights as any).costPerLead ? formatCurrency((insights as any).costPerLead, currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights ? formatPercent(insights.ctr) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights ? formatCurrency(insights.cpm, currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights ? formatNumber(insights.impressions) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">
                    {insights ? formatNumber(insights.clicks) : "—"}
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
                      className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
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
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-500">
          {search ? "No campaigns match your search" : "No campaigns found"}
        </div>
      )}
    </div>
  );
}
