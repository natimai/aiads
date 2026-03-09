import { Link } from "react-router-dom";
import { Building2, Bell, FileText, ChevronLeft, ShieldCheck } from "lucide-react";

const settingsGroups = [
  {
    title: "ניהול מערכת",
    items: [
      {
        to: "/settings/accounts",
        icon: Building2,
        label: "חשבונות Meta",
        description: "חיבור, סנכרון והגדרת חשבונות פעילים",
      },
      {
        to: "/alerts/config",
        icon: Bell,
        label: "חוקי התראות",
        description: "ניהול ספים, קירור וערוצי התראה",
      },
      {
        to: "/reports",
        icon: FileText,
        label: "תזמון דוחות",
        description: "הפקה אוטומטית והפצה לערוצים נבחרים",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl reveal-up">
      <section className="panel p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)]">
            <ShieldCheck className="h-5 w-5 text-[#061321]" />
          </div>
          <div>
            <p className="section-kicker">System</p>
            <h2 className="brand-display text-2xl text-[var(--text-primary)]">הגדרות מערכת</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">שליטה מלאה בהרשאות, ניטור ותזמון</p>
          </div>
        </div>
      </section>

      {settingsGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {group.title}
          </h3>
          <div className="space-y-2">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="panel focus-ring flex items-center gap-4 px-4 py-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-soft)]">
                  <item.icon className="h-5 w-5 text-[var(--accent-2)]" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{item.description}</div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
