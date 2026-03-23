import { DollarSign, MousePointerClick, Eye, Target, TrendingUp, BarChart3, UserPlus, Link2, Download, ShoppingCart } from "lucide-react";
import { MetricCard } from "../common/MetricCard";
import { formatCurrency, formatNumber, formatPercent, formatROAS, formatDelta } from "../../utils/format";
import type { AccountVertical, KPISummary } from "../../types";

interface KPICardsProps {
  current?: KPISummary;
  previous?: KPISummary;
  currency?: string;
  loading?: boolean;
  vertical?: AccountVertical;
}

export function KPICards({ current, previous, currency = "USD", loading, vertical = "LEAD_GEN" }: KPICardsProps) {
  if (loading || !current) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetricCard key={i} title="" value="" loading />
        ))}
      </div>
    );
  }

  // Objective-specific primary metrics
  const primaryMetrics = buildPrimaryMetrics(vertical, current, previous, currency);

  // Common metrics always shown
  const commonMetrics = [
    {
      title: "CTR",
      value: formatPercent(current.avgCTR),
      delta: previous ? formatDelta(current.avgCTR, previous.avgCTR) : undefined,
      icon: <MousePointerClick className="h-4 w-4" />,
      tooltip: "Click-Through Rate — percentage of impressions that resulted in a click",
    },
    {
      title: "CPM",
      value: formatCurrency(current.avgCPM, currency),
      delta: previous ? formatDelta(current.avgCPM, previous.avgCPM) : undefined,
      invertDelta: true,
      icon: <BarChart3 className="h-4 w-4" />,
      tooltip: "Cost Per Mille — cost per 1,000 impressions",
    },
    {
      title: "Impressions",
      value: formatNumber(current.totalImpressions),
      delta: previous ? formatDelta(current.totalImpressions, previous.totalImpressions) : undefined,
      icon: <Eye className="h-4 w-4" />,
      tooltip: "Total number of times ads were displayed",
    },
    {
      title: "Clicks",
      value: formatNumber(current.totalClicks),
      delta: previous ? formatDelta(current.totalClicks, previous.totalClicks) : undefined,
      icon: <MousePointerClick className="h-4 w-4" />,
      tooltip: "Total number of clicks on ads",
    },
    {
      title: "Link Clicks",
      value: formatNumber(current.totalLinkClicks ?? 0),
      delta: previous?.totalLinkClicks ? formatDelta(current.totalLinkClicks ?? 0, previous.totalLinkClicks) : undefined,
      icon: <Link2 className="h-4 w-4" />,
      tooltip: "Total link clicks on ads",
    },
  ];

  const metrics = [...primaryMetrics, ...commonMetrics];

  const count = metrics.length;
  const gridCols =
    count <= 4 ? "grid-cols-2 sm:grid-cols-4" :
    count <= 6 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" :
    count <= 8 ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8" :
    "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10";

  return (
    <div className={`grid gap-3 ${gridCols}`}>
      {metrics.map((m) => (
        <MetricCard key={m.title} {...m} />
      ))}
    </div>
  );
}

function buildPrimaryMetrics(
  vertical: AccountVertical,
  current: KPISummary,
  previous: KPISummary | undefined,
  currency: string,
) {
  const spend = {
    title: "Spend",
    value: formatCurrency(current.totalSpend, currency),
    delta: previous ? formatDelta(current.totalSpend, previous.totalSpend) : undefined,
    invertDelta: true,
    icon: <DollarSign className="h-4 w-4" />,
    tooltip: "Total advertising spend for the selected period",
  };

  if (vertical === "ECOMMERCE") {
    return [
      spend,
      {
        title: "רכישות",
        value: formatNumber(current.totalPurchases),
        delta: previous ? formatDelta(current.totalPurchases, previous.totalPurchases) : undefined,
        icon: <ShoppingCart className="h-4 w-4" />,
        tooltip: "Total purchases from ads",
      },
      {
        title: "CPA",
        value: formatCurrency(current.totalSpend > 0 && current.totalPurchases > 0 ? current.totalSpend / current.totalPurchases : 0, currency),
        invertDelta: true,
        icon: <Target className="h-4 w-4" />,
        tooltip: "Cost Per Acquisition — average cost to acquire one purchase",
      },
      {
        title: "ROAS",
        value: formatROAS(current.roas),
        delta: previous ? formatDelta(current.roas, previous.roas) : undefined,
        icon: <TrendingUp className="h-4 w-4" />,
        tooltip: "Return On Ad Spend — revenue generated per dollar spent",
      },
    ];
  }

  if (vertical === "APP_INSTALLS") {
    return [
      spend,
      {
        title: "התקנות",
        value: formatNumber(current.totalInstalls),
        delta: previous ? formatDelta(current.totalInstalls, previous.totalInstalls) : undefined,
        icon: <Download className="h-4 w-4" />,
        tooltip: "Total app installs from ads",
      },
      {
        title: "CPI",
        value: formatCurrency(current.avgCPI, currency),
        delta: previous ? formatDelta(current.avgCPI, previous.avgCPI) : undefined,
        invertDelta: true,
        icon: <Target className="h-4 w-4" />,
        tooltip: "Cost Per Install — average cost to acquire one app install",
      },
    ];
  }

  // LEAD_GEN (default)
  return [
    spend,
    {
      title: "לידים",
      value: formatNumber(current.totalLeads ?? 0),
      delta: previous?.totalLeads ? formatDelta(current.totalLeads ?? 0, previous.totalLeads) : undefined,
      icon: <UserPlus className="h-4 w-4" />,
      tooltip: "Total leads generated from ads",
    },
    {
      title: "CPL",
      value: formatCurrency(current.avgCostPerLead ?? 0, currency),
      delta: previous?.avgCostPerLead ? formatDelta(current.avgCostPerLead ?? 0, previous.avgCostPerLead) : undefined,
      invertDelta: true,
      icon: <Target className="h-4 w-4" />,
      tooltip: "Cost Per Lead — average cost to acquire one lead",
    },
  ];
}
