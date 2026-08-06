"use client";

import { useState } from "react";
import Link from "next/link";
import BudgetProgressBar from "./BudgetProgressBar";
import BudgetRingChart from "./BudgetRingChart";
import type { BudgetGroupSummary } from "@/src/types/budget";
import { formatCurrency } from "@/src/utils/currency";
import { CHART_COLORS } from "@/src/utils/chart-colors";

interface BudgetEnvelopeCardProps {
  group: BudgetGroupSummary;
  month: string;
  isEditing?: boolean;
  onEditCategory: (category: string) => void;
  onAcceptSuggestion: (category: string, suggestedAmount: number) => void;
  onToggleBudgetCategory: (category: string, isBudgeted: boolean) => void;
  onReorderCategories: (orderedNames: string[]) => void;
}

function getEnvelopeRingColor(pct: number): string {
  if (pct < 50) return CHART_COLORS[0];
  if (pct < 80) return CHART_COLORS[4];
  if (pct <= 100) return CHART_COLORS[6];
  return "#ef4444";
}

function getEnvelopeBgColor(name: string): string {
  if (name === "Needs") return "border-l-space-indigo-500";
  if (name === "Savings") return "border-l-ocean-deep-500";
  return "border-l-cornflower-blue-500";
}

function getEndOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function getSpendColorClass(spendPercent: number): string {
  if (spendPercent > 100) return "text-red-500";
  if (spendPercent >= 80) return "text-amber-500";
  return "text-emerald-600";
}

export default function BudgetEnvelopeCard({
  group,
  month,
  isEditing = false,
  onEditCategory,
  onAcceptSuggestion,
  onToggleBudgetCategory,
  onReorderCategories,
}: BudgetEnvelopeCardProps) {
  const isSavings = group.name === "Savings";
  const totalTarget = group.targetAmount;
  const totalPlanned = group.plannedAmount;
  const totalSpent = group.actualAmount;
  const unallocated = group.unallocatedAmount;
  const ringPercent = totalTarget > 0 ? Math.min((totalSpent / totalTarget) * 100, 100) : 0;
  const spendPercent = totalTarget > 0 ? (totalSpent / totalTarget) * 100 : 0;
  const spendColorClass = isSavings ? "text-ocean-deep-600" : getSpendColorClass(spendPercent);
  const [showUnbudgeted, setShowUnbudgeted] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const visibleCategories = group.categories.filter(
    (c) => c.plannedAmount > 0 || c.actualAmount > 0
  );
  const categoryByName = new Map(
    visibleCategories.map((c) => [c.category, c])
  );
  const orderedNames = (localOrder ?? visibleCategories.map((c) => c.category))
    .filter((name) => categoryByName.has(name));
  const orderedCategories = orderedNames
    .map((name) => categoryByName.get(name))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedNames.length) return;
    const next = [...orderedNames];
    [next[index], next[target]] = [next[target], next[index]];
    setLocalOrder(next);
    onReorderCategories(next);
  }

  const startDate = `${month}-01`;
  const endDate = getEndOfMonth(month);
  const groupTransactionsUrl = `/transactions?startDate=${startDate}&endDate=${endDate}&transactionType=expense`;

  return (
    <div
      className={`rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm border-l-4 ${getEnvelopeBgColor(group.name)}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-space-indigo-800">
            {group.name}
          </h3>
          <p className="text-xs text-space-indigo-400">{group.percentage}% of income</p>
        </div>
        <div className="relative h-20 w-20">
          <BudgetRingChart
            percent={ringPercent}
            color={isSavings ? CHART_COLORS[4] : getEnvelopeRingColor(ringPercent)}
          >
            {isSavings ? (
              <>
                <span className="text-[11px] font-bold text-ocean-deep-600">
                  {formatCurrency(totalSpent)}
                </span>
                <span className="text-[10px] text-ocean-deep-400">
                  of {formatCurrency(totalTarget)}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-space-indigo-700">
                  {Math.round(ringPercent)}%
                </span>
                <span className="text-[10px] text-space-indigo-400">
                  {(totalTarget - totalSpent) >= 0 ? "left" : "over"}
                </span>
              </>
            )}
          </BudgetRingChart>
        </div>
      </div>

      <div className="mb-3 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-space-indigo-400">Target</span>
          <span className="font-semibold text-space-indigo-700">
            {formatCurrency(totalTarget)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-space-indigo-400">Allocated</span>
          <span className="font-semibold text-space-indigo-700">
            {formatCurrency(totalPlanned)}
          </span>
        </div>
        {unallocated > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-space-indigo-400">Available</span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(unallocated)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-xs border-t border-space-indigo-50 pt-1">
          <span className="text-space-indigo-400">{isSavings ? "Saved" : "Spent"}</span>
          {totalSpent > 0 ? (
            <Link
              href={groupTransactionsUrl}
              className={`font-semibold hover:text-cornflower-blue-600 hover:underline ${spendColorClass}`}
            >
              {formatCurrency(totalSpent)}
            </Link>
          ) : (
            <span className={`font-semibold ${spendColorClass}`}>
              {formatCurrency(totalSpent)}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-0.5">
        {orderedCategories.map((cat, index) => (
          <BudgetProgressBar
            key={cat.category}
            label={cat.category}
            spent={cat.actualAmount}
            limit={cat.plannedAmount}
            carryover={cat.carryoverFromPrevious}
            onEdit={() => onEditCategory(cat.category)}
            suggestedAmount={cat.suggestedAmount}
            isSavings={isSavings}
            onAcceptSuggestion={
              cat.suggestedAmount > 0
                ? () => onAcceptSuggestion(cat.category, cat.suggestedAmount)
                : undefined
            }
            onMoveUp={
              isEditing && index > 0
                ? () => handleMove(index, -1)
                : undefined
            }
            onMoveDown={
              isEditing && index < orderedCategories.length - 1
                ? () => handleMove(index, 1)
                : undefined
            }
            onToggleBudget={
              isEditing
                ? () => onToggleBudgetCategory(cat.category, false)
                : undefined
            }
            viewTransactionsUrl={cat.actualAmount > 0
              ? `/transactions?category=${encodeURIComponent(
                  (cat.plaidLeaves && cat.plaidLeaves.length > 0
                    ? cat.plaidLeaves.join(",")
                    : cat.category)
                )}&startDate=${startDate}&endDate=${endDate}&transactionType=expense${
                  cat.dailyLimit && cat.dailyLimit > 0
                    ? `&dailyLimit=${cat.dailyLimit}`
                    : ""
                }`
              : undefined}
          />
        ))}
      </div>

      {group.unbudgetedCategories.length > 0 && (
        <div className="mt-3 border-t border-space-indigo-50 pt-2">
          <button
            type="button"
            onClick={() => setShowUnbudgeted(!showUnbudgeted)}
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-600"
          >
            <span className="flex items-center gap-1 font-medium">
              <span className={`inline-block text-[9px] transition-transform ${showUnbudgeted ? "rotate-90" : ""}`}>
                &#9656;
              </span>
              Unbudgeted spending
            </span>
            <span className="font-semibold text-space-indigo-600">
              {formatCurrency(group.unbudgetedAmount)}
            </span>
          </button>
          {showUnbudgeted && (
            <div className="mt-1 space-y-0.5">
              {group.unbudgetedCategories.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between rounded-md px-1 py-1 text-[11px] hover:bg-space-indigo-50"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => onToggleBudgetCategory(c.category, true)}
                        title="Add to budget"
                        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border border-space-indigo-300 text-[9px] leading-none text-transparent transition-colors hover:border-space-indigo-400 hover:text-space-indigo-300"
                      >
                        +
                      </button>
                    )}
                    <span className="truncate font-medium text-space-indigo-700">
                      {c.category}
                    </span>
                    {c.actualAmount > 0 && c.plaidLeaves.length > 0 && (
                      <Link
                        href={`/transactions?category=${encodeURIComponent(
                          c.plaidLeaves.join(",")
                        )}&startDate=${startDate}&endDate=${endDate}&transactionType=expense`}
                        className="text-[10px] text-cornflower-blue-500 hover:text-cornflower-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </div>
                  <span className="shrink-0 text-space-indigo-500">
                    {formatCurrency(c.actualAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {group.categories.length === 0 && (
        <p className="py-3 text-center text-xs text-space-indigo-300">
          No categories assigned to this group yet
        </p>
      )}
    </div>
  );
}
