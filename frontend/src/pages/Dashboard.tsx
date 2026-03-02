import { useState } from "react";
import { CampaignTable } from "../components/dashboard/CampaignTable";
import { PerformanceChart } from "../components/dashboard/PerformanceChart";
import { SpendDistribution } from "../components/dashboard/SpendDistribution";
import { HourlyHeatmap } from "../components/dashboard/HourlyHeatmap";
import { CreativeMatrix } from "../components/dashboard/CreativeMatrix";
import { TopBottomPerformers } from "../components/dashboard/TopBottomPerformers";
import { ActionFeed } from "../components/dashboard/ActionFeed";
import { useCampaigns } from "../hooks/useCampaigns";
import { useInsights } from "../hooks/useInsights";
import { useTasks } from "../hooks/useTasks";
import {
  useReviewRecommendation,
  useExecuteRecommendation,
} from "../hooks/useRecommendations";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";
import { formatDateDisplay } from "../utils/dates";
import { formatCurrency, formatNumber, formatPercent, formatROAS } from "../utils/format";
import { syncAllAccounts } from "../services/api";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, Brain, X, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import type { RecommendationModifications, Campaign, KPISummary } from "../types";

/* ─── Material Symbol helper ──────────────────────────────────── */
function MS({
  name,
  size = 20,
  filled = false,
  className = "",
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined leading-none select-none ${className}`}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}

/* ─── 2×2 KPI Grid ────────────────────────────────────────────── */
interface KpiTile {
  label: string;
  value: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendUp?: boolean | null; // null = neutral
}

function KpiGrid({
  summary,
  currency,
  loading,
}: {
  summary?: KPISummary;
  currency: string;
  loading: boolean;
}) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
          />
        ))}
      </div>
    );
  }

  const hasRoas = (summary.roas ?? 0) > 0;
  const hasLeads = (summary.totalLeads ?? 0) > 0;

  const tiles: KpiTile[] = [
    {
      label: "Spend",
      value: formatCurrency(summary.totalSpend, currency),
      icon: "payments",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      trendUp: null,
    },
    hasRoas
      ? {
          label: "ROAS",
          value: formatROAS(summary.roas),
          icon: "trending_up",
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          trendUp: summary.roas > 2,
        }
      : hasLeads
      ? {
          label: "CPL",
          value: formatCurrency(summary.avgCostPerLead ?? 0, currency),
          icon: "person_add",
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          trendUp: null,
        }
      : {
          label: "CPM",
          value: formatCurrency(summary.avgCPM, currency),
          icon: "visibility",
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          trendUp: null,
        },
    {
      label: "CTR",
      value: formatPercent(summary.avgCTR),
      icon: "ads_click",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      trendUp: summary.avgCTR > 1,
    },
    {
      label: "Impressions",
      value: formatNumber(summary.totalImpressions),
      icon: "bar_chart",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      trendUp: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex h-32 flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/80 p-3 transition-colors hover:bg-white hover:shadow-sm"
        >
          {/* Icon */}
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile.iconBg}`}
          >
            <MS name={tile.icon} size={18} filled className={tile.iconColor} />
          </div>

          {/* Value + label */}
          <div>
            {tile.trendUp !== null && tile.trendUp !== undefined && (
              <span
                className={`mb-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tile.trendUp
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                <MS
                  name={tile.trendUp ? "arrow_upward" : "arrow_downward"}
                  size={10}
                />
              </span>
            )}
            <p className="text-xl font-bold tabular-nums text-slate-900 leading-none">
              {tile.value}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              {tile.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── AI Insight gradient card ────────────────────────────────── */
function AIInsightCard({ taskTotal, campaigns }: { taskTotal: number; campaigns: Campaign[] }) {
  const topRoas = campaigns.find((c) => (c.todayInsights?.roas ?? 0) > 0);
  const insight =
    taskTotal > 0
      ? `Nati AI has ${taskTotal} action${taskTotal > 1 ? "s" : ""} ready. Review them to optimise your spend efficiency.`
      : topRoas
      ? `"${topRoas.name}" is your top performer with ${topRoas.todayInsights!.roas.toFixed(2)}x ROAS. Consider scaling its budget.`
      : "All campaigns look healthy. Nati AI is monitoring your accounts 24/7.";

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600 via-primary to-violet-600 p-4 shadow-lg shadow-indigo-500/20">
      {/* Background glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-violet-400/20 blur-xl" />

      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <MS name="auto_awesome" size={16} filled className="text-white/90" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            AI Insight
          </span>
        </div>
        <p className="text-sm font-medium text-white/95 leading-relaxed">{insight}</p>
      </div>
    </div>
  );
}

/* ─── Top Movers list ─────────────────────────────────────────── */
function TopMovers({ campaigns, loading }: { campaigns: Campaign[]; loading: boolean }) {
  const top = getTopCampaigns(campaigns, 4);
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }
  if (top.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {top.map((c, i) => {
        const roas = c.todayInsights?.roas ?? 0;
        return (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50 transition-colors"
          >
            {/* Rank badge */}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600">
              {i + 1}
            </span>
            {/* Name */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-slate-700">{c.name}</p>
            </div>
            {/* ROAS */}
            <div className="flex items-center gap-0.5 shrink-0">
              <MS
                name="arrow_upward"
                size={12}
                className="text-emerald-500"
              />
              <span className="text-xs font-semibold tabular-nums text-emerald-600">
                {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Dashboard page ──────────────────────────────────────────── */
export default function Dashboard() {
  const { selectedAccount, accounts } = useAccounts();
  const { dateRange } = useDateRange();
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: tasksData, isLoading: tasksLoading } = useTasks({
    status: "pending",
    limit: 50,
  });
  const reviewMutation = useReviewRecommendation();
  const executeMutation = useExecuteRecommendation();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

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
      if (failed.length > 0) msg += ` · ${failed.length} failed`;
      setSyncMsg(msg);
      await queryClient.invalidateQueries();
    } catch (e: unknown) {
      setSyncMsg(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  const busy = reviewMutation.isPending || executeMutation.isPending;

  const handleApprove = async (
    recId: string,
    modifications?: RecommendationModifications
  ) => {
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
  const recommendations = tasksData?.tasks ?? [];
  const recommendationsByCampaign = recommendations.reduce(
    (acc, rec) => {
      if (rec.entityLevel !== "campaign" || !rec.entityId) return acc;
      acc[rec.entityId] = (acc[rec.entityId] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const managedAccounts = accounts.filter((a) => a.isManagedByPlatform);

  /* ─ Empty states ──────────────────────────────────────────────── */
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
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
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
          You have {accounts.length} connected account{accounts.length > 1 ? "s" : ""} but
          none are enabled for Nati AI management.
        </p>
        <Link
          to="/settings/accounts"
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Enable Accounts
        </Link>
      </div>
    );
  }

  /* ─ Main view ─────────────────────────────────────────────────── */
  const greeting = tasksData?.greeting ?? getLocalGreeting();
  const taskTotal = tasksData?.total ?? 0;
  const highCount = recommendations.filter((r) => r.priority === "high").length;
  const topCampaigns = getTopCampaigns(campaigns ?? [], 4);
  const greetingEmoji = getGreetingEmoji(greeting);

  return (
    <div className="space-y-6">
      {/* ── Large greeting headline ──────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {greeting},{" "}
            <span className="text-primary">Netanel</span>
            {" "}{greetingEmoji}
          </h1>
          <p className="mt-1.5 text-base text-slate-500">
            {tasksLoading ? (
              "Loading your inbox…"
            ) : taskTotal > 0 ? (
              <>
                You have{" "}
                {highCount > 0 && (
                  <>
                    <span className="font-semibold text-rose-600">
                      {highCount} urgent alert{highCount !== 1 ? "s" : ""}
                    </span>{" "}
                    and{" "}
                  </>
                )}
                <span className="font-semibold text-emerald-600">
                  {taskTotal} task{taskTotal !== 1 ? "s" : ""}
                </span>{" "}
                ready for review.
              </>
            ) : (
              "Inbox zero — all campaigns look healthy."
            )}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {dateRange.label} · {formatDateDisplay(dateRange.from)}
            {dateRange.from !== dateRange.to && ` – ${formatDateDisplay(dateRange.to)}`}
          </p>
        </div>

        {/* Sync controls */}
        <div className="flex items-center gap-2 shrink-0">
          {syncMsg && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                syncMsg.startsWith("Error")
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {syncMsg}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MS name="sync" size={16} />
            )}
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {/* No data notice */}
      {noData && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white py-16 shadow-sm">
          <WifiOff className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No campaign data</p>
          <p className="mt-1 text-xs text-slate-400">
            Click &ldquo;Sync&rdquo; above to fetch your campaigns from Meta
          </p>
        </div>
      )}

      {/* ── 70/30 split ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 xl:flex-row">
        {/* LEFT: Task Inbox (70%) */}
        <div className="min-w-0 xl:w-[70%]">
          <ActionFeed
            recommendations={recommendations}
            groups={tasksData?.groups}
            loading={tasksLoading}
            busy={busy}
            onApprove={handleApprove}
            onApproveAndExecute={handleApproveAndExecute}
            onReject={handleReject}
          />
        </div>

        {/* RIGHT: Context sidebar (30%) */}
        <div className="space-y-4 xl:w-[30%]">
          {/* 2×2 KPI grid */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <MS name="bar_chart" size={14} className="text-indigo-500" />
              Performance
            </h3>
            <KpiGrid summary={currentSummary} currency={currency} loading={isLoading} />
          </div>

          {/* Top Movers */}
          {(topCampaigns.length > 0 || isLoading) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <MS name="trending_up" size={14} className="text-emerald-500" />
                Top Movers
              </h3>
              <TopMovers campaigns={campaigns ?? []} loading={isLoading} />
            </div>
          )}

          {/* AI Insight gradient card */}
          <AIInsightCard taskTotal={taskTotal} campaigns={campaigns ?? []} />

          {/* View Full Analytics */}
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <MS name="analytics" size={16} className="text-indigo-500" />
            View Full Analytics
          </button>

          {/* Managed accounts count */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <MS name="wifi" size={14} className="text-emerald-500 shrink-0" />
            <span className="text-[11px] text-slate-500">
              {managedAccounts.length} account
              {managedAccounts.length !== 1 ? "s" : ""} managed by Nati AI
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
                className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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

/* ─── Helpers ─────────────────────────────────────────────────── */
function getTopCampaigns(campaigns: Campaign[], limit: number): Campaign[] {
  return campaigns
    .filter((c) => c.todayInsights && c.todayInsights.roas > 0)
    .sort((a, b) => (b.todayInsights?.roas ?? 0) - (a.todayInsights?.roas ?? 0))
    .slice(0, limit);
}

function getLocalGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function getGreetingEmoji(greeting: string): string {
  if (greeting.includes("Morning")) return "☕";
  if (greeting.includes("Evening")) return "🌙";
  return "☀️";
}
