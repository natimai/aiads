import { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, useLocation, NavLink } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./services/firebase";
import { Sidebar } from "./components/common/Sidebar";
import { AccountSwitcher } from "./components/common/AccountSwitcher";
import { DateRangePicker } from "./components/common/DateRangePicker";
import { useAccountsQuery } from "./hooks/useAccounts";
import { useKeyboardShortcuts, SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import { Keyboard, X, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-accent-blue" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-accent-blue" />
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
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="lg:ml-20 flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/80 px-5 shadow-sm backdrop-blur-md">
          {/* Left: hamburger (mobile) + search */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
            {/* Search bar */}
            <div className="relative hidden md:block">
              <span
                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 leading-none select-none"
                style={{ fontSize: "18px" }}
              >
                search
              </span>
              <input
                type="search"
                placeholder="Search campaigns, accounts…"
                className="h-9 w-64 rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-4 text-sm placeholder:text-slate-400 text-slate-700 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          {/* Right: account switcher + date picker + actions */}
          <div className="flex items-center gap-2.5">
            <AccountSwitcher />
            <DateRangePicker />

            {/* Keyboard shortcuts — desktop only */}
            <button
              onClick={() => setShowHelp(true)}
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>

            {/* Notifications bell with red badge */}
            <button
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
              title="Notifications"
            >
              <span
                className="material-symbols-outlined leading-none select-none"
                style={{ fontSize: "20px" }}
              >
                notifications
              </span>
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
              title="Refresh all data (R)"
            >
              <span
                className={`material-symbols-outlined leading-none select-none ${refreshing ? "animate-spin" : ""}`}
                style={{ fontSize: "20px" }}
              >
                sync
              </span>
            </button>
          </div>
        </header>

        {/* Page content — extra bottom padding on mobile for bottom nav */}
        <div className="p-5 pb-24 lg:pb-5">
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
        </div>
      </main>

      {/* ── Mobile bottom navigation bar (hidden on desktop) ──────── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden flex justify-around items-start border-t border-slate-100 bg-white/95 pt-3 pb-8 px-2 shadow-[0_-1px_8px_0_rgba(0,0,0,0.06)] backdrop-blur-sm">
        {[
          { to: "/", icon: "dashboard", label: "Home" },
          { to: "/campaigns", icon: "campaign", label: "Campaigns" },
          { to: "/alerts", icon: "notifications", label: "Alerts" },
          { to: "/ai-insights", icon: "psychology", label: "Insights" },
          { to: "/campaign-builder", icon: "build", label: "Builder" },
          { to: "/settings", icon: "settings", label: "Settings" },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex w-14 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors ${
                isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined leading-none select-none"
                  style={{
                    fontSize: "24px",
                    fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
                  }}
                >
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="w-80 rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-[13px] text-slate-600">{s.description}</span>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    {s.key}
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
