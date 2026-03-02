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
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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
    onError: (err: Error) => {
      setToast({ type: "error", message: err.message });
    },
  });

  const disconnect = useMutation({
    mutationFn: disconnectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setToast({ type: "success", message: "Account disconnected" });
    },
  });

  const toggleManaged = useMutation({
    mutationFn: ({
      accountId,
      managed,
    }: {
      accountId: string;
      managed: boolean;
    }) => toggleManagedAccount(accountId, managed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: Error) => {
      setToast({ type: "error", message: err.message });
    },
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
    <div className="space-y-6">
      {toast && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link
          to="/settings"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Meta Ad Accounts</h2>
          <p className="text-sm text-slate-400">
            Connect accounts and choose which ones Nati AI should manage
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <button
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50"
            >
              {syncAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync All
            </button>
          )}
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {connect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Connect Account
          </button>
        </div>
      </div>

      {/* Managed accounts info banner */}
      {accounts.length > 0 && (
        <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-accent-blue" />
            <span className="font-medium text-accent-blue">
              {managedCount} of {accounts.length} accounts managed
            </span>
            <span className="text-slate-400">
              — Only managed accounts are synced, analyzed, and shown in the dashboard.
            </span>
          </div>
        </div>
      )}

      {accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`rounded-xl border bg-navy-900 p-5 transition-colors ${
                account.isManagedByPlatform
                  ? "border-accent-blue/30"
                  : "border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {/* Toggle Switch */}
                  <button
                    onClick={() =>
                      toggleManaged.mutate({
                        accountId: account.id,
                        managed: !account.isManagedByPlatform,
                      })
                    }
                    disabled={toggleManaged.isPending}
                    className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                      account.isManagedByPlatform
                        ? "bg-accent-blue"
                        : "bg-slate-700"
                    }`}
                    title={
                      account.isManagedByPlatform
                        ? "Click to stop managing"
                        : "Click to start managing"
                    }
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        account.isManagedByPlatform
                          ? "translate-x-[22px]"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>

                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">
                        {account.accountName}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          account.isActive
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                      {account.isManagedByPlatform && (
                        <span className="rounded-full bg-accent-blue/15 px-2 py-0.5 text-xs font-medium text-accent-blue">
                          Managed
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                      <span>ID: {account.id}</span>
                      <span>Currency: {account.currency}</span>
                      {account.businessName && (
                        <span>Business: {account.businessName}</span>
                      )}
                    </div>
                    {account.tokenExpiry && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        <Clock className="h-3 w-3" />
                        <span
                          className={
                            new Date(account.tokenExpiry) <
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? "text-accent-yellow"
                              : "text-slate-400"
                          }
                        >
                          Token expires:{" "}
                          {new Date(account.tokenExpiry).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => syncOne.mutate(account.id)}
                    disabled={syncOne.isPending}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-accent-blue hover:text-accent-blue disabled:opacity-50"
                  >
                    {syncOne.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Sync
                  </button>
                  <button
                    onClick={() => disconnect.mutate(account.id)}
                    disabled={disconnect.isPending}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-navy-900 py-16">
          <Shield className="mb-4 h-12 w-12 text-slate-600" />
          <p className="text-sm text-slate-400">No accounts connected</p>
          <p className="mt-1 text-xs text-slate-500">
            Click &quot;Connect Account&quot; to link your Meta Ad Account
          </p>
        </div>
      )}
    </div>
  );
}
