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
  connectAccount,
  disconnectAccount,
  syncAccount,
  syncAllAccounts,
  toggleManagedAccount,
} from "../services/api";

export default function AccountSettings() {
  const { accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const count = searchParams.get("count");

    if (success === "true") {
      setToast({
        type: "success",
        message: `Connected ${count || ""} ad account${count !== "1" ? "s" : ""} successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setSearchParams({}, { replace: true });
    } else if (error) {
      const desc = searchParams.get("error_description") || error.replace(/_/g, " ");
      setToast({ type: "error", message: `Connection failed: ${desc}` });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
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
      setToast({ type: "success", message: "Account disconnected" });
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
      let msg = `Synced ${ok.length} account${ok.length !== 1 ? "s" : ""}`;
      if (failed.length) msg += ` (${failed.length} failed)`;
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
        message: `Synced: ${data.campaigns} campaigns, ${data.insights} insights`,
      });
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => setToast({ type: "error", message: err.message }),
  });

  const managedCount = accounts.filter((a) => a.isManagedByPlatform).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-xs opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/settings"
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Account Setup</h2>
          <p className="text-sm text-slate-500">
            Connect accounts and toggle which ones Nati AI should actively manage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <button
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {syncAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync All
            </button>
          )}
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Connect Account
          </button>
        </div>
      </div>

      {/* Info banner */}
      {accounts.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-indigo-600 shrink-0" />
            <span className="font-semibold text-indigo-700">
              {managedCount} of {accounts.length} accounts active
            </span>
            <span className="text-indigo-600/70">
              — Only active accounts appear in the header selector and receive AI analysis.
            </span>
          </div>
        </div>
      )}

      {/* Account table */}
      {accounts.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Account</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Is Active</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</span>
          </div>

          {accounts.map((account) => (
            <div
              key={account.id}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 transition-colors ${
                account.isManagedByPlatform ? "bg-white" : "bg-slate-50/50"
              }`}
            >
              {/* Account info */}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{account.accountName}</h3>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
                  <span>ID: {account.id}</span>
                  <span>{account.currency}</span>
                  {account.businessName && <span>{account.businessName}</span>}
                </div>
                {account.tokenExpiry && (
                  <div className="mt-1 flex items-center gap-1 text-[11px]">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span
                      className={
                        new Date(account.tokenExpiry) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                          ? "text-amber-600"
                          : "text-slate-400"
                      }
                    >
                      Token: {new Date(account.tokenExpiry).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Is Active Toggle */}
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
                    account.isManagedByPlatform ? "bg-indigo-600" : "bg-slate-200"
                  }`}
                  title={account.isManagedByPlatform ? "Click to deactivate" : "Click to activate"}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      account.isManagedByPlatform ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className={`text-[10px] font-medium ${account.isManagedByPlatform ? "text-indigo-600" : "text-slate-400"}`}>
                  {account.isManagedByPlatform ? "ON" : "OFF"}
                </span>
              </div>

              {/* Meta status badge */}
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    account.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {account.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => syncOne.mutate(account.id)}
                  disabled={syncOne.isPending}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50"
                >
                  {syncOne.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync
                </button>
                <button
                  onClick={() => disconnect.mutate(account.id)}
                  disabled={disconnect.isPending}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Shield className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">No accounts connected</p>
          <p className="mt-1 text-xs text-slate-500">
            Click &ldquo;Connect Account&rdquo; to link your Meta Ad Account
          </p>
        </div>
      )}
    </div>
  );
}
