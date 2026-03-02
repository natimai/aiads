import { DollarSign, MousePointerClick, Eye, Target, TrendingUp, BarChart3, UserPlus, Link2 } from "lucide-react";
import { MetricCard } from "../common/MetricCard";
import { formatCurrency, formatNumber, formatPercent, formatROAS, formatDelta } from "../../utils/format";
import type { KPISummary } from "../../types";

interface KPICardsProps {
  current?: KPISummary;
  previous?: KPISummary;
  currency?: string;
  loading?: boolean;
}

export function KPICards({ current, previous, currency = "USD", loading }: KPICardsProps) {
  if (loading || !current) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetricCard key={i} title="" value="" loading />
        ))}
      </div>
    );
  }

  const hasLeads = (current.totalLeads ?? 0) > 0;
  const hasInstalls = (current.totalInstalls ?? 0) > 0;
  const hasRoas = (current.roas ?? 0) > 0;

  const metrics = [
    {
      title: "Spend",
      value: formatCurrency(current.totalSpend, currency),
      delta: previous ? formatDelta(current.totalSpend, previous.totalSpend) : undefined,
      invertDelta: true,
      icon: <DollarSign className="h-4 w-4" />,
      tooltip: "Total advertising spend for the selected period",
    },
    ...(hasLeads ? [{
      title: "Leads",
      value: formatNumber(current.totalLeads ?? 0),
      delta: previous?.totalLeads ? formatDelta(current.totalLeads ?? 0, previous.totalLeads) : undefined,
      icon: <UserPlus className="h-4 w-4" />,
      tooltip: "Total leads generated from ads",
    }] : []),
    ...(hasLeads ? [{
      title: "CPL",
      value: formatCurrency(current.avgCostPerLead ?? 0, currency),
      delta: previous?.avgCostPerLead ? formatDelta(current.avgCostPerLead ?? 0, previous.avgCostPerLead) : undefined,
      invertDelta: true,
      icon: <Target className="h-4 w-4" />,
      tooltip: "Cost Per Lead — average cost to acquire one lead",
    }] : []),
    ...(hasInstalls ? [{
      title: "CPI",
      value: formatCurrency(current.avgCPI, currency),
      delta: previous ? formatDelta(current.avgCPI, previous.avgCPI) : undefined,
      invertDelta: true,
      icon: <Target className="h-4 w-4" />,
      tooltip: "Cost Per Install — average cost to acquire one app install",
    }] : []),
    ...(hasRoas ? [{
      title: "ROAS",
      value: formatROAS(current.roas),
      delta: previous ? formatDelta(current.roas, previous.roas) : undefined,
      icon: <TrendingUp className="h-4 w-4" />,
      tooltip: "Return On Ad Spend — revenue generated per dollar spent",
    }] : []),
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
