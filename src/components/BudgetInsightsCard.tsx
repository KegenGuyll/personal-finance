"use client";

import { formatCurrency } from "@/src/utils/currency";

export interface Insight {
  category: string;
  groupName: string;
  changePct: number;
  projected: number;
  direction: "up" | "down";
  limited: boolean;
}

function InsightRow({ insight, up }: { insight: Insight; up: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`font-bold ${up ? "text-red-500" : "text-emerald-600"}`}
          aria-hidden="true"
        >
          {up ? "▲" : "▼"}
        </span>
        <span className="truncate font-medium text-space-indigo-800">
          {insight.category}
        </span>
        {insight.limited && (
          <span className="rounded bg-space-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-space-indigo-500">
            limited data
          </span>
        )}
      </span>
      <span className="shrink-0 text-space-indigo-500">
        {Math.abs(insight.changePct).toFixed(0)}% →{" "}
        <span className="font-semibold text-space-indigo-800">
          {formatCurrency(insight.projected)}
        </span>
      </span>
    </li>
  );
}

export default function BudgetInsightsCard({
  nextMonthLabel,
  up,
  down,
}: {
  nextMonthLabel: string;
  up: Insight[];
  down: Insight[];
}) {
  if (up.length === 0 && down.length === 0) {
    return (
      <div className="rounded-xl border border-space-indigo-100 bg-white p-4 shadow-2xs">
        <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
          Forecast &amp; Insights
        </h3>
        <p className="text-xs text-space-indigo-400">
          No notable trends in this window yet. As more months of spending
          accumulate, this will surface your biggest movers and a projected
          next-month amount.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-space-indigo-100 bg-white p-4 shadow-2xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-space-indigo-600">
          Forecast &amp; Insights
        </h3>
        <span className="text-[11px] text-space-indigo-400">
          Projected {nextMonthLabel}
        </span>
      </div>

      {up.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-space-indigo-400">
            Trending up
          </p>
          <ul className="space-y-1.5">
            {up.map((insight) => (
              <InsightRow key={insight.category} insight={insight} up />
            ))}
          </ul>
        </div>
      )}

      {down.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-space-indigo-400">
            Trending down
          </p>
          <ul className="space-y-1.5">
            {down.map((insight) => (
              <InsightRow key={insight.category} insight={insight} up={false} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
