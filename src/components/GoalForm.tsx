"use client";

import { useState } from "react";
import { useCreateGoal } from "@/src/hooks/useCreateGoal";

interface GoalFormProps {
  onClose: () => void;
}

export default function GoalForm({ onClose }: GoalFormProps) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const createGoal = useCreateGoal();

  const handleSubmit = () => {
    if (!name.trim() || !targetAmount || !targetDate) return;

    const amount = Math.round(parseFloat(targetAmount) * 100);
    if (isNaN(amount) || amount <= 0) return;

    createGoal.mutate(
      {
        name: name.trim(),
        targetAmount: amount,
        targetDate,
      },
      {
        onSuccess: () => {
          setName("");
          setTargetAmount("");
          setTargetDate("");
          onClose();
        },
      }
    );
  };

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">
          Create Savings Goal
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
        >
          &times;
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-space-indigo-600">
            Goal Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-space-indigo-200 px-3 py-1.5 text-sm text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            placeholder="Summer Vacation"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-space-indigo-600">
            Target Amount
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-space-indigo-600">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full rounded-md border border-space-indigo-200 px-3 py-1.5 text-sm text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
              placeholder="2000.00"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-space-indigo-600">
            Target Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-md border border-space-indigo-200 px-3 py-1.5 text-sm text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={createGoal.isPending}
          className="w-full rounded-lg bg-space-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        >
          {createGoal.isPending ? "Creating..." : "Create Goal"}
        </button>
      </div>
    </div>
  );
}
