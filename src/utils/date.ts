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

// No startDate means the unbounded "All" range — always bucket monthly. Noon
// anchors keep whole-day math stable across DST shifts, and the 31-day cutoff
// (not 30) keeps "This Month" daily on 31-day months, where a single monthly
// bucket would leave the chart with no trend to show.
export function resolveTrendGranularity(
  startDate: string | null,
  endDate: string | null
): TrendGranularity {
  if (!startDate) return "monthly";
  const start = new Date(`${startDate}T12:00:00`);
  const end = endDate ? new Date(`${endDate}T12:00:00`) : new Date();
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return spanDays > 31 ? "monthly" : "daily";
}
