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
  ChevronDown,
  ChevronUp,
  Brain,
  TrendingUp,
  BarChart3,
  X,
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
        msg += ` | ${failed.length} failed: ${failed[0]?.error ?? "Unknown error"}`;
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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-navy-900">
          <Database className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-base font-semibold text-white">No accounts connected</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Connect a Meta Ad Account to start tracking your campaigns
        </p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-lg bg-accent-blue px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Connect Account
        </Link>
      </div>
    );
  }

  if (managedAccounts.length === 0 && accounts.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-navy-900">
          <Brain className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-base font-semibold text-white">
          No managed accounts
        </h2>
        <p className="mt-1.5 max-w-sm text-center text-sm text-slate-500">
          You have {accounts.length} connected account
          {accounts.length > 1 ? "s" : ""} but none are set to be managed by
          Nati AI. Enable management in Account Settings.
        </p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-lg bg-accent-blue px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Manage Accounts
        </Link>
      </div>
    );
  }

  const topCampaigns = getTopCampaigns(campaigns ?? [], 5);

  return (
    <div className="space-y-4">
      {/* Sticky Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">
            {dateRange.label} · {formatDateDisplay(dateRange.from)}
            {dateRange.from !== dateRange.to && ` – ${formatDateDisplay(dateRange.to)}`}
          </p>
          {syncMsg && (
            <span
              className={`text-[11px] ${syncMsg.startsWith("Error") ? "text-red-400" : "text-accent-green"}`}
            >
              {syncMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded border border-slate-700/60 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !accountId}
            className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {generateMutation.isPending ? "מנתח..." : "Generate AI Tasks"}
          </button>
        </div>
      </div>

      {noData && (
        <div className="flex flex-col items-center rounded-lg border border-slate-800 bg-navy-900 py-16">
          <Database className="mb-3 h-8 w-8 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">No campaign data</p>
          <p className="mt-1 text-[12px] text-slate-600">
            Click &quot;Sync&quot; to fetch your campaigns from Meta
          </p>
        </div>
      )}

      {/* Main content: 70/30 split on desktop */}
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
          {/* KPI Cards stacked */}
          <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BarChart3 className="h-3.5 w-3.5" />
              KPIs
            </h3>
            <KPICards current={currentSummary} currency={currency} loading={isLoading} />
          </div>

          {/* Top Performing Campaigns */}
          {topCampaigns.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-navy-900 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <TrendingUp className="h-3.5 w-3.5" />
                Top Performing
              </h3>
              <div className="space-y-2">
                {topCampaigns.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-blue/15 text-[10px] font-bold text-accent-blue">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-200">
                        {c.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-400">
                      {c.todayInsights?.roas
                        ? `${c.todayInsights.roas.toFixed(2)}x`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Full Analytics button */}
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-navy-900 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <BarChart3 className="h-4 w-4" />
            View Full Analytics
          </button>
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-12"
          onClick={() => setAnalyticsOpen(false)}
        >
          <div
            className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-navy-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-navy-950 px-6 py-4 rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">Full Analytics</h2>
              <button
                onClick={() => setAnalyticsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
