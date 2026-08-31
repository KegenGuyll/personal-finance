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
  onToggleBudget?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
  onToggleBudget,
  onMoveUp,
  onMoveDown,
}: BudgetProgressBarProps) {
  const effectiveLimit = limit + (carryover ?? 0);
  const percent = effectiveLimit > 0 ? Math.min((spent / effectiveLimit) * 100, 100) : 0;
  const remaining = effectiveLimit - spent;
  const isOver = remaining < 0;

  return (
    <div className="group rounded-lg p-1.5 transition-colors hover:bg-space-indigo-50/50">
      {/* Top row: Category name + Amounts & Remaining */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            title="Click to edit budget"
            className="flex items-center gap-1 truncate text-left text-xs font-semibold text-space-indigo-800 transition-colors hover:text-cornflower-blue-600"
          >
            <span className="truncate">{label}</span>
            {onEdit && (
              <span className="text-[10px] text-space-indigo-300 opacity-70 group-hover:opacity-100" aria-hidden="true">
                ✎
              </span>
            )}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <div className="flex items-center gap-1">
            {viewTransactionsUrl ? (
              <Link
                href={viewTransactionsUrl}
                title="View transactions"
                className="font-bold text-space-indigo-800 underline-offset-2 hover:text-cornflower-blue-600 hover:underline"
              >
                {formatCurrency(spent)}
              </Link>
            ) : (
              <span className="font-bold text-space-indigo-800">
                {formatCurrency(spent)}
              </span>
            )}
            <span className="text-[11px] text-space-indigo-300">/</span>
            <span className="text-[11px] text-space-indigo-500">
              {formatCurrency(effectiveLimit)}
            </span>
          </div>

          <span
            className={`min-w-[4rem] text-right text-[11px] font-semibold ${
              isOver
                ? isSavings
                  ? "text-ocean-deep-600"
                  : "text-red-500"
                : "text-emerald-600"
            }`}
          >
            {isOver
              ? `-${formatCurrency(Math.abs(remaining))}`
              : `${formatCurrency(remaining)} left`}
          </span>
        </div>
      </div>

      {/* Middle row: Progress Bar */}
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-space-indigo-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor(percent, isSavings)}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Bottom row: Edit mode controls & Suggestion actions */}
      {((onMoveUp || onMoveDown || onToggleBudget) || (suggestedAmount !== undefined && suggestedAmount > 0 && limit === 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
          {/* Suggestion prompt if exists */}
          {suggestedAmount !== undefined && suggestedAmount > 0 && limit === 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-space-indigo-500">
                Avg spend: <span className="font-medium text-space-indigo-700">{formatCurrency(suggestedAmount)}</span>
              </span>
              {onAcceptSuggestion && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAcceptSuggestion();
                  }}
                  className="rounded bg-cornflower-blue-50 px-2 py-0.5 text-[11px] font-medium text-cornflower-blue-600 transition-colors hover:bg-cornflower-blue-100 active:bg-cornflower-blue-200"
                >
                  Set Budget
                </button>
              )}
            </div>
          )}

          {/* Edit / Reorder Controls */}
          {(onMoveUp || onMoveDown || onToggleBudget) && (
            <div className="ml-auto flex items-center gap-1">
              {(onMoveUp || onMoveDown) && (
                <div className="flex items-center rounded-md border border-space-indigo-200 bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveUp?.();
                    }}
                    disabled={!onMoveUp}
                    title="Move category up"
                    aria-label="Move category up"
                    className="flex h-6 w-6 items-center justify-center text-xs text-space-indigo-500 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-800 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &#9650;
                  </button>
                  <div className="h-3 w-px bg-space-indigo-100" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveDown?.();
                    }}
                    disabled={!onMoveDown}
                    title="Move category down"
                    aria-label="Move category down"
                    className="flex h-6 w-6 items-center justify-center text-xs text-space-indigo-500 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-800 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &#9660;
                  </button>
                </div>
              )}

              {onToggleBudget && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleBudget();
                  }}
                  title="Remove from budget envelope"
                  className="flex items-center gap-1 rounded-md border border-space-indigo-200 bg-white px-2 py-0.5 text-[11px] font-medium text-space-indigo-600 shadow-2xs transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-800"
                >
                  <span className="text-space-indigo-500">&#10003;</span>
                  In Budget
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
