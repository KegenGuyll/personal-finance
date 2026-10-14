"use client";

import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import { useUnmarkIncome } from "@/src/hooks/useUnmarkIncome";
import Link from "next/link";
import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import Card from "@/src/components/ui/Card";

function IncomeButton({
  transaction,
  onMarkIncomeStart,
}: {
  transaction: Transaction;
  onMarkIncomeStart: (name: string) => void;
}) {
  const unmarkIncome = useUnmarkIncome();

  const isIncome = transaction.transaction_type === "income";
  const isPending = unmarkIncome.isPending;

  if (isIncome) {
    return (
      <Button
        variant="bare"
        size="none"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          unmarkIncome.mutate(transaction.transaction_id);
        }}
        disabled={isPending}
        className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200"
      >
        {isPending ? "..." : "Income"}
      </Button>
    );
  }

  return (
    <Button
      variant="bare"
      size="none"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMarkIncomeStart(transaction.name);
      }}
      className="shrink-0 rounded-md bg-space-indigo-50 px-2 py-0.5 text-[10px] font-medium text-space-indigo-400 hover:bg-space-indigo-200 hover:text-space-indigo-700"
    >
      Income?
    </Button>
  );
}

export default function TransactionItem({
  transaction,
  showIncomeButton = false,
  onMarkIncomeStart,
}: {
  transaction: Transaction;
  showIncomeButton?: boolean;
  onMarkIncomeStart?: (name: string) => void;
}) {
  return (
    <Link
      href={`/accounts/${transaction.account_id}/transactions/${transaction.transaction_id}`}
      className="block transition-shadow hover:shadow-md"
    >
      <Card className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-space-indigo-800">
            {transaction.name}
          </p>
          <p className="text-xs text-space-indigo-400">
            {formatDate(transaction.date)}
            {transaction.pending && (
              <span className="ml-2 text-soft-periwinkle-500">Pending</span>
            )}
          </p>
          {transaction.category && transaction.category.length > 0 && (
            <p className="mt-0.5 text-xs text-space-indigo-300">
              {transaction.category.join(" · ")}
            </p>
          )}
        </div>
        <div className="ml-3 flex items-center gap-2">
          {transaction.manual && (
            <Chip className="shrink-0 rounded-md bg-soft-periwinkle-100 text-soft-periwinkle-700">
              Manual
            </Chip>
          )}
          {transaction.goalId && (
            <Chip tone="blue" className="shrink-0 rounded-md">
              Goal
            </Chip>
          )}
          {showIncomeButton && onMarkIncomeStart && (
            <IncomeButton
              transaction={transaction}
              onMarkIncomeStart={onMarkIncomeStart}
            />
          )}
          <p
            className={`whitespace-nowrap text-sm font-semibold ${
              transaction.amount < 0 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {formatCurrency(
              -transaction.amount,
              transaction.iso_currency_code
            )}
          </p>
        </div>
      </Card>
    </Link>
  );
}
