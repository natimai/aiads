export function formatCurrency(value: number, currency = "USD"): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    ILS: "₪",
  };
  const symbol = symbols[currency] ?? `${currency} `;
  return `${symbol}${safeValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (safeValue >= 1_000_000) return `${(safeValue / 1_000_000).toFixed(1)}M`;
  if (safeValue >= 1_000) return `${(safeValue / 1_000).toFixed(1)}K`;
  return safeValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(2)}%`;
}

export function formatDelta(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } {
  if (previous === 0) return { text: "N/A", direction: "flat" };
  const delta = ((current - previous) / previous) * 100;
  return {
    text: `${Math.abs(delta).toFixed(1)}%`,
    direction: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat",
  };
}

export function formatROAS(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(2)}x`;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
