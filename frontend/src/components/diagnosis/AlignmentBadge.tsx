import { CheckCircle2, HelpCircle, Info } from "lucide-react";
import type { OfficialAlignment } from "../../types";

/**
 * Compact badge showing official Meta recommendation alignment status.
 * Sprint 2: only checked/unchecked states — no agree/disagree logic yet.
 */
export function AlignmentBadge({ alignment }: { alignment: OfficialAlignment | undefined }) {
  if (!alignment) return null;

  const { icon, label, sublabel, style } = getAlignmentDisplay(alignment);

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${style}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {sublabel && (
          <p className="mt-0.5 text-[10px] opacity-80">{sublabel}</p>
        )}
        {alignment.rationale && (
          <p className="mt-1 text-[10px] opacity-70 leading-relaxed">{alignment.rationale}</p>
        )}
      </div>
    </div>
  );
}

function getAlignmentDisplay(alignment: OfficialAlignment) {
  // API error or not checked
  if (!alignment.checked) {
    return {
      icon: <HelpCircle className="h-3.5 w-3.5" />,
      label:
        alignment.unavailableReason === "api_error"
          ? "המלצות רשמיות לא זמינות"
          : "המלצות רשמיות לא נבדקו",
      sublabel: alignment.unavailableReason === "api_error"
        ? "לא ניתן היה לטעון המלצות רשמיות של מטא"
        : null,
      style: "text-gray-500 bg-gray-50 border-gray-200",
    };
  }

  // Checked but none exist
  if (alignment.officialCount === 0) {
    return {
      icon: <Info className="h-3.5 w-3.5" />,
      label: "אין המלצות רשמיות פעילות",
      sublabel: "מטא לא מציעה המלצות כרגע עבור חשבון זה",
      style: "text-gray-500 bg-gray-50 border-gray-200",
    };
  }

  // Checked and recommendations exist
  return {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: `${alignment.officialCount} המלצות רשמיות נטענו`,
    sublabel: null,
    style: "text-blue-600 bg-blue-50 border-blue-200",
  };
}

/**
 * Inline mini-badge for use inside recommendation cards or compact layouts.
 */
export function AlignmentMiniBadge({ alignment }: { alignment: OfficialAlignment | undefined }) {
  if (!alignment) return null;

  if (!alignment.checked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
        <HelpCircle className="h-2.5 w-2.5" />
        לא נבדק
      </span>
    );
  }

  if (alignment.officialCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
        <Info className="h-2.5 w-2.5" />
        אין המלצות
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
      <CheckCircle2 className="h-2.5 w-2.5" />
      {alignment.officialCount} המלצות רשמיות
    </span>
  );
}
