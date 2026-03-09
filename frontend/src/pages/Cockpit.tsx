import { useMemo, useState, type ElementType } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Database, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { PerformanceChart } from "../components/dashboard/PerformanceChart";
import { SpendDistribution } from "../components/dashboard/SpendDistribution";
import { HourlyHeatmap } from "../components/dashboard/HourlyHeatmap";
import { CreativeMatrix } from "../components/dashboard/CreativeMatrix";
import { TopBottomPerformers } from "../components/dashboard/TopBottomPerformers";
import { CampaignTable } from "../components/dashboard/CampaignTable";
import { useCampaigns } from "../hooks/useCampaigns";
import { useInsights } from "../hooks/useInsights";
import { useTasks } from "../hooks/useTasks";
import { useAccounts } from "../contexts/AccountContext";
import { useDateRange } from "../contexts/DateRangeContext";
import { formatDateDisplay } from "../utils/dates";
import { formatCurrency } from "../utils/format";
import { inferAccountVertical } from "../utils/metricsConfig";
import { syncAllAccounts } from "../services/api";

export default function Cockpit() {
  const queryClient = useQueryClient();
  const { accounts, selectedAccount } = useAccounts();
  const { dateRange } = useDateRange();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: tasksData } = useTasks({ status: "pending", limit: 100 });

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const currency = selectedAccount?.currency ?? "USD";
  const vertical = inferAccountVertical(selectedAccount, campaigns ?? []);

  const summary = useMemo(() => {
    const data = insights ?? [];
    const spend = data.reduce((sum, item) => sum + (item.spend ?? 0), 0);
    const clicks = data.reduce((sum, item) => sum + (item.clicks ?? 0), 0);
    const impressions = data.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
    const purchaseValue = data.reduce((sum, item) => sum + (item.purchaseValue ?? 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const roas = spend > 0 ? purchaseValue / spend : 0;
    return { spend, ctr, roas };
  }, [insights]);

  const recommendationsByCampaign = useMemo(
    () =>
      (tasksData?.tasks ?? []).reduce((acc, rec) => {
        if (rec.entityLevel !== "campaign" || !rec.entityId) return acc;
        acc[rec.entityId] = (acc[rec.entityId] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [tasksData?.tasks]
  );

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const result = await syncAllAccounts();
      const success = result.synced.filter((item) => !item.error).length;
      const failed = result.synced.filter((item) => item.error).length;
      setSyncMessage(`סנכרון הושלם: ${success} הצליחו${failed ? `, ${failed} נכשלו` : ""}`);
      await queryClient.invalidateQueries();
    } catch (error: unknown) {
      setSyncMessage(`שגיאת סנכרון: ${error instanceof Error ? error.message : "לא ידוע"}`);
    } finally {
      setSyncing(false);
    }
  };

  if (accounts.length === 0 && !campaignsLoading) {
    return (
      <div className="panel flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)]">
          <Database className="h-7 w-7 text-[var(--text-muted)]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">אין חשבונות מחוברים</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
          חבר חשבון Meta כדי לקבל תצוגת ביצועים מלאה וניתוח השוואתי.
        </p>
        <Link
          to="/settings/accounts"
          className="focus-ring btn-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm"
        >
          מעבר לניהול חשבונות
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 reveal-up">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-kicker">קוקפיט אנליטיקה</p>
            <h1 className="brand-display mt-2 text-3xl text-[var(--text-primary)]">קוקפיט ביצועים</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              טווח: {dateRange.label} · {formatDateDisplay(dateRange.from)}
              {dateRange.from !== dateRange.to ? ` – ${formatDateDisplay(dateRange.to)}` : ""}
            </p>
          </div>

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="focus-ring btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            סנכרון כל החשבונות
          </button>
        </div>

        {syncMessage && (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {syncMessage}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard title="הוצאה" value={formatCurrency(summary.spend, currency)} />
          <MetricCard title="CTR" value={`${summary.ctr.toFixed(2)}%`} />
          <MetricCard title="ROAS" value={`${summary.roas.toFixed(2)}x`} />
          <MetricCard title="פעולות פתוחות" value={String(tasksData?.total ?? 0)} icon={Sparkles} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5">
        <PerformanceChart data={insights ?? []} loading={insightsLoading} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SpendDistribution campaigns={campaigns ?? []} currency={currency} loading={campaignsLoading} />
        <TopBottomPerformers campaigns={campaigns ?? []} loading={campaignsLoading} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HourlyHeatmap data={insights ?? []} loading={insightsLoading} />
        <CreativeMatrix campaigns={campaigns ?? []} currency={currency} loading={campaignsLoading} />
      </div>

      <CampaignTable
        campaigns={campaigns ?? []}
        currency={currency}
        loading={campaignsLoading}
        recommendationsByCampaign={recommendationsByCampaign}
        vertical={vertical}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon?: ElementType;
}) {
  return (
    <div className="panel-soft px-3 py-3 shadow-[0_10px_20px_-20px_rgba(41,153,119,0.9)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">{title}</p>
        {Icon ? <Icon className="h-3.5 w-3.5 text-[var(--accent)]" /> : <BarChart3 className="h-3.5 w-3.5 text-[var(--accent)]" />}
      </div>
      <p className="ltr text-lg font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
