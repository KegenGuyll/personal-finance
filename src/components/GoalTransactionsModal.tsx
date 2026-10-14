"use client";

import { useGoalTransactions } from "@/src/hooks/useGoalTransactions";
import { useUnassignTransactionGoal } from "@/src/hooks/useUnassignTransactionGoal";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import Button from "@/src/components/ui/Button";
import Modal from "@/src/components/ui/Modal";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import type { Goal } from "@/src/types/budget";

interface GoalTransactionsModalProps {
  goal: Goal;
  onClose: () => void;
}

export default function GoalTransactionsModal({
  goal,
  onClose,
}: GoalTransactionsModalProps) {
  const goalId = String(goal._id);
  const { data, isLoading, error } = useGoalTransactions(goalId);
  const unassignFromGoal = useUnassignTransactionGoal();

  const transactions = data?.transactions ?? [];
  const totalSpent = data?.totalSpent ?? goal.spentAmount ?? 0;

  const handleRemove = (transactionId: string) => {
    if (confirm("Remove this transaction from the goal?")) {
      unassignFromGoal.mutate(transactionId);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="goal-transactions-title" size="lg">
      <div className="flex items-start justify-between">
        <div>
          <h3 id="goal-transactions-title" className="text-lg font-semibold text-space-indigo-800">
            {goal.name}
          </h3>
          <p className="mt-1 text-sm text-space-indigo-400">
            Spent: {formatCurrency(totalSpent)}
          </p>
        </div>
        <Button
          variant="bare"
          onClick={onClose}
          className="rounded p-1 text-space-indigo-400 hover:text-space-indigo-600"
          aria-label="Close"
        >
          &times;
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4">
          <LoadingSkeleton count={4} className="space-y-2" />
        </div>
      ) : error ? (
        <p className="my-6 text-sm text-red-500">
          Failed to load spending for this goal.
        </p>
      ) : transactions.length === 0 ? (
        <p className="my-6 text-sm text-space-indigo-400">
          No transactions have been spent from this goal yet.
        </p>
      ) : (
        <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
          {transactions.map((txn) => (
            <div
              key={txn.transaction_id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-space-indigo-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-space-indigo-800">{txn.name}</p>
                <p className="text-space-indigo-400">
                  {formatDate(txn.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-500">
                  -{formatCurrency(Math.abs(txn.amount), txn.iso_currency_code)}
                </span>
                <Button
                  variant="bare"
                  onClick={() => handleRemove(txn.transaction_id)}
                  disabled={unassignFromGoal.isPending}
                  className="rounded px-1 text-space-indigo-300 hover:text-red-500"
                  aria-label="Remove from goal"
                >
                  &times;
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-space-indigo-50 pt-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
