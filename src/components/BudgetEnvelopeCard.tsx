"use client";

import { useState } from "react";
import Link from "next/link";
import BudgetProgressBar from "./BudgetProgressBar";
import BudgetRingChart from "./BudgetRingChart";
import SavingsGoalsSection from "./SavingsGoalsSection";
import type { BudgetGroupSummary, Goal } from "@/src/types/budget";
import { formatCurrency } from "@/src/utils/currency";

interface BudgetEnvelopeCardProps {
  group: BudgetGroupSummary;
  month: string;
  isEditing?: boolean;
  goals?: Goal[];
  unallocatedSavings?: number;
  periodFactor?: number;
  onEditCategory: (category: string) => void;
  onAcceptSuggestion: (category: string, suggestedAmount: number) => void;
  onToggleBudgetCategory: (category: string, isBudgeted: boolean) => void;
  onReorderCategories: (orderedNames: string[]) => void;
}

function getEnvelopeRingColor(pct: number): string {
  if (pct < 50) return "#10b981"; // emerald - on track
  if (pct < 80) return "#f59e0b"; // amber - caution
  if (pct <= 100) return "#f97316"; // orange - nearly full
  return "#ef4444"; // red - over
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
  goals,
  unallocatedSavings,
  periodFactor = 1,
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
      className={`flex flex-col rounded-xl border border-space-indigo-100 bg-white p-3.5 shadow-xs border-l-4 sm:p-4 ${getEnvelopeBgColor(group.name)}`}
    >
      {/* Header: Title + Ring Chart */}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-space-indigo-800">
              {group.name}
            </h3>
            <span className="rounded-full bg-space-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-space-indigo-600">
              {group.percentage}%
            </span>
          </div>
          <p className="mt-0.5 text-xs text-space-indigo-400">
            Target: <span className="font-semibold text-space-indigo-700">{formatCurrency(totalTarget)}</span>
          </p>
        </div>

        <div className="relative h-18 w-18 shrink-0 sm:h-20 sm:w-20">
          <BudgetRingChart
            percent={ringPercent}
            color={isSavings ? "#14b8a6" : getEnvelopeRingColor(ringPercent)}
          >
            {isSavings ? (
              <>
                <span className="text-[11px] font-bold text-ocean-deep-600">
                  {formatCurrency(totalSpent)}
                </span>
                <span className="text-[9px] text-ocean-deep-400">
                  of {formatCurrency(totalTarget)}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-bold text-space-indigo-800">
                  {Math.round(ringPercent)}%
                </span>
                <span className="text-[9px] text-space-indigo-400">
                  {(totalTarget - totalSpent) >= 0 ? "left" : "over"}
                </span>
              </>
            )}
          </BudgetRingChart>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg bg-space-indigo-50/50 p-2 text-xs">
        <div>
          <span className="block text-[10px] font-medium text-space-indigo-400">
            {isSavings ? "Target" : "Allocated"}
          </span>
          <span className="font-bold text-space-indigo-700">
            {formatCurrency(isSavings ? totalTarget : totalPlanned)}
          </span>
        </div>

        {!isSavings && unallocated > 0 ? (
          <div>
            <span className="block text-[10px] font-medium text-space-indigo-400">Available</span>
            <span className="font-bold text-emerald-600">
              {formatCurrency(unallocated)}
            </span>
          </div>
        ) : (
          <div>
            <span className="block text-[10px] font-medium text-space-indigo-400">
              {isSavings ? "Saved to Date" : "Actual Spent"}
            </span>
            {totalSpent > 0 ? (
              <Link
                href={groupTransactionsUrl}
                className={`font-bold hover:text-cornflower-blue-600 hover:underline ${spendColorClass}`}
              >
                {formatCurrency(totalSpent)}
              </Link>
            ) : (
              <span className={`font-bold ${spendColorClass}`}>
                {formatCurrency(totalSpent)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Categories / Savings Goals List */}
      <div className="flex-1 space-y-1">
        {isSavings && goals ? (
          <SavingsGoalsSection
            goals={goals}
            unallocatedSavings={unallocatedSavings ?? 0}
            periodFactor={periodFactor}
            month={month}
          />
        ) : (
          orderedCategories.map((cat, index) => (
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
              viewTransactionsUrl={
                cat.actualAmount > 0
                  ? `/transactions?category=${encodeURIComponent(
                      cat.plaidLeaves && cat.plaidLeaves.length > 0
                        ? cat.plaidLeaves.join(",")
                        : cat.category
                    )}&startDate=${startDate}&endDate=${endDate}&transactionType=expense${
                      cat.dailyLimit && cat.dailyLimit > 0
                        ? `&dailyLimit=${cat.dailyLimit}`
                        : ""
                    }`
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Unbudgeted Spending Accordion */}
      {!isSavings && group.unbudgetedCategories.length > 0 && (
        <div className="mt-3 border-t border-space-indigo-100 pt-2.5">
          <button
            type="button"
            onClick={() => setShowUnbudgeted(!showUnbudgeted)}
            className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs text-space-indigo-500 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-700"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`inline-block text-[9px] transition-transform ${showUnbudgeted ? "rotate-90" : ""}`}>
                &#9656;
              </span>
              Unbudgeted spending ({group.unbudgetedCategories.length})
            </span>
            <span className="font-bold text-space-indigo-700">
              {formatCurrency(group.unbudgetedAmount)}
            </span>
          </button>

          {showUnbudgeted && (
            <div className="mt-1.5 space-y-1">
              {group.unbudgetedCategories.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-space-indigo-50/70"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => onToggleBudgetCategory(c.category, true)}
                        title="Add to budget"
                        aria-label={`Add ${c.category} to budget`}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-space-indigo-300 text-xs font-bold leading-none text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
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
                        className="text-[10px] text-cornflower-blue-500 underline-offset-2 hover:text-cornflower-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold text-space-indigo-600">
                    {formatCurrency(c.actualAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(!isSavings || !goals) && group.categories.length === 0 && (
        <p className="py-4 text-center text-xs text-space-indigo-300">
          No categories assigned to this group yet
        </p>
      )}
    </div>
  );
}
