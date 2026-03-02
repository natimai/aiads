import { NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";
import { AlertBadge } from "../alerts/AlertBadge";
import { X } from "lucide-react";

/* ─── Material Symbol icon helper ─────────────────────────────── */
function MSIcon({
  name,
  className = "",
  filled = false,
  size = 22,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
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

/* ─── Tooltip component ────────────────────────────────────────── */
function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100">
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-slate-800" />
    </span>
  );
}

/* ─── Nav items ────────────────────────────────────────────────── */
const navItems = [
  { to: "/", icon: "dashboard", label: "Dashboard" },
  { to: "/campaigns", icon: "campaign", label: "Campaigns" },
  { to: "/alerts", icon: "notifications", label: "Alerts", badge: true },
  { to: "/ai-insights", icon: "psychology", label: "AI Command Center" },
  { to: "/reports", icon: "description", label: "Reports" },
  { to: "/creative-lab", icon: "palette", label: "Creative Lab" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const user = auth.currentUser;
  const userInitials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "NA";

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";

  return (
    <>
      {/* ─── Desktop: collapsed icon-only sidebar (80px / w-20) ───── */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-20 flex-col border-r border-slate-800 bg-slate-900">
        {/* Gradient logo mark */}
        <div className="flex h-16 items-center justify-center border-b border-slate-800 shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
            <MSIcon name="auto_awesome" className="text-white" filled size={20} />
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-1 flex-col items-center gap-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`
              }
            >
              <MSIcon name={item.icon} size={22} />
              {item.badge && (
                <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
              )}
              <Tooltip label={item.label} />
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Settings + User avatar */}
        <div className="flex flex-col items-center gap-2 border-t border-slate-800 py-4 shrink-0">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-150 ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`
            }
          >
            <MSIcon name="settings" size={22} />
            <Tooltip label="Settings" />
          </NavLink>

          {user && (
            <button
              onClick={() => signOut(auth)}
              className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600/20 text-[11px] font-bold text-indigo-300 ring-2 ring-transparent transition-all hover:bg-rose-500/20 hover:text-rose-400 hover:ring-rose-500/30"
            >
              {userInitials}
              <Tooltip label={`Sign out · ${displayName}`} />
            </button>
          )}
        </div>
      </aside>

      {/* ─── Mobile: slide-in full-width sidebar ──────────────────── */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo (mobile) */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 shrink-0">
            <MSIcon name="auto_awesome" className="text-white" filled size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-white leading-none">Nati AI</h1>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-none">
              Meta Ads Command Center
            </p>
          </div>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav (mobile) */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`
              }
            >
              <MSIcon name={item.icon} size={20} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && <AlertBadge />}
            </NavLink>
          ))}
        </nav>

        {/* Mobile footer */}
        <div className="border-t border-slate-800 px-3 py-3 shrink-0 space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`
            }
          >
            <MSIcon name="settings" size={20} className="shrink-0" />
            <span>Settings</span>
          </NavLink>

          {user && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-800/50 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-[11px] font-semibold text-indigo-300">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-slate-200">
                    {user.displayName ?? user.email?.split("@")[0]}
                  </p>
                  {user.email && (
                    <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                  )}
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                  title="Sign Out"
                >
                  <MSIcon name="logout" size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
