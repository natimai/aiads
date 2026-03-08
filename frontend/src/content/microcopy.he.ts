import type { MicrocopyKey, NavSection, RouteMeta } from "./microcopy.types";

export const heMicrocopy: Record<MicrocopyKey, string> = {
  "app.brand": "AdOps Pulse",
  "app.tagline": "מערכת הפעלה לביצועי Meta Ads",
  "app.refresh": "רענון נתונים",
  "app.shortcuts": "קיצורי מקלדת",
  "app.theme.light": "מעבר למצב בהיר",
  "app.theme.dark": "מעבר למצב כהה",
  "inbox.title": "תיבת פעולות AI",
  "inbox.subtitle": "החלטות שצריך לסגור עכשיו, לפני שהשוק זז",
  "inbox.empty": "אין פעולות פתוחות כרגע",
  "login.title": "שליטה חכמה בפרסום שלך",
  "login.subtitle": "כניסה מאובטחת למערכת AdOps Pulse",
};

export const routeMetaHe: RouteMeta[] = [
  {
    key: "inbox",
    title: "תיבת פעולות",
    subtitle: "אישור, דחייה וביצוע המלצות בזמן אמת",
  },
  {
    key: "cockpit",
    title: "קוקפיט ביצועים",
    subtitle: "תמונה מלאה של מדדים, מגמות וגורמי השפעה",
  },
  {
    key: "campaigns",
    title: "סייר קמפיינים",
    subtitle: "תצוגת עומק Campaign → Ad Set → Ad",
  },
  {
    key: "campaignBuilder",
    title: "בונה קמפיינים",
    subtitle: "מבריף קצר להשקה מבוקרת בתוך דקות",
  },
  {
    key: "alerts",
    title: "התראות",
    subtitle: "חומרה, השפעה ופעולה במקום אחד",
  },
  {
    key: "reports",
    title: "דוחות",
    subtitle: "הפקה, תזמון והפצה של דוחות ביצועים",
  },
  {
    key: "creativeLab",
    title: "מעבדת קריאייטיב",
    subtitle: "ניתוח עייפות קריאייטיב ורעיונות לשיפור",
  },
  {
    key: "settings",
    title: "הגדרות מערכת",
    subtitle: "ניהול העדפות, תצורות והרשאות",
  },
  {
    key: "accounts",
    title: "ניהול חשבונות",
    subtitle: "חיבור וסנכרון חשבונות פרסום",
  },
];

export const navSectionsHe: NavSection[] = [
  {
    id: "primary",
    title: "ליבה תפעולית",
    items: [
      { key: "inbox", label: "תיבת פעולות", to: "/" },
      { key: "cockpit", label: "קוקפיט", to: "/cockpit" },
      { key: "campaigns", label: "קמפיינים", to: "/campaigns" },
      { key: "campaignBuilder", label: "בונה קמפיינים", to: "/campaign-builder" },
    ],
  },
  {
    id: "secondary",
    title: "מערכת",
    items: [
      { key: "alerts", label: "התראות", to: "/alerts" },
      { key: "reports", label: "דוחות", to: "/reports" },
      { key: "creativeLab", label: "מעבדת קריאייטיב", to: "/creative-lab" },
      { key: "settings", label: "הגדרות", to: "/settings" },
    ],
  },
];
