"use client";

import { useState } from "react";
import { formatCurrency } from "@/src/utils/currency";
import { useContributeToGoal } from "@/src/hooks/useContributeToGoal";
import { useDeleteGoal } from "@/src/hooks/useDeleteGoal";
import { useDeleteContribution } from "@/src/hooks/useDeleteContribution";
import type { Goal } from "@/src/types/budget";

interface GoalCardProps {
  goal: Goal;
}

export default function GoalCard({ goal }: GoalCardProps) {
  const [showContribute, setShowContribute] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const contributeToGoal = useContributeToGoal();
  const deleteGoal = useDeleteGoal();
  const deleteContribution = useDeleteContribution();

  const isArchived = Boolean(goal.deletedAt);
  const progressPercent = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0;

  const today = new Date();
  const target = new Date(`${goal.targetDate}T00:00:00`);
  const daysRemaining = Math.max(
    0,
    Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  );

  const handleContribute = () => {
    const amount = Math.round(parseFloat(contributeAmount) * 100) / 100;
    if (isNaN(amount) || amount <= 0) return;

    contributeToGoal.mutate({
      id: goal._id!,
      amount,
      date: new Date().toISOString().split("T")[0],
    });
    setContributeAmount("");
    setShowContribute(false);
  };

  const handleDeleteContribution = (contributionId: string) => {
    if (goal._id && confirm("Delete this contribution?")) {
      deleteContribution.mutate({
        goalId: goal._id,
        contributionId,
      });
    }
  };

  const contributions = goal.contributions ?? [];

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-space-indigo-800">
            {goal.name}
          </h3>
          <p className="text-xs text-space-indigo-400">
            {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isArchived ? (
            <span className="rounded-full bg-space-indigo-100 px-2 py-0.5 text-[10px] font-medium text-space-indigo-500">
              Archived
            </span>
          ) : goal.isFeasible ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              On Track
            </span>
          ) : (
            <span className="rounded-full bg-cornflower-blue-100 px-2 py-0.5 text-[10px] font-medium text-cornflower-blue-700">
              Needs Review
            </span>
          )}
          <button
            onClick={() => {
              if (goal._id && confirm("Delete this goal?")) {
                deleteGoal.mutate(goal._id);
              }
            }}
            className="rounded p-0.5 text-space-indigo-300 transition-colors hover:text-red-500"
            aria-label="Delete goal"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-space-indigo-100">
          <div
            className="h-full rounded-full bg-ocean-deep-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-space-indigo-400">
          <span>{Math.round(progressPercent)}% saved</span>
          <span>
            {daysRemaining > 0
              ? `${daysRemaining} days left`
              : "Target date passed"}
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-space-indigo-400">Needed monthly</span>
          <p className="font-semibold text-space-indigo-700">
            {formatCurrency(goal.monthlyContribution)}
          </p>
        </div>
        <div>
          <span className="text-space-indigo-400">Target date</span>
          <p className="font-semibold text-space-indigo-700">
            {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              }
            )}
          </p>
        </div>
      </div>

      {!goal.isFeasible && !isArchived && (
        <p className="mb-3 text-[11px] text-cornflower-blue-600">
          Your current savings may not cover the required{" "}
          {formatCurrency(goal.monthlyContribution)}/month. Consider adjusting
          your spending or extending the target date.
        </p>
      )}

      {!isArchived && showContribute ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-space-indigo-600">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={contributeAmount}
            onChange={(e) => setContributeAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContribute();
            }}
            className="w-28 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            placeholder="Amount"
            autoFocus
          />
          <button
            onClick={handleContribute}
            disabled={contributeToGoal.isPending}
            className="rounded-md bg-ocean-deep-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-ocean-deep-600 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => setShowContribute(false)}
            className="rounded-md px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        !isArchived && (
          <button
            onClick={() => setShowContribute(true)}
            className="rounded-md bg-space-indigo-50 px-3 py-1.5 text-xs font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
          >
            Add Contribution
          </button>
        )
      )}

      {contributions.length > 0 && (
        <div className="mt-3 border-t border-space-indigo-50 pt-2">
          <p className="mb-1 text-[10px] text-space-indigo-400">
            Contributions
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {contributions
              .slice()
              .reverse()
              .map((c) => (
                <div
                  key={c._id}
                  className="flex items-center justify-between text-[10px] text-space-indigo-500"
                >
                  <span>{c.date}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">
                      {formatCurrency(c.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteContribution(c._id!)}
                      disabled={deleteContribution.isPending}
                      className="rounded px-1 text-space-indigo-300 transition-colors hover:text-red-500 disabled:opacity-50"
                      aria-label="Delete contribution"
                    >
                      &times;
                    </button>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
