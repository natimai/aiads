import { heMicrocopy, navSectionsHe, routeMetaHe } from "../content/microcopy.he";
import type { AppRouteKey, MicrocopyKey, RouteMeta } from "../content/microcopy.types";

export function t(key: MicrocopyKey): string {
  return heMicrocopy[key] ?? key;
}

export function getRouteMeta(pathname: string): RouteMeta {
  if (pathname === "/" || pathname.startsWith("/inbox") || pathname.startsWith("/ai-insights")) {
    return routeMetaHe.find((item) => item.key === "inbox")!;
  }
  if (pathname.startsWith("/cockpit") || pathname.startsWith("/dashboard")) {
    return routeMetaHe.find((item) => item.key === "cockpit")!;
  }
  if (pathname.startsWith("/campaign-builder")) {
    return routeMetaHe.find((item) => item.key === "campaignBuilder")!;
  }
  if (pathname.startsWith("/campaigns")) {
    return routeMetaHe.find((item) => item.key === "campaigns")!;
  }
  if (pathname.startsWith("/alerts")) {
    return routeMetaHe.find((item) => item.key === "alerts")!;
  }
  if (pathname.startsWith("/reports")) {
    return routeMetaHe.find((item) => item.key === "reports")!;
  }
  if (pathname.startsWith("/creative-lab")) {
    return routeMetaHe.find((item) => item.key === "creativeLab")!;
  }
  if (pathname.startsWith("/settings/accounts")) {
    return routeMetaHe.find((item) => item.key === "accounts")!;
  }
  if (pathname.startsWith("/settings")) {
    return routeMetaHe.find((item) => item.key === "settings")!;
  }
  return routeMetaHe.find((item) => item.key === "inbox")!;
}

export function getNavSections() {
  return navSectionsHe;
}

export function getRouteLabel(key: AppRouteKey): string {
  return routeMetaHe.find((item) => item.key === key)?.title ?? "";
}

export function numberLocale(value: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatDateHe(date: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
