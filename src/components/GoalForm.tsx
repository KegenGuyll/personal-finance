"use client";

import { useState } from "react";
import { useCreateGoal } from "@/src/hooks/useCreateGoal";
import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import FieldLabel from "@/src/components/ui/FieldLabel";
import TextInput from "@/src/components/ui/TextInput";

interface GoalFormProps {
  onClose: () => void;
}

export default function GoalForm({ onClose }: GoalFormProps) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const createGoal = useCreateGoal();

  const handleSubmit = () => {
    if (!name.trim() || !targetAmount || !targetDate) return;

    const amount = Math.round(parseFloat(targetAmount) * 100) / 100;
    if (isNaN(amount) || amount <= 0) return;

    createGoal.mutate(
      {
        name: name.trim(),
        targetAmount: amount,
        targetDate,
        startDate,
      },
      {
        onSuccess: () => {
          setName("");
          setTargetAmount("");
          setTargetDate("");
          setStartDate(new Date().toISOString().split("T")[0]);
          onClose();
        },
      }
    );
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">
          Create Savings Goal
        </h3>
        <Button
          variant="bare"
          size="none"
          onClick={onClose}
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

        <div>
          <FieldLabel className="mb-1">Start Date</FieldLabel>
          <TextInput
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md py-1.5"
          />
        </div>

        <div>
          <FieldLabel className="mb-1">Target Date</FieldLabel>
          <TextInput
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-md py-1.5"
          />
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={createGoal.isPending}
          className="w-full"
        >
          {createGoal.isPending ? "Creating..." : "Create Goal"}
        </Button>
      </div>
    </Card>
  );
}
