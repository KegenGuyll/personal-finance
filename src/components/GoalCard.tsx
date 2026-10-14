"use client";

import { useState } from "react";
import { formatCurrency } from "@/src/utils/currency";
import { useContributeToGoal } from "@/src/hooks/useContributeToGoal";
import { useDeleteGoal } from "@/src/hooks/useDeleteGoal";
import { useDeleteContribution } from "@/src/hooks/useDeleteContribution";
import GoalTransactionsModal from "@/src/components/GoalTransactionsModal";
import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import Chip from "@/src/components/ui/Chip";
import TextInput from "@/src/components/ui/TextInput";
import type { Goal } from "@/src/types/budget";

interface GoalCardProps {
  goal: Goal;
}

export default function GoalCard({ goal }: GoalCardProps) {
  const [showContribute, setShowContribute] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const [showTransactions, setShowTransactions] = useState(false);
  const contributeToGoal = useContributeToGoal();
  const deleteGoal = useDeleteGoal();
  const deleteContribution = useDeleteContribution();

  const isArchived = Boolean(goal.deletedAt);
  const spent = goal.spentAmount ?? 0;
  const available = goal.currentAmount - spent;
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
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-space-indigo-800">
            {goal.name}
          </h3>
          <p className="text-xs text-space-indigo-400">
            {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
          </p>
          {spent > 0 && (
            <p className="mt-0.5 text-[11px] text-space-indigo-400">
              Spent {formatCurrency(spent)} · Available{" "}
              <span className={available < 0 ? "font-semibold text-red-500" : ""}>
                {formatCurrency(available)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isArchived ? (
            <Chip tone="indigo-muted">Archived</Chip>
          ) : goal.isFeasible ? (
            <Chip tone="emerald">On Track</Chip>
          ) : (
            <Chip tone="blue">Needs Review</Chip>
          )}
          <Button
            variant="bare"
            size="none"
            onClick={() => {
              if (goal._id && confirm("Delete this goal?")) {
                deleteGoal.mutate(goal._id);
              }
            }}
            className="rounded p-0.5 text-space-indigo-300 hover:text-red-500"
            aria-label="Delete goal"
          >
            &times;
          </Button>
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
          <TextInput
            type="number"
            step="0.01"
            min="0"
            value={contributeAmount}
            onChange={(e) => setContributeAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContribute();
            }}
            className="w-28 rounded-md px-2 py-1 text-xs"
            placeholder="Amount"
            autoFocus
          />
          <Button
            variant="primary"
            size="xs"
            onClick={handleContribute}
            disabled={contributeToGoal.isPending}
            className="bg-ocean-deep-500 hover:bg-ocean-deep-600 active:bg-ocean-deep-600"
          >
            Add
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowContribute(false)}
            className="font-normal hover:text-space-indigo-400"
          >
            Cancel
          </Button>
        </div>
      ) : (
        !isArchived && (
          <Button
            variant="bare"
            size="sm"
            onClick={() => setShowContribute(true)}
            className="rounded-md bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
          >
            Add Contribution
          </Button>
        )
      )}

      {/* Archived goals keep their goal-funded transactions, so their spending
          must stay viewable/removable even though new assignments are blocked. */}
      {(!isArchived || (goal.spendCount ?? 0) > 0) && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowTransactions(true)}
          className="mt-2 w-full rounded-md border-cornflower-blue-200 bg-cornflower-blue-50 text-cornflower-blue-700 hover:bg-cornflower-blue-100"
        >
          View spending ({goal.spendCount ?? 0})
        </Button>
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
                    <Button
                      variant="bare"
                      size="none"
                      onClick={() => handleDeleteContribution(c._id!)}
                      disabled={deleteContribution.isPending}
                      className="rounded px-1 text-space-indigo-300 hover:text-red-500"
                      aria-label="Delete contribution"
                    >
                      &times;
                    </Button>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {showTransactions && (
        <GoalTransactionsModal
          goal={goal}
          onClose={() => setShowTransactions(false)}
        />
      )}
    </Card>
  );
}
