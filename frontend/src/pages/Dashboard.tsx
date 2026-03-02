import { useState } from "react";
import { KPICards } from "../components/dashboard/KPICards";
import { CampaignTable } from "../components/dashboard/CampaignTable";
import { PerformanceChart } from "../components/dashboard/PerformanceChart";
import { SpendDistribution } from "../components/dashboard/SpendDistribution";
import { HourlyHeatmap } from "../components/dashboard/HourlyHeatmap";
import { CreativeMatrix } from "../components/dashboard/CreativeMatrix";
import { TopBottomPerformers } from "../components/dashboard/TopBottomPerformers";
import { useCampaigns } from "../hooks/useCampaigns";
import { useInsights } from "../hooks/useInsights";
import { useRecommendations } from "../hooks/useRecommendations";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";
import { formatDateDisplay } from "../utils/dates";
import { syncAllAccounts } from "../services/api";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { selectedAccount, accounts, selectedAccountId } = useAccounts();
  const { dateRange } = useDateRange();
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: recommendations } = useRecommendations({ status: "pending", limit: 20 });
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await syncAllAccounts();
      const ok = res.synced.filter((s) => !s.error);
      const failed = res.synced.filter((s) => s.error);
      let msg = `Synced ${ok.length} of ${res.count} accounts`;
      if (ok.length > 0) {
        const totalCampaigns = ok.reduce((s, a) => s + (a.campaigns ?? 0), 0);
        msg += ` (${totalCampaigns} campaigns)`;
      }
      if (failed.length > 0) {
        msg += ` | ${failed.length} failed: ${failed[0]?.error ?? "Unknown error"}`;
      }
      setSyncMsg(msg);
      await queryClient.invalidateQueries();
    } catch (e: any) {
      setSyncMsg(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const noData = !isLoading && !insightsLoading && (!campaigns || campaigns.length === 0) && accounts.length > 0;

  const currentSummary = (() => {
    const data = insights ?? [];
    if (data.length === 0) return selectedAccount?.kpiSummary;
    const totalSpend = data.reduce((s, i) => s + (i.spend ?? 0), 0);
    const totalImpressions = data.reduce((s, i) => s + (i.impressions ?? 0), 0);
    const totalClicks = data.reduce((s, i) => s + (i.clicks ?? 0), 0);
    const totalLeads = data.reduce((s: number, i: any) => s + (i.leads ?? 0), 0);
    const totalLinkClicks = data.reduce((s: number, i: any) => s + (i.linkClicks ?? 0), 0);
    const totalInstalls = data.reduce((s, i) => s + (i.installs ?? 0), 0);
    const totalPurchases = data.reduce((s, i) => s + (i.purchases ?? 0), 0);
    const totalPurchaseValue = data.reduce((s, i) => s + (i.purchaseValue ?? 0), 0);
    return {
      date: dateRange.to,
      totalSpend,
      totalImpressions,
      totalClicks,
      totalLeads,
      totalLinkClicks,
      totalInstalls,
      totalPurchases,
      totalPurchaseValue,
      avgCostPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
      avgCPI: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
      avgCPM: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      roas: totalSpend > 0 ? totalPurchaseValue / totalSpend : 0,
    };
  })();

  const currency = selectedAccount?.currency ?? "USD";
  const topRecommendations = (recommendations ?? [])
    .slice()
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority];
    })
    .slice(0, 3);
  const recommendationsByCampaign = (recommendations ?? []).reduce((acc, rec) => {
    if (rec.entityLevel !== "campaign" || !rec.entityId) return acc;
    acc[rec.entityId] = (acc[rec.entityId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (accounts.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-navy-900">
          <Database className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-base font-semibold text-white">No accounts connected</h2>
        <p className="mt-1.5 text-sm text-slate-500">Connect a Meta Ad Account to start tracking your campaigns</p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-lg bg-accent-blue px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Connect Account
        </Link>
      </div>
    );
  }

  const priorityBadge = {
    high: "bg-red-500/15 text-red-400 border-red-500/20",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    low: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">
            {dateRange.label} · {formatDateDisplay(dateRange.from)}
            {dateRange.from !== dateRange.to && ` – ${formatDateDisplay(dateRange.to)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className={`text-[11px] ${syncMsg.startsWith("Error") ? "text-red-400" : "text-accent-green"}`}>
              {syncMsg}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded border border-slate-700/60 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {topRecommendations.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-navy-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[12px] font-semibold text-white">AI Recommendations</h3>
              <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-blue">
                {topRecommendations.length} pending
              </span>
            </div>
            <Link to="/ai-insights" className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-slate-800/60">
            {topRecommendations.map((rec) => (
              <div key={rec.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/20 transition-colors">
                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityBadge[rec.priority]}`}>
                  {rec.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-100 leading-snug">{rec.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{rec.why || rec.reasoning}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                  {Math.round(rec.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {noData && (
        <div className="flex flex-col items-center rounded-lg border border-slate-800 bg-navy-900 py-16">
          <Database className="mb-3 h-8 w-8 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">No campaign data</p>
          <p className="mt-1 text-[12px] text-slate-600">Click "Sync" to fetch your campaigns from Meta</p>
        </div>
      )}

      <KPICards current={currentSummary} currency={currency} loading={isLoading} />

      <PerformanceChart data={insights ?? []} loading={insightsLoading} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SpendDistribution campaigns={campaigns ?? []} currency={currency} loading={isLoading} />
        <TopBottomPerformers campaigns={campaigns ?? []} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HourlyHeatmap data={insights ?? []} loading={insightsLoading} />
        <CreativeMatrix campaigns={campaigns ?? []} currency={currency} loading={isLoading} />
      </div>

      <CampaignTable
        campaigns={campaigns ?? []}
        currency={currency}
        loading={isLoading}
        recommendationsByCampaign={recommendationsByCampaign}
      />
    </div>
  );
}
