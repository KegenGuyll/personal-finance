import type { TrendGranularity } from "@/src/lib/stats-pipeline";

export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonth(monthKey: string): string {
  const d = new Date(`${monthKey}-01T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// No startDate means the unbounded "All" range — always bucket monthly. Range
// presets emit UTC calendar dates (getStartDate), so both endpoints anchor in
// UTC: pairing a UTC start with the local instant let 30d span 32 days and
// flip to monthly in positive-offset time zones near midnight. The 31-day
// cutoff (not 30) keeps "This Month" daily on 31-day months, where a single
// monthly bucket would leave the chart with no trend to show.
export function resolveTrendGranularity(
  startDate: string | null,
  endDate: string | null
): TrendGranularity {
  if (!startDate) return "monthly";
  const end = endDate ?? new Date().toISOString().split("T")[0];
  const spanDays =
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
        86_400_000
    ) + 1;
  return spanDays > 31 ? "monthly" : "daily";
}
