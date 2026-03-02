import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Bell,
  Brain,
  FileText,
  Settings,
  Sun,
  Moon,
  Palette,
  LogOut,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { AlertBadge } from "../alerts/AlertBadge";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/alerts", icon: Bell, label: "Alerts", badge: true },
  { to: "/ai-insights", icon: Brain, label: "AI Insights" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/creative-lab", icon: Palette, label: "Creative Lab" },
];

const bottomItems = [
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-navy-950">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue font-bold text-white text-sm">
          MA
        </div>
        <div>
          <h1 className="text-sm font-bold text-white">Meta Ads</h1>
          <p className="text-xs text-slate-400">Campaign Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge && <AlertBadge />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-3 py-4 space-y-1">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>

        {auth.currentUser && (
          <button
            onClick={() => signOut(auth)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
