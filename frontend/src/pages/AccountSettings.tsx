import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "../contexts/AccountContext";
import {
  clearAccountDefaultPage,
  connectAccount,
  disconnectAccount,
  getAccountPages,
  setAccountDefaultPage,
  syncAccount,
  syncAllAccounts,
  toggleManagedAccount,
} from "../services/api";
import type { MetaPageOption } from "../types";

export default function AccountSettings() {
  const { accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pageEditorOpenByAccount, setPageEditorOpenByAccount] = useState<Record<string, boolean>>({});
  const [pageDraftByAccount, setPageDraftByAccount] = useState<Record<string, string>>({});
  const [pageOptionsByAccount, setPageOptionsByAccount] = useState<Record<string, MetaPageOption[]>>({});
  const [pageStatusByAccount, setPageStatusByAccount] = useState<Record<string, string>>({});

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const count = searchParams.get("count");

    if (success === "true") {
      setToast({
        type: "success",
        message: `חוברו ${count || ""} חשבונות בהצלחה`,
      });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setSearchParams({}, { replace: true });
    } else if (error) {
      const desc = searchParams.get("error_description") || error.replace(/_/g, " ");
      setToast({ type: "error", message: `חיבור נכשל: ${desc}` });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const connect = useMutation({
    mutationFn: () => connectAccount(),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const disconnect = useMutation({
    mutationFn: disconnectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setToast({ type: "success", message: "החשבון נותק" });
    },
  });

  const toggleManaged = useMutation({
    mutationFn: ({ accountId, managed }: { accountId: string; managed: boolean }) =>
      toggleManagedAccount(accountId, managed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const syncAll = useMutation({
    mutationFn: syncAllAccounts,
    onSuccess: (data) => {
      const ok = data.synced.filter((s) => !s.error);
      const failed = data.synced.filter((s) => s.error);
      let msg = `סונכרנו ${ok.length} חשבונות`;
      if (failed.length) msg += ` (${failed.length} נכשלו)`;
      setToast({ type: failed.length ? "error" : "success", message: msg });
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const syncOne = useMutation({
    mutationFn: syncAccount,
    onSuccess: (data) => {
      setToast({
        type: "success",
        message: `סונכרן: ${data.campaigns} קמפיינים, ${data.insights} תובנות`,
      });
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const loadPagesForAccount = useMutation({
    mutationFn: getAccountPages,
    onSuccess: (data, accountId) => {
      setPageOptionsByAccount((prev) => ({ ...prev, [accountId]: data.pages || [] }));
      setPageStatusByAccount((prev) => ({ ...prev, [accountId]: data.pageAccessStatus || "" }));
      setPageDraftByAccount((prev) => {
        const current = String(prev[accountId] || "").trim();
        if (current) return prev;
        const firstPageId = String(data.pages?.[0]?.pageId || "").trim();
        if (!firstPageId) return prev;
        return { ...prev, [accountId]: firstPageId };
      });
    },
    onError: (err: Error, accountId) => {
      setPageStatusByAccount((prev) => ({ ...prev, [accountId]: "token_error" }));
      setToast({ type: "error", message: `טעינת עמודים נכשלה (${accountId}): ${err.message}` });
    },
  });

  const saveDefaultPage = useMutation({
    mutationFn: ({
      accountId,
      pageId,
      pageName,
    }: {
      accountId: string;
      pageId: string;
      pageName?: string;
    }) => setAccountDefaultPage(accountId, pageId, pageName),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountPages", payload.accountId] });
      setToast({ type: "success", message: "עמוד ברירת מחדל נשמר" });
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const clearDefaultPage = useMutation({
    mutationFn: (accountId: string) => clearAccountDefaultPage(accountId),
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountPages", accountId] });
      setPageDraftByAccount((prev) => ({ ...prev, [accountId]: "" }));
      setToast({ type: "success", message: "עמוד ברירת מחדל נוקה" });
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const managedCount = accounts.filter((account) => account.isManagedByPlatform).length;
  const reconnectRequired = accounts.some((account) => account.pageAccessStatus === "missing_permissions");

  const togglePageEditor = (accountId: string, currentDefaultPageId: string) => {
    const isOpening = !Boolean(pageEditorOpenByAccount[accountId]);
    setPageEditorOpenByAccount((prev) => ({ ...prev, [accountId]: isOpening }));
    if (!isOpening) return;

    setPageDraftByAccount((prev) => ({
      ...prev,
      [accountId]: String(prev[accountId] || currentDefaultPageId || ""),
    }));
    if (!pageOptionsByAccount[accountId]) {
      loadPagesForAccount.mutate(accountId);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl reveal-up">
      {toast && (
        <div
          className={`panel flex items-center gap-3 px-4 py-3 text-sm ${
            toast.type === "success" ? "text-emerald-200" : "text-rose-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-xs opacity-70 hover:opacity-100">
            סגירה
          </button>
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/settings"
              className="focus-ring rounded-lg border border-[var(--line)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="section-kicker">Accounts</p>
              <h2 className="brand-display text-2xl text-[var(--text-primary)]">ניהול חשבונות</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                חיבור, הפעלה וסנכרון חשבונות שינוהלו אוטומטית במערכת.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <button
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending}
                className="focus-ring btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium disabled:opacity-50"
              >
                {syncAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                סנכרון הכל
              </button>
            )}
            <button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="focus-ring btn-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm disabled:opacity-50"
            >
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              חיבור חשבון
            </button>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="panel-soft mt-4 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="font-semibold text-[var(--text-primary)]">
                {managedCount} מתוך {accounts.length} חשבונות פעילים
              </span>
              <span className="text-[var(--text-secondary)]">
                רק חשבונות פעילים מקבלים ניתוח והמלצות AI
              </span>
            </div>
          </div>
        )}

        {reconnectRequired && (
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/12 p-4 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">נדרשת התחברות מחדש לחשבון כדי לאפשר שליפת דפים לפרסום.</p>
                <p className="text-xs text-amber-200/90">לאחר reconnect המערכת תשמור עמוד ברירת מחדל אוטומטית.</p>
              </div>
              <button
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-500/20 px-3 text-xs font-semibold text-amber-50 disabled:opacity-50"
              >
                {connect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reconnect לחשבון
              </button>
            </div>
          </div>
        )}
      </section>

      {accounts.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-[var(--line)] bg-[var(--bg-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span>חשבון</span>
            <span>פעיל למערכת</span>
            <span>סטטוס</span>
            <span>פעולות</span>
          </div>

          {accounts.map((account) => {
            const isPageEditorOpen = Boolean(pageEditorOpenByAccount[account.id]);
            const accountPageOptions = pageOptionsByAccount[account.id] || [];
            const accountPageStatus = pageStatusByAccount[account.id] || account.pageAccessStatus || "";
            const pageDraft = String(pageDraftByAccount[account.id] ?? account.defaultPageId ?? "");
            const isLoadingPages = loadPagesForAccount.isPending && loadPagesForAccount.variables === account.id;
            const isSavingPage =
              saveDefaultPage.isPending && saveDefaultPage.variables?.accountId === account.id;
            const isClearingPage =
              clearDefaultPage.isPending && clearDefaultPage.variables === account.id;

            return (
              <div
                key={account.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-start gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0 ${
                  account.isManagedByPlatform ? "" : "opacity-80"
                }`}
              >
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{account.accountName}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span className="ltr">ID: {account.id}</span>
                    <span className="ltr">{account.currency}</span>
                    {account.businessName && <span>{account.businessName}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-0.5">
                      עמוד ברירת מחדל:{" "}
                      {account.defaultPageId
                        ? `${account.defaultPageName || "Page"} (${account.defaultPageId})`
                        : "לא הוגדר"}
                    </span>
                    {account.pageAccessStatus === "missing_permissions" && (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/12 px-2 py-0.5 text-amber-200">
                        חסרות הרשאות דפים
                      </span>
                    )}
                    {account.pageAccessStatus === "token_error" && (
                      <span className="rounded-full border border-rose-400/40 bg-rose-500/12 px-2 py-0.5 text-rose-200">
                        בעיית טוקן גישה
                      </span>
                    )}
                  </div>
                  {account.tokenExpiry && (
                    <div className="mt-1 flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                      <span className="text-[var(--text-secondary)]">
                        טוקן: {new Date(account.tokenExpiry).toLocaleDateString("he-IL")}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => togglePageEditor(account.id, String(account.defaultPageId || ""))}
                    className="focus-ring mt-2 inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {isPageEditorOpen ? "סגירת עריכת עמוד" : "עריכת עמוד ברירת מחדל"}
                  </button>

                  {isPageEditorOpen && (
                    <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-3">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)]">עריכת עמוד ברירת מחדל</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        בחר עמוד מהרשימה או הזן מזהה ידני. השינוי נשמר לחשבון הזה בלבד.
                      </p>

                      {isLoadingPages && (
                        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">טוען עמודים...</p>
                      )}

                      <div className="mt-2 space-y-2">
                        <select
                          value={pageDraft}
                          onChange={(event) =>
                            setPageDraftByAccount((prev) => ({
                              ...prev,
                              [account.id]: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-2 text-xs text-[var(--text-primary)]"
                        >
                          <option value="">בחר עמוד מהרשימה</option>
                          {accountPageOptions.map((page) => (
                            <option key={page.pageId} value={page.pageId}>
                              {page.pageName} ({page.pageId})
                            </option>
                          ))}
                        </select>

                        <input
                          value={pageDraft}
                          dir="ltr"
                          onChange={(event) =>
                            setPageDraftByAccount((prev) => ({
                              ...prev,
                              [account.id]: event.target.value,
                            }))
                          }
                          placeholder="Manual pageId"
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-2 text-xs text-[var(--text-primary)]"
                        />

                        {accountPageStatus === "missing_permissions" && (
                          <p className="rounded-lg border border-amber-400/35 bg-amber-500/12 p-2 text-[10px] text-amber-100">
                            חסרות הרשאות דפים לחשבון. בצע reconnect כדי למשוך רשימת עמודים.
                          </p>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => {
                            const pageId = pageDraft.trim();
                            if (!pageId) {
                              setToast({ type: "error", message: "יש לבחור או להזין pageId לפני שמירה." });
                              return;
                            }
                            const pageName =
                              accountPageOptions.find((page) => page.pageId === pageId)?.pageName || undefined;
                            saveDefaultPage.mutate({ accountId: account.id, pageId, pageName });
                          }}
                          disabled={isSavingPage}
                          className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-2 py-1 text-[10px] font-semibold text-emerald-200 disabled:opacity-50"
                        >
                          {isSavingPage ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          שמירה
                        </button>
                        <button
                          onClick={() => clearDefaultPage.mutate(account.id)}
                          disabled={isClearingPage}
                          className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-400/35 bg-rose-500/12 px-2 py-1 text-[10px] font-semibold text-rose-200 disabled:opacity-50"
                        >
                          {isClearingPage ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          ניקוי ברירת מחדל
                        </button>
                        <button
                          onClick={() => loadPagesForAccount.mutate(account.id)}
                          disabled={isLoadingPages}
                          className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] disabled:opacity-50"
                        >
                          רענון עמודים
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() =>
                      toggleManaged.mutate({
                        accountId: account.id,
                        managed: !account.isManagedByPlatform,
                      })
                    }
                    disabled={toggleManaged.isPending}
                    className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                      account.isManagedByPlatform ? "bg-[var(--accent-2)]" : "bg-[var(--bg-soft)]"
                    }`}
                    title={account.isManagedByPlatform ? "לחיצה לנטרול" : "לחיצה להפעלה"}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        account.isManagedByPlatform ? "-translate-x-[22px]" : "-translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                    {account.isManagedByPlatform ? "ON" : "OFF"}
                  </span>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      account.isActive
                        ? "bg-emerald-500/20 text-emerald-100"
                        : "bg-rose-500/20 text-rose-200"
                    }`}
                  >
                    {account.isActive ? "פעיל" : "לא פעיל"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => syncOne.mutate(account.id)}
                    disabled={syncOne.isPending}
                    className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] disabled:opacity-50"
                  >
                    {syncOne.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    סנכרון
                  </button>
                  <button
                    onClick={() => disconnect.mutate(account.id)}
                    disabled={disconnect.isPending}
                    className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-400/35 bg-rose-500/12 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    הסרה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel flex flex-col items-center justify-center py-16">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)]">
            <Shield className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">אין חשבונות מחוברים</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">לחץ על "חיבור חשבון" כדי להתחיל</p>
        </div>
      )}
    </div>
  );
}
