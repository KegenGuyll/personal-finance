"use client";

import { useState, type ReactNode } from "react";
import { useCreateGoal } from "@/src/hooks/useCreateGoal";
import { useUpdateGoal } from "@/src/hooks/useUpdateGoal";
import { calcMonthlyContribution } from "@/src/lib/goal-math";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import type { Goal } from "@/src/types/budget";
import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import FieldLabel from "@/src/components/ui/FieldLabel";
import Notice from "@/src/components/ui/Notice";
import TextInput from "@/src/components/ui/TextInput";

interface GoalFormProps {
  /** Set when editing an existing goal; omitted when creating one. */
  goal?: Goal;
  onClose: () => void;
}

export default function GoalForm({ goal, onClose }: GoalFormProps) {
  const isEdit = Boolean(goal);
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(() =>
    goal ? String(goal.targetAmount) : ""
  );
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const isPending = isEdit ? updateGoal.isPending : createGoal.isPending;
  const mutationError = isEdit ? updateGoal.error : createGoal.error;

  const today = new Date().toISOString().split("T")[0];
  const amount = Math.round(parseFloat(targetAmount) * 100) / 100;
  const amountValid = Number.isFinite(amount) && amount > 0;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(targetDate);
  const canSubmit = Boolean(name.trim()) && amountValid && dateValid;

  const currentAmount = goal?.currentAmount ?? 0;
  const monthlyNeeded = canSubmit
    ? calcMonthlyContribution({
        targetAmount: amount,
        targetDate,
        startDate: goal?.startDate ?? startDate,
        currentAmount,
      })
    : null;

  let preview: ReactNode = null;
  if (monthlyNeeded !== null) {
    if (targetDate < today) {
      preview =
        "That target date has passed — pick a date from today onward to preview the monthly amount.";
    } else if (monthlyNeeded > 0) {
      preview = (
        <>
          Needed monthly:{" "}
          <span className="font-semibold text-space-indigo-800">
            {formatCurrency(monthlyNeeded)}
          </span>{" "}
          to reach {formatCurrency(amount)} by {formatDate(targetDate)}.
        </>
      );
    } else if (amount <= currentAmount) {
      preview = `No monthly saving needed — ${formatCurrency(amount)} is already covered.`;
    } else {
      // The maths spreads the target over whole months, and there is none left
      // when the target date is today.
      preview = `Target date is today, so the remaining ${formatCurrency(amount - currentAmount)} cannot be spread across months.`;
    }
  }

  const handleSubmit = () => {
    if (!canSubmit) return;

    if (goal?._id) {
      updateGoal.mutate(
        { id: goal._id, name: name.trim(), targetAmount: amount, targetDate },
        { onSuccess: onClose }
      );
      return;
    }

    createGoal.mutate(
      { name: name.trim(), targetAmount: amount, targetDate, startDate },
      { onSuccess: onClose }
    );
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">
          {isEdit ? "Edit Goal" : "Create Savings Goal"}
        </h3>
        <Button
          variant="bare"
          size="none"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-space-indigo-400 hover:bg-space-indigo-50"
        >
          &times;
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <FieldLabel className="mb-1">Goal Name</FieldLabel>
          <TextInput
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md py-1.5"
            placeholder="Summer Vacation"
          />
        </div>

        <div>
          <FieldLabel className="mb-1">Target Amount</FieldLabel>
          <div className="flex items-center gap-2">
            <span className="text-sm text-space-indigo-600">$</span>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="rounded-md py-1.5"
              placeholder="2000.00"
            />
          </div>
        </div>

        {!isEdit && (
          <div>
            <FieldLabel className="mb-1">Start Date</FieldLabel>
            <TextInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md py-1.5"
            />
          </div>
        )}

        <div>
          <FieldLabel className="mb-1">Target Date</FieldLabel>
          <TextInput
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-md py-1.5"
          />
        </div>

        {preview && (
          <p
            aria-live="polite"
            className="rounded-md bg-space-indigo-50 px-3 py-2 text-xs text-space-indigo-600"
          >
            {preview}
          </p>
        )}

        {mutationError && <Notice>{mutationError.message}</Notice>}

        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="w-full py-2"
        >
          {isPending
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save Changes"
              : "Create Goal"}
        </Button>
      </div>
    </Card>
  );
}
