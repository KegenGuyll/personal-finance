"use client";

import { useState } from "react";
import { useGoals } from "@/src/hooks/useGoals";
import { useAssignTransactionGoal } from "@/src/hooks/useAssignTransactionGoal";
import { useUnassignTransactionGoal } from "@/src/hooks/useUnassignTransactionGoal";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import { formatCurrency } from "@/src/utils/currency";

interface GoalAssignerProps {
  transactionId: string;
  currentGoalId?: string | null;
}

export default function GoalAssigner({
  transactionId,
  currentGoalId,
}: GoalAssignerProps) {
  const { data, isLoading } = useGoals();
  const assignToGoal = useAssignTransactionGoal();
  const unassignFromGoal = useUnassignTransactionGoal();
  const [selectedGoalId, setSelectedGoalId] = useState("");

  if (isLoading) {
    return <LoadingSkeleton count={1} className="mt-1" />;
  }

  const goals = data?.goals ?? [];
  const currentGoal = goals.find((g) => String(g._id) === currentGoalId);

  if (currentGoalId) {
    return (
      <span className="flex items-center gap-2 text-sm text-space-indigo-800">
        <span>{currentGoal?.name ?? "Goal"}</span>
        <button
          onClick={() => unassignFromGoal.mutate(transactionId)}
          disabled={unassignFromGoal.isPending}
          className="text-xs font-medium text-red-500 transition-colors hover:text-red-600 disabled:opacity-50"
        >
          {unassignFromGoal.isPending ? "Removing..." : "Remove"}
        </button>
      </span>
    );
  }

  if (goals.length === 0) {
    return (
      <span className="text-sm text-space-indigo-400">
        No goals to spend from.
      </span>
    );
  }

  const handleAssign = () => {
    if (!selectedGoalId) return;
    assignToGoal.mutate({
      transactionId,
      goalId: selectedGoalId,
    });
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Spend from goal"
        value={selectedGoalId}
        onChange={(e) => setSelectedGoalId(e.target.value)}
        className="rounded-md border border-space-indigo-200 bg-white px-2 py-1 text-sm text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
      >
        <option value="" disabled>
          Select a goal…
        </option>
        {goals.map((goal) => {
          const available =
            goal.currentAmount - (goal.spentAmount ?? 0);
          return (
            <option key={String(goal._id)} value={String(goal._id)}>
              {goal.name} · {formatCurrency(available)} available
            </option>
          );
        })}
      </select>
      <button
        onClick={handleAssign}
        disabled={assignToGoal.isPending || !selectedGoalId}
        className="rounded-md bg-cornflower-blue-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-cornflower-blue-600 disabled:opacity-50"
      >
        {assignToGoal.isPending ? "Saving..." : "Assign"}
      </button>
    </span>
  );
}
