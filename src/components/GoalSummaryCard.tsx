"use client";

import { useMemo } from "react";
import GoalProgressBar from "@/src/components/GoalProgressBar";
import { classifyGoals, summarizeActiveGoals } from "@/src/lib/goal-sections";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import type { Goal } from "@/src/types/budget";

interface GoalSummaryCardProps {
  goals: Goal[];
  /** This month's savings-group actuals, from the goals query. */
  savingsActual: number;
}

function daysUntil(targetDate: string): number {
  const target = new Date(`${targetDate}T00:00:00`).getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function GoalSummaryCard({
  goals,
  savingsActual,
}: GoalSummaryCardProps) {
  const summary = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const { active } = classifyGoals(goals, today);
    return summarizeActiveGoals(active, savingsActual);
  }, [goals, savingsActual]);

  if (summary.count === 0) return null;

  const covered = summary.monthlyNeeded <= summary.savingsThisMonth;
  const status =
    summary.savingsThisMonth === 0
      ? { label: "No savings yet", className: "bg-space-indigo-100 text-space-indigo-500" }
      : covered
        ? { label: "On track", className: "bg-emerald-100 text-emerald-700" }
        : { label: "Needs review", className: "bg-amber-100 text-amber-700" };

  const coverage =
    summary.savingsThisMonth === 0
      ? `No savings recorded this month yet — the plan needs ${formatCurrency(summary.monthlyNeeded)}/month.`
      : covered
        ? `${formatCurrency(summary.savingsThisMonth)} saved this month covers the ${formatCurrency(summary.monthlyNeeded)}/month plan.`
        : `${formatCurrency(summary.savingsThisMonth)} saved this month — ${formatCurrency(summary.shortfall)}/month short of the ${formatCurrency(summary.monthlyNeeded)}/month plan.`;

  const next = summary.next;
  const daysLeft = next ? daysUntil(next.targetDate) : 0;

  return (
    <section className="rounded-xl border border-space-indigo-100 bg-white p-4 shadow-2xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-space-indigo-600">Active goals</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-space-indigo-400">
            {summary.count} goal{summary.count === 1 ? "" : "s"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-space-indigo-400">
            Needed monthly
          </p>
          <p className="text-lg font-bold text-space-indigo-800">
            {formatCurrency(summary.monthlyNeeded)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-space-indigo-400">
            Saved so far
          </p>
          <p className="text-lg font-bold text-space-indigo-800">
            {formatCurrency(summary.saved)}
          </p>
          <p className="text-[11px] text-space-indigo-400">
            of {formatCurrency(summary.target)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-space-indigo-400">
            Still to save
          </p>
          <p className="text-lg font-bold text-space-indigo-800">
            {formatCurrency(summary.remaining)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <GoalProgressBar percent={summary.progressPct} />
        <p className="mt-1 text-[10px] text-space-indigo-400">
          {Math.round(summary.progressPct)}% of {formatCurrency(summary.target)} saved
        </p>
      </div>

      <div className="mt-3 space-y-1 border-t border-space-indigo-50 pt-2 text-xs text-space-indigo-500">
        <p>{coverage}</p>
        {next && (
          <p>
            Next deadline:{" "}
            <span className="font-medium text-space-indigo-700">{next.name}</span>{" "}
            &middot; {formatDate(next.targetDate)} &middot;{" "}
            {daysLeft === 0
              ? "due today"
              : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
          </p>
        )}
      </div>
    </section>
  );
}
