import type { ElementType } from "react";
import { NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  Bell,
  Brain,
  FileText,
  LayoutDashboard,
  Layers3,
  LogOut,
  Palette,
  Settings,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { auth } from "../../services/firebase";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: ElementType;
  isAlert?: boolean;
}

const primaryItems: NavItem[] = [
  { to: "/ai-insights", label: "Feed", icon: Brain },
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Layers3 },
  { to: "/campaign-builder", label: "Builder", icon: WandSparkles },
];

const secondaryItems: NavItem[] = [
  { to: "/alerts", label: "Alerts", icon: Bell, isAlert: true },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/creative-lab", label: "Creative Lab", icon: Palette },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavEntry({
  item,
  collapsed = false,
  onClick,
}: {
  item: NavItem;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group relative flex min-h-11 items-center rounded-2xl px-3 text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30"
            : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
        } ${collapsed ? "justify-center" : "gap-3"}`
      }
    >
      <item.icon className={`h-4 w-4 ${collapsed ? "h-5 w-5" : ""}`} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {item.isAlert && (
        <span
          className={`absolute h-2 w-2 rounded-full bg-rose-400 ${collapsed ? "right-3 top-3" : "right-3 top-1/2 -translate-y-1/2"}`}
        />
      )}
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
    : user?.email?.slice(0, 2).toUpperCase() ?? "NA";

  const desktopWidth = collapsed ? "lg:w-24" : "lg:w-72";

  return (
    <>
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex ${desktopWidth} flex-col border-r border-slate-800/80 bg-[#070c1b]/95 px-3 py-4 backdrop-blur-xl transition-all duration-300`}
      >
        <div className="mb-5 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-cyan-500 to-emerald-400 shadow-lg shadow-cyan-500/25">
            <Sparkles className="h-5 w-5 text-slate-950" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">Nati AI</p>
              <p className="truncate text-[11px] text-slate-400">Meta Ads Command OS</p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          {primaryItems.map((item) => (
            <NavEntry key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="my-5 border-t border-slate-800/70" />

        <div className="space-y-1">
          {secondaryItems.map((item) => (
            <NavEntry key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="mt-auto">
          <div className={`rounded-2xl border border-slate-800/80 bg-slate-900/70 p-2 ${collapsed ? "flex justify-center" : ""}`}>
            {!collapsed ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-200 ring-1 ring-indigo-400/35">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-100">
                    {user?.displayName ?? user?.email?.split("@")[0] ?? "Operator"}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">{user?.email ?? ""}</p>
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signOut(auth)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                title="Sign out"
              >
                <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-xs font-semibold text-indigo-200">
                  {userInitials}
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-sm flex-col border-r border-slate-800/80 bg-[#070c1b] px-4 py-4 shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-cyan-500 to-emerald-400">
              <Sparkles className="h-4 w-4 text-slate-950" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Nati AI</p>
              <p className="text-[11px] text-slate-400">Meta Ads Command OS</p>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          {primaryItems.map((item) => (
            <NavEntry key={item.to} item={item} onClick={onMobileClose} />
          ))}
        </div>

        <div className="my-5 border-t border-slate-800/70" />

        <div className="space-y-1">
          {secondaryItems.map((item) => (
            <NavEntry key={item.to} item={item} onClick={onMobileClose} />
          ))}
        </div>

        <button
          onClick={() => signOut(auth)}
          className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 text-sm font-medium text-rose-200"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>
    </>
  );
}
