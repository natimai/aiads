import { ShieldAlert, Ban } from "lucide-react";
import type { DiagnosisReport, RootCause } from "../../types";

/**
 * Static "what NOT to do" warnings based on root cause.
 * These come from domain knowledge (SKILL.md / Breakdown Effect / Learning Phase).
 */
const WARNINGS_BY_ROOT_CAUSE: Partial<Record<RootCause, string[]>> = {
  learning_instability: [
    "אל תשנו תקציב, קהל, או קריאייטיב בזמן שלב הלמידה — כל שינוי מאפס את הלמידה.",
    "אל תכבו אדסט שנכנס ללמידה מחדש לפני 50 אירועי אופטימיזציה.",
    "אל תשנו אסטרטגיית הצעות מחיר בזמן למידה.",
  ],
  auction_cost_pressure: [
    "אל תפחיתו תקציב כתגובה לעליית CPM — זה עלול לפגוע ביציבות המכרז.",
    "אל תצמצמו קהל יעד בניסיון להוריד עלויות — מטא מתמחרת על בסיס יעילות שולית.",
  ],
  creative_fatigue: [
    "אל תכבו מודעה עם תדירות גבוהה לפני שיש חלופה מוכנה — זה יפגע בלמידה.",
    "אל תעתיקו את אותו מסר עם תמונה חדשה בלבד — שנו את הזווית השיווקית.",
  ],
  audience_saturation: [
    "אל תצמצמו קהל — הרחיבו בזהירות עם Lookalike או Broad targeting.",
    "אל תגדילו תדירות כדי 'לדחוף' יותר — זה יחמיר את הרוויה.",
  ],
  breakdown_effect_risk: [
    "אל תבודדו סגמנט רק בגלל שממוצע ה-CPA שלו נמוך יותר — זה אפקט פירוק (Breakdown Effect).",
    "אל תצמצמו טרגוט על בסיס טבלת פירוקים בלבד — מטא מקצה תקציב על בסיס יעילות שולית, לא ממוצעת.",
    "אל תיצרו אדסטים נפרדים לגילאים/מגדרים/מיקומים בלי מבחן מבוקר.",
  ],
  restrictive_bidding: [
    "אל תנמיכו תקרת הצעת מחיר עוד — זה כבר מגביל את ההגעה.",
    "אל תעברו ל-Lowest Cost בלי להבין למה יש מגבלה — ייתכן שהיא שם מסיבה.",
  ],
  post_click_funnel_issue: [
    "אל תגדילו תקציב פרסום כשהבעיה בדף הנחיתה — זה רק יגדיל הפסדים.",
    "אל תשנו את המודעות כשהבעיה היא ב-Conversion Rate של האתר.",
  ],
  signal_quality_issue: [
    "אל תשנו אסטרטגיית הצעות מחיר כשהבעיה היא באיכות הפיקסל/CAPI.",
    "אל תצמצמו קהל — השקיעו בשיפור איכות הסיגנל (Events, CAPI).",
  ],
  auction_overlap: [
    "אל תיצרו אדסטים נוספים שמכוונים לאותו קהל — זה מחמיר את החפיפה.",
    "אל תפצלו קמפיינים לקהלים חופפים — השתמשו ב-Advantage+ Audience במקום.",
  ],
};

/** Universal warnings that always apply. */
const UNIVERSAL_WARNINGS: string[] = [
  "אל תקבלו החלטות על בסיס יום אחד של נתונים — בדקו מגמה של 3-7 ימים.",
  "אל תשנו יותר ממשתנה אחד בו-זמנית — לא תוכלו לזהות מה עבד.",
];

export function WhatNotToDoPanel({ diagnosis }: { diagnosis: DiagnosisReport }) {
  const rootCauseWarnings = WARNINGS_BY_ROOT_CAUSE[diagnosis.rootCause] || [];

  // Also gather warnings from breakdown hypotheses if any exist
  const hasBreakdownHypotheses = diagnosis.breakdownHypotheses.length > 0;
  const breakdownWarnings =
    hasBreakdownHypotheses && diagnosis.rootCause !== "breakdown_effect_risk"
      ? WARNINGS_BY_ROOT_CAUSE.breakdown_effect_risk?.slice(0, 1) || []
      : [];

  const allWarnings = [...rootCauseWarnings, ...breakdownWarnings, ...UNIVERSAL_WARNINGS];

  if (allWarnings.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="h-4 w-4 text-rose-600" />
        <h4 className="text-sm font-semibold text-rose-800">מה לא לעשות</h4>
      </div>
      <ul className="space-y-2">
        {allWarnings.map((warning, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-rose-700 leading-relaxed">
            <Ban className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
            <span>{warning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
