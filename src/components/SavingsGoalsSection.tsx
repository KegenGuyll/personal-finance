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
        <p className="text-xs text-space-indigo-400">
          No goals for this month.{" "}
          <Link
            href="/budget/goals"
            className="font-medium text-cornflower-blue-500 hover:text-cornflower-blue-600 underline-offset-2 hover:underline"
          >
            Create a goal
          </Link>{" "}
          to track your savings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((goal) => {
        const completed = goal.currentAmount >= goal.targetAmount;
        const isDeleted = Boolean(goal.deletedAt);
        const allocated = scaled(goal.allocatedThisMonth ?? 0);
        const current = scaled(goal.currentAmount);
        const target = scaled(goal.targetAmount);
        const progressPercent =
          target > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
        const isAllocatingThis = allocateGoalId === String(goal._id);

        return (
          <div
            key={String(goal._id)}
            className={`rounded-lg p-1.5 transition-colors hover:bg-space-indigo-50/50 ${
              isDeleted ? "opacity-50" : ""
            }`}
          >
            {/* Top row: Goal Name & Badges */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-space-indigo-800">
                  {isDeleted ? "Deleted goal" : goal.name}
                </span>
                {!isDeleted && completed && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.2 text-[9px] font-semibold text-emerald-700">
                    Completed
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                <div className="flex items-center gap-1">
                  {allocated > 0 ? (
                    <span className="font-bold text-ocean-deep-600">
                      +{formatCurrency(allocated)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-space-indigo-400">$0</span>
                  )}
                  <span className="text-[11px] text-space-indigo-300">/</span>
                  <span className="text-[11px] text-space-indigo-500">
                    {formatCurrency(current)} of {formatCurrency(target)}
                  </span>
                </div>

                {!isDeleted && !completed && (
                  <button
                    type="button"
                    onClick={() => {
                      setAllocateGoalId(isAllocatingThis ? null : String(goal._id));
                      setAllocateAmount("");
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      isAllocatingThis
                        ? "bg-ocean-deep-500 text-white"
                        : "bg-ocean-deep-50 text-ocean-deep-600 hover:bg-ocean-deep-100"
                    }`}
                  >
                    Allocate
                  </button>
                )}
              </div>
            </div>

            {/* Middle row: Progress Bar */}
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-space-indigo-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  completed ? "bg-emerald-500" : "bg-ocean-deep-400"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Inline Allocate Form */}
            {isAllocatingThis && (
              <div className="mt-2 rounded-md border border-ocean-deep-200 bg-ocean-deep-50/70 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-ocean-deep-700">Add to goal:</span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-xs text-ocean-deep-600">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={realUnallocated}
                        value={allocateAmount}
                        onChange={(e) => setAllocateAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAllocate(String(goal._id));
                        }}
                        className="w-24 rounded border border-ocean-deep-200 bg-white py-1 pl-5 pr-1.5 text-xs font-medium text-space-indigo-800 focus:border-ocean-deep-400 focus:outline-none"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAllocate(String(goal._id))}
                      disabled={
                        contributeToGoal.isPending ||
                        !allocateAmount ||
                        parseFloat(allocateAmount) <= 0 ||
                        parseFloat(allocateAmount) > realUnallocated
                      }
                      className="rounded bg-ocean-deep-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-ocean-deep-600 disabled:opacity-50"
                    >
                      {contributeToGoal.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllocateGoalId(null)}
                      className="rounded px-2 py-1 text-xs text-space-indigo-500 transition-colors hover:bg-ocean-deep-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {realUnallocated > 0 && (
                  <p className="mt-1 text-[10px] text-ocean-deep-600">
                    Max available from unallocated: {formatCurrency(scaled(realUnallocated))}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {realUnallocated > 0 && (
        <div className="mt-3 border-t border-space-indigo-100 pt-2">
          <button
            type="button"
            onClick={() => setShowUnallocated(!showUnallocated)}
            className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs text-space-indigo-500 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-700"
          >
            <span className="flex items-center gap-1 font-medium">
              <span className={`inline-block text-[9px] transition-transform ${showUnallocated ? "rotate-90" : ""}`}>
                &#9656;
              </span>
              Unallocated Savings Buffer
            </span>
            <span className="font-bold text-ocean-deep-600">
              {formatCurrency(scaled(realUnallocated))}
            </span>
          </button>
          {showUnallocated && (
            <p className="mt-1 px-1.5 text-[11px] text-space-indigo-400">
              Savings not yet assigned to a goal. Allocate it to a goal above or leave it as a buffer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
