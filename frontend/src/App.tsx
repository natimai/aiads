import { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./services/firebase";
import { Sidebar } from "./components/common/Sidebar";
import { AccountSwitcher } from "./components/common/AccountSwitcher";
import { DateRangePicker } from "./components/common/DateRangePicker";
import { useAccountsQuery } from "./hooks/useAccounts";
import { useKeyboardShortcuts, SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import { RefreshCw, Keyboard, X, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Alerts = lazy(() => import("./pages/Alerts"));
const AlertConfig = lazy(() => import("./pages/AlertConfig"));
const AIInsights = lazy(() => import("./pages/AIInsights"));
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
      <div className="flex min-h-screen items-center justify-center bg-navy-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-accent-blue" />
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
    <div className="flex min-h-screen bg-navy-950">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="lg:ml-64 flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-800 bg-navy-950/90 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded border border-slate-700/60 p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
            <AccountSwitcher />
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker />
            <button
              onClick={() => setShowHelp(true)}
              className="rounded border border-slate-700/60 px-2 py-1.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className="rounded border border-slate-700/60 px-2 py-1.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300"
              title="Refresh all data (R)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <div className="p-5">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/:accountId" element={<Campaigns />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/alerts/config" element={<AlertConfig />} />
              <Route path="/ai-insights" element={<AIInsights />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/creative-lab" element={<CreativeLab />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/accounts" element={<AccountSettings />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="w-80 rounded-lg border border-slate-700 bg-navy-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded p-0.5 text-slate-500 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-[13px] text-slate-400">{s.description}</span>
                  <kbd className="rounded border border-slate-700 bg-navy-800 px-2 py-0.5 text-[11px] font-mono text-slate-300">
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
