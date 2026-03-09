import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, NavLink, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Keyboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sun,
  X,
  Inbox,
  ChartNoAxesCombined,
  WandSparkles,
  Layers3,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "./services/firebase";
import { Sidebar } from "./components/common/Sidebar";
import { AccountSwitcher } from "./components/common/AccountSwitcher";
import { DateRangePicker } from "./components/common/DateRangePicker";
import { useAccountsQuery } from "./hooks/useAccounts";
import { useKeyboardShortcuts, SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./contexts/ThemeContext";
import { getRouteMeta, t } from "./utils/copy";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Cockpit = lazy(() => import("./pages/Cockpit"));
const AIInsights = lazy(() => import("./pages/AIInsights"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Alerts = lazy(() => import("./pages/Alerts"));
const AlertConfig = lazy(() => import("./pages/AlertConfig"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilder"));
const Reports = lazy(() => import("./pages/Reports"));
const CreativeLab = lazy(() => import("./pages/CreativeLab"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const PrivacyPolicyLoginApp = lazy(() => import("./pages/PrivacyPolicyLoginApp"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

const PUBLIC_LEGAL_PATHS = new Set([
  "/privacy",
  "/privacy-policy",
  "/privacy-login-app",
  "/privacy-login-dialog",
  "/terms",
  "/terms-of-service",
]);

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || "/").replace(/\/+$/, "");
  return normalized || "/";
}

function isPublicLegalPath(pathname: string): boolean {
  return PUBLIC_LEGAL_PATHS.has(normalizePathname(pathname));
}

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)]" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const location = useLocation();

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (isPublicLegalPath(location.pathname)) {
    return <PublicLegalApp />;
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)]" />
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

function PublicLegalApp() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
        <Route path="/privacy-login-app" element={<PrivacyPolicyLoginApp />} />
        <Route path="/privacy-login-dialog" element={<Navigate to="/privacy-login-app" replace />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
      </Routes>
    </Suspense>
  );
}

function AuthenticatedApp() {
  useAccountsQuery();
  const queryClient = useQueryClient();
  const location = useLocation();
  const routeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);
  const { theme, toggleTheme } = useTheme();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("adops-sidebar-collapsed") === "1";
  });

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("adops-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 450);
  };

  return (
    <div className="min-h-screen text-[var(--text-primary)]">
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="סגירת ניווט"
        />
      )}

      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      <div className={`min-h-screen transition-[padding-right] duration-300 ${sidebarCollapsed ? "lg:pr-24" : "lg:pr-72"}`}>
        <header className="sticky top-0 z-30 px-4 pb-2 pt-3 sm:px-6">
          <div className="glass-strip rounded-2xl px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setSidebarOpen(true)}
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-primary)] lg:hidden"
                aria-label="פתיחת תפריט"
              >
                <Menu className="h-4 w-4" />
              </button>

              <button
                onClick={() => setSidebarCollapsed((value) => !value)}
                className="focus-ring hidden min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] lg:inline-flex"
                aria-label={sidebarCollapsed ? "הרחבת תפריט" : "צמצום תפריט"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>

                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--text-primary)]">{routeMeta.title}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{routeMeta.subtitle}</p>
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
                  className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)]"
                  title={theme === "dark" ? t("app.theme.light") : t("app.theme.dark")}
                  aria-label="שינוי ערכת צבע"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => setShowHelp(true)}
                  className="focus-ring hidden min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] md:inline-flex"
                  title={t("app.shortcuts")}
                >
                  <Keyboard className="h-4 w-4" />
                </button>

                <button
                  onClick={handleRefresh}
                  className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)]"
                  title={t("app.refresh")}
                  aria-label={t("app.refresh")}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-28 pt-3 sm:px-6 sm:pt-4 lg:pb-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Navigate to="/" replace />} />
              <Route path="/cockpit" element={<Cockpit />} />
              <Route path="/dashboard" element={<Navigate to="/cockpit" replace />} />
              <Route path="/ai-insights" element={<AIInsights />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/:accountId" element={<Campaigns />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/alerts/config" element={<AlertConfig />} />
              <Route path="/campaign-builder" element={<CampaignBuilder />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/creative-lab" element={<CreativeLab />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/accounts" element={<AccountSettings />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="glass-strip fixed inset-x-3 bottom-2 z-40 rounded-2xl px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden">
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { to: "/", label: "תיבה", icon: Inbox },
            { to: "/cockpit", label: "קוקפיט", icon: ChartNoAxesCombined },
            { to: "/campaigns", label: "קמפיינים", icon: Layers3 },
            { to: "/campaign-builder", label: "בונה", icon: WandSparkles },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center justify-center rounded-xl text-[11px] font-medium transition-colors ${
                  isActive
                    ? "border border-[var(--line-strong)] bg-[var(--bg-soft-2)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
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
            className="panel w-full max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">קיצורי מקלדת</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
                aria-label="סגירת חלון קיצורים"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 p-4">
              {SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2"
                >
                  <span className="text-xs text-[var(--text-secondary)]">{shortcut.description}</span>
                  <kbd className="rounded-md border border-[var(--line)] bg-[var(--bg-soft-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-primary)]">
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
