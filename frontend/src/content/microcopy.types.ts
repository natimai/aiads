export type AppRouteKey =
  | "inbox"
  | "cockpit"
  | "campaigns"
  | "campaignBuilder"
  | "alerts"
  | "reports"
  | "creativeLab"
  | "settings"
  | "accounts";

export interface RouteMeta {
  key: AppRouteKey;
  title: string;
  subtitle: string;
}

export interface NavSection {
  id: "primary" | "secondary";
  title: string;
  items: Array<{ key: AppRouteKey; label: string; to: string }>;
}

export interface ActionCardViewModel {
  contextLabel: string;
  impactLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
}

export type MicrocopyKey =
  | "app.brand"
  | "app.tagline"
  | "app.refresh"
  | "app.shortcuts"
  | "app.theme.light"
  | "app.theme.dark"
  | "inbox.title"
  | "inbox.subtitle"
  | "inbox.empty"
  | "login.title"
  | "login.subtitle";
