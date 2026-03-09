import type { ElementType } from "react";
import { NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  Bell,
  ChartNoAxesCombined,
  Layers3,
  LogOut,
  Palette,
  Settings,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { auth } from "../../services/firebase";
import { getNavSections } from "../../utils/copy";
import type { AppRouteKey } from "../../content/microcopy.types";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
}

const ICON_MAP: Record<AppRouteKey, ElementType> = {
  inbox: Sparkles,
  cockpit: ChartNoAxesCombined,
  campaigns: Layers3,
  campaignBuilder: WandSparkles,
  alerts: Bell,
  reports: ChartNoAxesCombined,
  creativeLab: Palette,
  settings: Settings,
  accounts: Settings,
};

function NavEntry({
  to,
  label,
  routeKey,
  collapsed = false,
  onClick,
}: {
  to: string;
  label: string;
  routeKey: AppRouteKey;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  const Icon = ICON_MAP[routeKey];

  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `group relative flex min-h-11 items-center rounded-2xl px-3 text-sm font-medium transition-all duration-200 focus-ring ${
          isActive
            ? "border border-[var(--line-strong)] bg-[var(--bg-soft-2)] text-[var(--text-primary)] shadow-[0_10px_24px_-22px_rgba(19,184,149,0.9)]"
            : "border border-transparent text-[var(--text-secondary)] hover:border-[var(--line)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        } ${collapsed ? "justify-center" : "gap-3"}`
      }
    >
      <Icon className={`h-4 w-4 ${collapsed ? "h-5 w-5" : ""}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed = false }: SidebarProps) {
  const user = auth.currentUser;
  const userInitials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "AP";

  const desktopWidth = collapsed ? "lg:w-24" : "lg:w-72";
  const navSections = getNavSections();

  return (
    <>
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:right-0 lg:z-40 lg:flex ${desktopWidth} flex-col border-l border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-3 py-4 backdrop-blur-xl transition-all duration-300`}
      >
        <div className="mb-5 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)] shadow-[var(--shadow-main)]">
            <Sparkles className="h-5 w-5 text-[#061326]" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">AdOps Pulse</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">מערכת תפעול לביצועים</p>
            </div>
          )}
        </div>

        {navSections.map((section) => (
          <div key={section.id} className="mb-4">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavEntry
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  routeKey={item.key}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-auto">
          <div
            className={`rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-soft)_88%,transparent)] p-2 ${collapsed ? "flex justify-center" : ""}`}
          >
            {!collapsed ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-soft-2)] text-xs font-bold text-[var(--text-primary)]">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    {user?.displayName ?? user?.email?.split("@")[0] ?? "Operator"}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{user?.email ?? ""}</p>
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-ring"
                  title="התנתקות"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signOut(auth)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl text-[var(--text-primary)] transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-ring"
                title="התנתקות"
              >
                <span className="rounded-full border border-[var(--line-strong)] bg-[var(--bg-soft-2)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]">
                  {userInitials}
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[86%] max-w-sm flex-col border-l border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-4 py-4 shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)]">
              <Sparkles className="h-4 w-4 text-[#061326]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">AdOps Pulse</p>
              <p className="text-[11px] text-[var(--text-muted)]">מערכת תפעול לביצועים</p>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-primary)] focus-ring"
            aria-label="סגירת תפריט"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {navSections.map((section) => (
          <div key={section.id} className="mb-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavEntry
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  routeKey={item.key}
                  onClick={onMobileClose}
                />
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={() => signOut(auth)}
          className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-500/35 bg-rose-500/12 px-3 text-sm font-medium text-rose-100 focus-ring"
        >
          <LogOut className="h-4 w-4" />
          התנתקות
        </button>
      </aside>
    </>
  );
}
