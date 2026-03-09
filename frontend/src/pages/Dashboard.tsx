import { Link } from "react-router-dom";
import type { ElementType } from "react";
import { CheckCircle2, Clock3, Sparkles, Zap } from "lucide-react";
import { useTasks } from "../hooks/useTasks";
import { useExecuteRecommendation, useReviewRecommendation } from "../hooks/useRecommendations";
import { ActionFeed } from "../components/dashboard/ActionFeed";
import { useAccounts } from "../contexts/AccountContext";
import type { RecommendationModifications } from "../types";

export default function Dashboard() {
  const { accounts } = useAccounts();
  const { data: tasksData, isLoading } = useTasks({ status: "pending", limit: 50 });
  const reviewMutation = useReviewRecommendation();
  const executeMutation = useExecuteRecommendation();

  const recommendations = tasksData?.tasks ?? [];
  const pending = recommendations.filter((item) => item.status === "pending").length;
  const urgent = recommendations.filter((item) => item.priority === "high").length;
  const doneToday = (tasksData?.total ?? 0) - pending;

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

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)]">
          <Sparkles className="h-7 w-7 text-[#071321]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">אין חשבונות מחוברים עדיין</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
          חבר חשבון Meta ראשון כדי להתחיל לקבל המלצות ביצוע אוטומטיות ולנהל פעולות בזמן אמת.
        </p>
        <Link
          to="/settings/accounts"
          className="focus-ring btn-primary mt-6 inline-flex min-h-11 items-center justify-center px-5 text-sm"
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
            <p className="section-kicker">תיבת AI</p>
            <h1 className="mt-2 brand-display text-2xl text-[var(--text-primary)] sm:text-3xl">
              מה דורש החלטה עכשיו?
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              סגירת פעולות מהירה, עם הקשר עסקי ברור לפני כל אישור או ביצוע.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MetricPill icon={Zap} label="פתוחות" value={pending} />
            <MetricPill icon={Clock3} label="דחופות" value={urgent} />
            <MetricPill icon={CheckCircle2} label="נסגרו" value={Math.max(doneToday, 0)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/cockpit"
            className="focus-ring btn-secondary inline-flex min-h-11 items-center px-4 text-sm font-medium"
          >
            מעבר לקוקפיט מדדים
          </Link>
          <Link
            to="/campaign-builder"
            className="focus-ring btn-secondary inline-flex min-h-11 items-center px-4 text-sm font-medium"
          >
            פתיחת בונה קמפיינים
          </Link>
        </div>
      </section>

      <ActionFeed
        recommendations={recommendations}
        groups={tasksData?.groups}
        loading={isLoading}
        busy={busy}
        onApprove={handleApprove}
        onApproveAndExecute={handleApproveAndExecute}
        onReject={handleReject}
      />
    </div>
  );
}

function MetricPill({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="panel-soft min-w-[102px] px-3 py-2 text-center shadow-[0_10px_26px_-26px_rgba(15,181,152,0.9)]">
      <div className="mb-1 flex justify-center">
        <Icon className="h-4 w-4 text-[var(--accent)]" />
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
