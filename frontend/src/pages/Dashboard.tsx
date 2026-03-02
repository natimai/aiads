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
        <Database className="mb-4 h-16 w-16 text-slate-600" />
        <h2 className="text-lg font-semibold text-white">No accounts connected</h2>
        <p className="mt-2 text-sm text-slate-400">Connect a Meta Ad Account to see your data</p>
        <Link
          to="/settings/accounts"
          className="mt-6 rounded-lg bg-accent-blue px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
        >
          Connect Account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-slate-400">
            {dateRange.label} · {formatDateDisplay(dateRange.from)}
            {dateRange.from !== dateRange.to && ` – ${formatDateDisplay(dateRange.to)}`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-accent-blue hover:text-accent-blue disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Syncing..." : "Sync Data"}
        </button>
      </div>

      {syncMsg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${syncMsg.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {syncMsg}
        </div>
      )}

      {topRecommendations.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Top AI Recommendations</h3>
            <Link to="/ai-insights" className="text-xs text-accent-blue hover:underline">
              Open Recommendation Center
            </Link>
          </div>
          <div className="space-y-2">
            {topRecommendations.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{rec.title}</span>
                  <span className="text-xs text-slate-400">{Math.round(rec.confidence * 100)}%</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-300">{rec.why || rec.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {noData && (
        <div className="flex flex-col items-center rounded-xl border border-slate-800 bg-navy-900 py-12">
          <Database className="mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">No campaign data yet</p>
          <p className="mt-1 text-xs text-slate-500">Click "Sync Data" to fetch campaigns from Meta</p>
        </div>
      )}

      <KPICards current={currentSummary} currency={currency} loading={isLoading} />

      <PerformanceChart data={insights ?? []} loading={insightsLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SpendDistribution campaigns={campaigns ?? []} currency={currency} loading={isLoading} />
        <TopBottomPerformers campaigns={campaigns ?? []} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
