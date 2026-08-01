"use client";

import Link from "next/link";
import BudgetProgressBar from "./BudgetProgressBar";
import BudgetRingChart from "./BudgetRingChart";
import type { BudgetGroupSummary } from "@/src/types/budget";
import { formatCurrency } from "@/src/utils/currency";
import { CHART_COLORS } from "@/src/utils/chart-colors";

interface BudgetEnvelopeCardProps {
  group: BudgetGroupSummary;
  month: string;
  onEditCategory: (category: string) => void;
  onAcceptSuggestion: (category: string, suggestedAmount: number) => void;
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

export default function BudgetEnvelopeCard({
  group,
  month,
  onEditCategory,
  onAcceptSuggestion,
}: BudgetEnvelopeCardProps) {
  const isSavings = group.name === "Savings";
  const totalTarget = group.targetAmount;
  const totalPlanned = group.plannedAmount;
  const totalSpent = group.actualAmount;
  const unallocated = group.unallocatedAmount;
  const ringPercent = totalTarget > 0 ? Math.min((totalSpent / totalTarget) * 100, 100) : 0;

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
              className={`font-semibold hover:text-cornflower-blue-600 hover:underline ${
                isSavings ? "text-ocean-deep-600" : "text-red-500"
              }`}
            >
              {formatCurrency(totalSpent)}
            </Link>
          ) : (
            <span className={`font-semibold ${isSavings ? "text-ocean-deep-600" : "text-red-500"}`}>
              {formatCurrency(totalSpent)}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-0.5">
        {group.categories
          .filter((c) => c.plannedAmount > 0 || c.actualAmount > 0)
          .map((cat) => (
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
              viewTransactionsUrl={cat.actualAmount > 0
                ? `/transactions?category=${encodeURIComponent(
                    (cat.plaidLeaves && cat.plaidLeaves.length > 0
                      ? cat.plaidLeaves.join(",")
                      : cat.category)
                  )}&startDate=${startDate}&endDate=${endDate}&transactionType=expense`
                : undefined}
            />
          ))}
      </div>

      {group.categories.length === 0 && (
        <p className="py-3 text-center text-xs text-space-indigo-300">
          No categories assigned to this group yet
        </p>
      )}
    </div>
  );
}
