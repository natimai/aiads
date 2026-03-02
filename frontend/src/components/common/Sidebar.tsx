import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Bell,
  Brain,
  FileText,
  Settings,
  Palette,
  LogOut,
  X,
  Zap,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";
import { AlertBadge } from "../alerts/AlertBadge";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/alerts", icon: Bell, label: "Alerts", badge: true },
  { to: "/ai-insights", icon: Brain, label: "AI Command Center" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/creative-lab", icon: Palette, label: "Creative Lab" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const user = auth.currentUser;
  const userInitials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shrink-0">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white leading-none">Nati AI</h1>
          <p className="mt-0.5 text-[11px] text-slate-500 leading-none">Meta Ads Command Center</p>
        </div>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="lg:hidden shrink-0 rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-none">{item.label}</span>
            {item.badge && <AlertBadge />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              isActive
                ? "bg-indigo-600/20 text-indigo-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </NavLink>

        {user && (
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-semibold text-indigo-300">
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
                className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
