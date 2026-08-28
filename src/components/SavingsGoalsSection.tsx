"use client";

import { useState } from "react";
import Link from "next/link";
import { useContributeToGoal } from "@/src/hooks/useContributeToGoal";
import type { Goal } from "@/src/types/budget";
import { formatCurrency } from "@/src/utils/currency";
import { getEndOfMonth } from "@/src/lib/month-utils";

interface SavingsGoalsSectionProps {
  goals: Goal[];
  unallocatedSavings: number;
  periodFactor: number;
  month: string;
}

export default function SavingsGoalsSection({
  goals,
  unallocatedSavings,
  periodFactor,
  month,
}: SavingsGoalsSectionProps) {
  const [showUnallocated, setShowUnallocated] = useState(false);
  const [allocateGoalId, setAllocateGoalId] = useState<string | null>(null);
  const [allocateAmount, setAllocateAmount] = useState("");
  const contributeToGoal = useContributeToGoal();

  const scaled = (n: number) => Math.round(n / periodFactor);
  const realUnallocated = Math.max(0, Math.round(unallocatedSavings * periodFactor));

  const monthStart = `${month}-01`;
  const monthEnd = getEndOfMonth(month);

  const visible = goals.filter((g) => {
    if (!g.deletedAt) return true;
    return (g.allocatedThisMonth ?? 0) > 0;
  });

  const rows = visible
    .filter((g) => {
      if (g.deletedAt) return true;
      const start = g.startDate ?? monthStart;
      return start <= monthEnd && g.targetDate >= monthStart;
    })
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  const handleAllocate = (goalId: string) => {
    const amount = Math.round(parseFloat(allocateAmount) * 100) / 100;
    if (isNaN(amount) || amount <= 0) return;
    if (amount > realUnallocated) return;

    contributeToGoal.mutate({
      id: goalId,
      amount,
      date: new Date().toISOString().split("T")[0],
    });
    setAllocateAmount("");
    setAllocateGoalId(null);
  };

  if (rows.length === 0 && realUnallocated === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-space-indigo-300">
          No goals for this month.{" "}
          <Link
            href="/budget/goals"
            className="text-cornflower-blue-500 hover:text-cornflower-blue-600"
          >
            Create a goal
          </Link>{" "}
          to track your savings.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-0.5">
      {rows.map((goal) => {
        const completed = goal.currentAmount >= goal.targetAmount;
        const isDeleted = Boolean(goal.deletedAt);
        const allocated = scaled(goal.allocatedThisMonth ?? 0);
        const current = scaled(goal.currentAmount);
        const target = scaled(goal.targetAmount);
        const progressPercent =
          target > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;

        return (
          <div
            key={String(goal._id)}
            className={`group flex min-w-0 items-center gap-1.5 py-1 ${isDeleted ? "opacity-50" : ""}`}
          >
            <span className="w-20 shrink-0 truncate text-[11px] font-medium text-space-indigo-700">
              {isDeleted ? "Deleted goal" : goal.name}
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-space-indigo-100">
                <div
                  className={`h-full rounded-full transition-all ${completed ? "bg-ocean-deep-400" : "bg-space-indigo-400"}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[11px]">
              {allocated > 0 ? (
                <span className="font-semibold text-ocean-deep-600">
                  {formatCurrency(allocated)}
                </span>
              ) : (
                <span className="text-space-indigo-300">$0</span>
              )}
              <span className="text-space-indigo-300">/</span>
              <span className="text-space-indigo-400">
                {formatCurrency(current)} of {formatCurrency(target)}
              </span>
            </div>
            {!isDeleted && completed && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                Completed
              </span>
            )}
            {!isDeleted && !completed && (
              <button
                type="button"
                onClick={() => {
                  setAllocateGoalId(allocateGoalId === String(goal._id) ? null : String(goal._id));
                  setAllocateAmount("");
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-cornflower-blue-500 transition-colors hover:bg-cornflower-blue-50"
              >
                Allocate
              </button>
            )}
          </div>
        );
      })}

      {allocateGoalId && (
        <div className="flex items-center gap-2 py-1">
          <span className="w-20 shrink-0" />
          <span className="text-[11px] text-space-indigo-600">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max={realUnallocated}
            value={allocateAmount}
            onChange={(e) => setAllocateAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAllocate(allocateGoalId);
            }}
            className="w-24 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            placeholder="Amount"
            autoFocus
          />
          <button
            type="button"
            onClick={() => handleAllocate(allocateGoalId)}
            disabled={
              contributeToGoal.isPending ||
              !allocateAmount ||
              parseFloat(allocateAmount) <= 0 ||
              parseFloat(allocateAmount) > realUnallocated
            }
            className="rounded-md bg-ocean-deep-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-ocean-deep-600 disabled:opacity-50"
          >
            {contributeToGoal.isPending ? "Saving..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setAllocateGoalId(null)}
            className="rounded-md px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
          >
            Cancel
          </button>
          {realUnallocated > 0 && (
            <span className="text-[10px] text-space-indigo-400">
              {formatCurrency(scaled(realUnallocated))} available
            </span>
          )}
        </div>
      )}

      {realUnallocated > 0 && (
        <div className="mt-3 border-t border-space-indigo-50 pt-2">
          <button
            type="button"
            onClick={() => setShowUnallocated(!showUnallocated)}
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-600"
          >
            <span className="flex items-center gap-1 font-medium">
              <span className={`inline-block text-[9px] transition-transform ${showUnallocated ? "rotate-90" : ""}`}>
                &#9656;
              </span>
              Unallocated Savings
            </span>
            <span className="font-semibold text-ocean-deep-600">
              {formatCurrency(scaled(realUnallocated))}
            </span>
          </button>
          {showUnallocated && (
            <p className="px-1 py-1 text-[11px] text-space-indigo-400">
              Savings not yet assigned to a goal. Allocate it to a goal above or
              leave it as a buffer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
