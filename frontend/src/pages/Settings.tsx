import { Link } from "react-router-dom";
import { Building2, Bell, FileText, ChevronRight } from "lucide-react";

const settingsGroups = [
  {
    title: "Account Management",
    items: [
      {
        to: "/settings/accounts",
        icon: Building2,
        label: "Meta Ad Accounts",
        description: "Connect accounts and toggle which ones Nati AI should manage",
        color: "bg-indigo-100 text-indigo-600",
      },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        to: "/alerts/config",
        icon: Bell,
        label: "Alert Configuration",
        description: "Set alert thresholds and delivery channels",
        color: "bg-amber-100 text-amber-600",
      },
      {
        to: "/reports",
        icon: FileText,
        label: "Report Schedule",
        description: "Configure automated daily and weekly reports",
        color: "bg-slate-100 text-slate-600",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your Nati AI account and preferences</p>
      </div>

      {settingsGroups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {group.title}
          </h3>
          <div className="space-y-2">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:shadow"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
