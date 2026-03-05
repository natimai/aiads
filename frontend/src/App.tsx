import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, NavLink } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Brain,
  Keyboard,
  LayoutDashboard,
  Layers3,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sun,
  WandSparkles,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "./services/firebase";
import { Sidebar } from "./components/common/Sidebar";
import { AccountSwitcher } from "./components/common/AccountSwitcher";
import { DateRangePicker } from "./components/common/DateRangePicker";
import { useAccountsQuery } from "./hooks/useAccounts";
import { useKeyboardShortcuts, SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./contexts/ThemeContext";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Alerts = lazy(() => import("./pages/Alerts"));
const AlertConfig = lazy(() => import("./pages/AlertConfig"));
const AIInsights = lazy(() => import("./pages/AIInsights"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilder"));
const Reports = lazy(() => import("./pages/Reports"));
const CreativeLab = lazy(() => import("./pages/CreativeLab"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#040816]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  useAccountsQuery();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("nati-sidebar-collapsed") === "1";
  });

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("nati-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const routeTitle = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith("/ai-insights")) return "Action Feed";
    if (path.startsWith("/campaign-builder")) return "Campaign Builder";
    if (path.startsWith("/campaigns")) return "Campaign Explorer";
    if (path.startsWith("/alerts")) return "Alerts";
    if (path.startsWith("/reports")) return "Reports";
    if (path.startsWith("/creative-lab")) return "Creative Lab";
    if (path.startsWith("/settings")) return "Settings";
    return "Dashboard";
  }, [location.pathname]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 450);
  };

  const darkShell =
    theme === "dark"
      ? "bg-[#040816] text-slate-100"
      : "bg-slate-100 text-slate-900";

  const topbarSurface =
    theme === "dark"
      ? "border-slate-800/70 bg-[#070d1f]/80"
      : "border-slate-200/80 bg-white/85";

  const mobileNavSurface =
    theme === "dark"
      ? "border-slate-800 bg-[#070d1f]/95"
      : "border-slate-200 bg-white/95";

  return (
    <div className={`min-h-screen ${darkShell}`}>
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      <div
        className={`min-h-screen transition-[padding-left] duration-300 ${
          sidebarCollapsed ? "lg:pl-24" : "lg:pl-72"
        }`}
      >
        <header
          className={`sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-xl sm:px-6 ${topbarSurface}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>

              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="hidden min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 transition-colors hover:bg-slate-800 lg:inline-flex"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>

              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{routeTitle}</p>
                <p className="truncate text-xs text-slate-400">
                  Command surface for proactive Meta Ads operations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <AccountSwitcher />
              </div>
              <div className="hidden lg:block">
                <DateRangePicker />
              </div>

              <button
                onClick={toggleTheme}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 transition-colors hover:bg-slate-800"
                title={theme === "dark" ? "Switch to light" : "Switch to dark"}
                aria-label="Toggle color theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                onClick={() => setShowHelp(true)}
                className="hidden min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 transition-colors hover:bg-slate-800 md:inline-flex"
                title="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </button>

              <button
                onClick={handleRefresh}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/70 text-slate-300 transition-colors hover:bg-slate-800"
                title="Refresh all data"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/:accountId" element={<Campaigns />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/alerts/config" element={<AlertConfig />} />
              <Route path="/ai-insights" element={<AIInsights />} />
              <Route path="/campaign-builder" element={<CampaignBuilder />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/creative-lab" element={<CreativeLab />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/accounts" element={<AccountSettings />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-40 border-t px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:hidden ${mobileNavSurface}`}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { to: "/ai-insights", label: "Feed", icon: Brain },
            { to: "/", label: "Dashboard", icon: LayoutDashboard },
            { to: "/campaigns", label: "Campaigns", icon: Layers3 },
            { to: "/campaign-builder", label: "Builder", icon: WandSparkles },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center justify-center rounded-xl text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-500/20 text-indigo-200"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0b1229] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close keyboard shortcuts"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 p-4">
              {SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2"
                >
                  <span className="text-xs text-slate-300">{shortcut.description}</span>
                  <kbd className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] font-mono text-slate-200">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
