import { useState } from "react";
import { KPICards } from "../components/dashboard/KPICards";
import { CampaignTable } from "../components/dashboard/CampaignTable";
import { PerformanceChart } from "../components/dashboard/PerformanceChart";
import { SpendDistribution } from "../components/dashboard/SpendDistribution";
import { HourlyHeatmap } from "../components/dashboard/HourlyHeatmap";
import { CreativeMatrix } from "../components/dashboard/CreativeMatrix";
import { TopBottomPerformers } from "../components/dashboard/TopBottomPerformers";
import { ActionFeed } from "../components/dashboard/ActionFeed";
import { useCampaigns } from "../hooks/useCampaigns";
import { useInsights } from "../hooks/useInsights";
import {
  useRecommendations,
  useGenerateRecommendations,
  useReviewRecommendation,
  useExecuteRecommendation,
} from "../hooks/useRecommendations";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";
import { formatDateDisplay } from "../utils/dates";
import { syncAllAccounts } from "../services/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Database,
  Loader2,
  Brain,
  TrendingUp,
  BarChart3,
  X,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { RecommendationModifications, Campaign } from "../types";

export default function Dashboard() {
  const { selectedAccount, accounts, selectedAccountId } = useAccounts();
  const { dateRange } = useDateRange();
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: allRecommendations, isLoading: recsLoading } = useRecommendations({ limit: 50 });
  const generateMutation = useGenerateRecommendations();
  const reviewMutation = useReviewRecommendation();
  const executeMutation = useExecuteRecommendation();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const accountId = selectedAccountId ?? accounts[0]?.id;

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
        msg += ` · ${failed.length} failed`;
      }
      setSyncMsg(msg);
      await queryClient.invalidateQueries();
    } catch (e: unknown) {
      setSyncMsg(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  const busy =
    reviewMutation.isPending || executeMutation.isPending || generateMutation.isPending;

  const handleApprove = async (recId: string, modifications?: RecommendationModifications) => {
    await reviewMutation.mutateAsync({
      recommendationId: recId,
      decision: "approve",
      modifications: modifications as Record<string, unknown> | undefined,
    });
  };

  const handleApproveAndExecute = async (
    recId: string,
    modifications?: RecommendationModifications
  ) => {
    await reviewMutation.mutateAsync({
      recommendationId: recId,
      decision: "approve",
      modifications: modifications as Record<string, unknown> | undefined,
    });
    await executeMutation.mutateAsync({ recommendationId: recId });
  };

  const handleReject = (recId: string) => {
    reviewMutation.mutate({ recommendationId: recId, decision: "reject" });
  };

  const noData =
    !isLoading &&
    !insightsLoading &&
    (!campaigns || campaigns.length === 0) &&
    accounts.length > 0;

  const currentSummary = (() => {
    const data = insights ?? [];
    if (data.length === 0) return selectedAccount?.kpiSummary;
    const totalSpend = data.reduce((s, i) => s + (i.spend ?? 0), 0);
    const totalImpressions = data.reduce((s, i) => s + (i.impressions ?? 0), 0);
    const totalClicks = data.reduce((s, i) => s + (i.clicks ?? 0), 0);
    const totalLeads = data.reduce((s: number, i) => s + (i.leads ?? 0), 0);
    const totalLinkClicks = data.reduce((s: number, i) => s + (i.linkClicks ?? 0), 0);
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
  const recommendations = allRecommendations ?? [];
  const recommendationsByCampaign = recommendations.reduce(
    (acc, rec) => {
      if (rec.entityLevel !== "campaign" || !rec.entityId) return acc;
      acc[rec.entityId] = (acc[rec.entityId] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const managedAccounts = accounts.filter((a) => a.isManagedByPlatform);

  if (accounts.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 border border-slate-200">
          <Database className="h-7 w-7 text-slate-400" />
        </div>
        <h2 className="text-base font-semibold text-slate-800">No accounts connected</h2>
        <p className="mt-1.5 max-w-xs text-center text-sm text-slate-500">
          Connect a Meta Ad Account to start managing your campaigns with Nati AI.
        </p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Connect Account
        </Link>
      </div>
    );
  }

  if (managedAccounts.length === 0 && accounts.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100">
          <Brain className="h-7 w-7 text-indigo-500" />
        </div>
        <h2 className="text-base font-semibold text-slate-800">No managed accounts</h2>
        <p className="mt-1.5 max-w-sm text-center text-sm text-slate-500">
          You have {accounts.length} connected account{accounts.length > 1 ? "s" : ""} but none are enabled for Nati AI management.
        </p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Enable Accounts
        </Link>
      </div>
    );
  }

  const topCampaigns = getTopCampaigns(campaigns ?? [], 5);

  return (
    <div className="space-y-4">
      {/* Page header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            {dateRange.label} · {formatDateDisplay(dateRange.from)}
            {dateRange.from !== dateRange.to && ` – ${formatDateDisplay(dateRange.to)}`}
          </p>
          {syncMsg && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                syncMsg.startsWith("Error")
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {syncMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {noData && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white py-16 shadow-sm">
          <WifiOff className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No campaign data</p>
          <p className="mt-1 text-[12px] text-slate-400">
            Click &ldquo;Sync&rdquo; above to fetch your campaigns from Meta
          </p>
        </div>
      )}

      {/* 70/30 split: Action Feed | Sidebar */}
      <div className="flex flex-col gap-5 xl:flex-row">
        {/* LEFT: Action Feed (70%) */}
        <div className="min-w-0 xl:w-[70%]">
          <ActionFeed
            recommendations={recommendations}
            loading={recsLoading}
            busy={busy}
            onApprove={handleApprove}
            onApproveAndExecute={handleApproveAndExecute}
            onReject={handleReject}
            onGenerate={() => generateMutation.mutate()}
            generating={generateMutation.isPending}
            hasAccount={!!accountId}
          />
        </div>

        {/* RIGHT: Context sidebar (30%) */}
        <div className="space-y-4 xl:w-[30%]">
          {/* KPI Strip */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
              Performance KPIs
            </h3>
            <KPICards current={currentSummary} currency={currency} loading={isLoading} />
          </div>

          {/* Top Performing Campaigns */}
          {topCampaigns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                Top Performers
              </h3>
              <div className="space-y-2">
                {topCampaigns.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-700">
                        {c.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600">
                      {c.todayInsights?.roas
                        ? `${c.todayInsights.roas.toFixed(2)}x`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Full Analytics */}
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <BarChart3 className="h-4 w-4" />
            View Full Analytics
          </button>

          {/* Sync status */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <Wifi className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-[11px] text-slate-500">
              {accounts.filter(a => a.isManagedByPlatform).length} account{accounts.filter(a => a.isManagedByPlatform).length !== 1 ? "s" : ""} managed by Nati AI
            </span>
          </div>
        </div>
      </div>

      {/* Campaign Table */}
      <CampaignTable
        campaigns={campaigns ?? []}
        currency={currency}
        loading={isLoading}
        recommendationsByCampaign={recommendationsByCampaign}
      />

      {/* Full Analytics Modal */}
      {analyticsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-12"
          onClick={() => setAnalyticsOpen(false)}
        >
          <div
            className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">Full Analytics</h2>
              <button
                onClick={() => setAnalyticsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-6">
              <PerformanceChart data={insights ?? []} loading={insightsLoading} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <SpendDistribution
                  campaigns={campaigns ?? []}
                  currency={currency}
                  loading={isLoading}
                />
                <TopBottomPerformers campaigns={campaigns ?? []} loading={isLoading} />
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <HourlyHeatmap data={insights ?? []} loading={insightsLoading} />
                <CreativeMatrix
                  campaigns={campaigns ?? []}
                  currency={currency}
                  loading={isLoading}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTopCampaigns(campaigns: Campaign[], limit: number): Campaign[] {
  return campaigns
    .filter((c) => c.todayInsights && c.todayInsights.roas > 0)
    .sort((a, b) => (b.todayInsights?.roas ?? 0) - (a.todayInsights?.roas ?? 0))
    .slice(0, limit);
}
