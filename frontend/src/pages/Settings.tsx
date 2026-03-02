import { Link } from "react-router-dom";
import { Building2, Bell, FileText, Key, User } from "lucide-react";

const settingsGroups = [
  {
    title: "Account Management",
    items: [
      { to: "/settings/accounts", icon: Building2, label: "Meta Ad Accounts", description: "Connect and manage your Meta advertising accounts" },
    ],
  },
  {
    title: "Notifications",
    items: [
      { to: "/alerts/config", icon: Bell, label: "Alert Configuration", description: "Configure alert thresholds and delivery channels" },
      { to: "/reports", icon: FileText, label: "Report Schedule", description: "Configure automated daily and weekly reports" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-sm text-slate-400">Manage your account and preferences</p>
      </div>

      {settingsGroups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {group.title}
          </h3>
          <div className="space-y-2">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-4 rounded-xl border border-slate-800 bg-navy-900 p-4 transition-colors hover:border-slate-700"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
                  <item.icon className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{item.label}</div>
                  <div className="text-xs text-slate-400">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
