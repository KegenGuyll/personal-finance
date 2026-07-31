"use client";

import { formatCurrency } from "@/src/utils/currency";
import Link from "next/link";

interface BudgetProgressBarProps {
  label: string;
  spent: number;
  limit: number;
  carryover?: number;
  onEdit?: () => void;
  viewTransactionsUrl?: string;
  suggestedAmount?: number;
  onAcceptSuggestion?: () => void;
  isSavings?: boolean;
}

function getBarColor(pct: number, isSavings: boolean): string {
  if (isSavings) return "bg-ocean-deep-400";
  if (pct < 50) return "bg-space-indigo-400";
  if (pct < 80) return "bg-ocean-deep-400";
  if (pct <= 100) return "bg-cornflower-blue-400";
  return "bg-red-500";
}

export default function BudgetProgressBar({
  label,
  spent,
  limit,
  carryover,
  onEdit,
  viewTransactionsUrl,
  suggestedAmount,
  onAcceptSuggestion,
  isSavings = false,
}: BudgetProgressBarProps) {
  const effectiveLimit = limit + (carryover ?? 0);
  const percent = effectiveLimit > 0 ? Math.min((spent / effectiveLimit) * 100, 100) : 0;
  const remaining = effectiveLimit - spent;

  return (
    <div className="group flex min-w-0 items-center gap-1.5 py-1">
      <button
        type="button"
        onClick={onEdit}
        className="w-20 shrink-0 cursor-pointer truncate text-left text-[11px] font-medium text-space-indigo-700 hover:text-space-indigo-500"
      >
        {label}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-space-indigo-100">
          <div
            className={`h-full rounded-full transition-all ${getBarColor(percent, isSavings)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[11px]">
        {viewTransactionsUrl ? (
          <Link
            href={viewTransactionsUrl}
            className="font-semibold text-space-indigo-700 hover:text-cornflower-blue-600 hover:underline"
          >
            {formatCurrency(spent)}
          </Link>
        ) : (
          <span className="font-semibold text-space-indigo-700">
            {formatCurrency(spent)}
          </span>
        )}
        <span className="text-space-indigo-300">/</span>
        <span className="text-space-indigo-400">
          {formatCurrency(effectiveLimit)}
        </span>
        {remaining >= 0 ? (
          <span className="w-14 text-right text-emerald-600">
            {formatCurrency(remaining)}
          </span>
        ) : (
          <span className={`w-14 text-right ${isSavings ? "text-ocean-deep-600" : "text-red-500"}`}>
            {formatCurrency(remaining)}
          </span>
        )}
      </div>
      {suggestedAmount !== undefined && suggestedAmount > 0 && limit === 0 && (
        <div className="ml-[5rem] mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-space-indigo-400">
            Suggested: {formatCurrency(suggestedAmount)}
          </span>
          {onAcceptSuggestion && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAcceptSuggestion();
              }}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-cornflower-blue-600 transition-colors hover:bg-cornflower-blue-50"
            >
              Accept
            </button>
          )}
        </div>
      )}
    </div>
  );
}
