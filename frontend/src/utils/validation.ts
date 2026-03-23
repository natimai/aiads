import type { DiagnosisReport, FreshnessStatus } from "../types";

const VALID_ROOT_CAUSES = new Set([
  "learning_instability",
  "auction_cost_pressure",
  "creative_fatigue",
  "audience_saturation",
  "pacing_constraint",
  "restrictive_bidding",
  "post_click_funnel_issue",
  "signal_quality_issue",
  "auction_overlap",
  "breakdown_effect_risk",
  "healthy",
  "unknown",
]);

const VALID_EVALUATION_LEVELS = new Set(["campaign", "adset"]);
const VALID_SOURCES = new Set(["ai", "deterministic", "hybrid"]);

export function isDiagnosisReport(data: unknown): data is DiagnosisReport {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  if (typeof d.id !== "string") return false;
  if (typeof d.accountId !== "string") return false;
  if (typeof d.summary !== "string") return false;
  if (typeof d.generatedAt !== "string") return false;
  if (typeof d.confidence !== "number") return false;
  if (!VALID_ROOT_CAUSES.has(d.rootCause as string)) return false;
  if (!VALID_EVALUATION_LEVELS.has(d.evaluationLevel as string)) return false;
  if (!VALID_SOURCES.has(d.source as string)) return false;
  if (!Array.isArray(d.findings)) return false;

  return true;
}

export function isFreshnessStatus(data: unknown): data is FreshnessStatus {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  if (typeof d.isStale !== "boolean") return false;
  if (typeof d.isWarning !== "boolean") return false;

  return true;
}
