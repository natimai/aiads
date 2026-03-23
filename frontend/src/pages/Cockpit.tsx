import { useMemo, useState, type ElementType } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Clock, Database, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
import { inferAccountVertical, getMetricsForVertical } from "../utils/metricsConfig";
import { syncAllAccounts } from "../services/api";
import { useAccountFreshness } from "../hooks/useDiagnosis";
import { isFreshnessStatus } from "../utils/validation";

export default function Cockpit() {
  const queryClient = useQueryClient();
  const { accounts, selectedAccount } = useAccounts();
  const { dateRange } = useDateRange();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: tasksData } = useTasks({ status: "pending", limit: 100 });

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const { data: freshnessRaw } = useAccountFreshness(selectedAccount?.id);

  const currency = selectedAccount?.currency ?? "USD";
  const vertical = inferAccountVertical(selectedAccount, campaigns ?? []);

  const summary = useMemo(() => {
    const data = insights ?? [];
    const spend = data.reduce((sum, item) => sum + (item.spend ?? 0), 0);
    const clicks = data.reduce((sum, item) => sum + (item.clicks ?? 0), 0);
    const impressions = data.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
    const purchaseValue = data.reduce((sum, item) => sum + (item.purchaseValue ?? 0), 0);
    const leads = data.reduce((sum, item) => sum + (item.leads ?? 0), 0);
    const purchases = data.reduce((sum, item) => sum + (item.purchases ?? 0), 0);
    const installs = data.reduce((sum, item) => sum + (item.installs ?? 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const roas = spend > 0 ? purchaseValue / spend : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const cpa = purchases > 0 ? spend / purchases : 0;
    const cpi = installs > 0 ? spend / installs : 0;
    return { spend, ctr, cpm, roas, cpl, cpa, cpi, leads, purchases, installs };
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
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="text-sm text-[var(--text-secondary)]">
                טווח: {dateRange.label} · {formatDateDisplay(dateRange.from)}
                {dateRange.from !== dateRange.to ? ` – ${formatDateDisplay(dateRange.to)}` : ""}
              </p>
              <FreshnessBadge freshness={isFreshnessStatus(freshnessRaw) ? freshnessRaw : null} />
            </div>
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
          {getMetricsForVertical(vertical).slice(0, 3).map((metric) => {
            const formatValue = (): string => {
              switch (metric.key) {
                case "spend": return formatCurrency(summary.spend, currency);
                case "ctr": return `${summary.ctr.toFixed(2)}%`;
                case "cpm": return formatCurrency(summary.cpm, currency);
                case "roas": return `${summary.roas.toFixed(2)}x`;
                case "cpl": return formatCurrency(summary.cpl, currency);
                case "cpa": return formatCurrency(summary.cpa, currency);
                case "cpi": return formatCurrency(summary.cpi, currency);
                case "leads": return String(Math.round(summary.leads));
                case "purchases": return String(Math.round(summary.purchases));
                case "installs": return String(Math.round(summary.installs));
                default: return "0";
              }
            };
            return <MetricCard key={metric.key} title={metric.label} value={formatValue()} />;
          })}
          <MetricCard title="פעולות פתוחות" value={String(tasksData?.total ?? 0)} icon={Sparkles} />
        </div>
      </section>

      {/* Breakdown Effect Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-right">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 leading-relaxed">
            טבלה זו מיועדת לתצפית. אל תפחית תקציב רק בגלל עלות ממוצעת גבוהה יותר — מטא מקצה על בסיס יעילות שולית.
          </p>
        </div>
      </div>

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

function FreshnessBadge({ freshness }: { freshness: { insightsSyncedAt: string | null; isStale: boolean; isWarning: boolean } | null }) {
  if (!freshness) return null;

  const { insightsSyncedAt, isStale, isWarning } = freshness;
  let label: string;
  let colorClass: string;

  if (!insightsSyncedAt) {
    label = "לא סונכרן";
    colorClass = "text-rose-600";
  } else {
    const age = Date.now() - new Date(insightsSyncedAt).getTime();
    const minutes = Math.round(age / 60000);
    label = minutes < 60 ? `עודכן לפני ${minutes} דקות` : `עודכן לפני ${Math.round(minutes / 60)} שעות`;
    colorClass = isStale ? "text-rose-600" : isWarning ? "text-amber-600" : "text-emerald-600";
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
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
