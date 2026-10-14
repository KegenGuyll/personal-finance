"use client";

import { useState } from "react";
import { useGoals } from "@/src/hooks/useGoals";
import { useAssignTransactionGoal } from "@/src/hooks/useAssignTransactionGoal";
import { useUnassignTransactionGoal } from "@/src/hooks/useUnassignTransactionGoal";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import GoalSelect from "@/src/components/GoalSelect";
import Button from "@/src/components/ui/Button";

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
        <Button
          variant="danger"
          size="none"
          onClick={() => unassignFromGoal.mutate(transactionId)}
          disabled={unassignFromGoal.isPending}
          className="text-xs font-medium"
        >
          {unassignFromGoal.isPending ? "Removing..." : "Remove"}
        </Button>
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
      <GoalSelect
        aria-label="Spend from goal"
        goals={goals}
        value={selectedGoalId}
        onChange={setSelectedGoalId}
        size="compact"
      />
      <Button
        variant="accent"
        size="xs"
        onClick={handleAssign}
        disabled={assignToGoal.isPending || !selectedGoalId}
        className="bg-cornflower-blue-500 hover:bg-cornflower-blue-600 active:bg-cornflower-blue-600"
      >
        {assignToGoal.isPending ? "Saving..." : "Assign"}
      </Button>
    </span>
  );
}
