"use client";

import { useEffect } from "react";
import Link from "next/link";

import type { Transaction } from "@/src/features/plaid/plaidSlice";
import Button from "@/src/components/ui/Button";
import { formatCurrency } from "@/src/utils/currency";

/**
 * Confirms what a manual entry actually saved.
 *
 * Closing the modal silently would leave the user with no confirmation of what was
 * recorded and no obvious way to check. The value is echoed back with a link to the
 * entry, and the notice clears itself so it does not become permanent furniture —
 * the same reasoning as `ManualEntriesBanner` for rendering nothing when it has
 * nothing to say.
 */
export default function SavedTransactionNotice({
  transaction,
  onDismiss,
}: {
  transaction: Transaction | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!transaction) return;

    const timer = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(timer);
  }, [transaction, onDismiss]);

  if (!transaction) return null;

  const isIncome = transaction.transaction_type === "income" || transaction.amount < 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-space-indigo-100 bg-space-indigo-50 px-4 py-3">
      <p className="min-w-0 text-xs text-space-indigo-700">
        Added{" "}
        <span className="font-medium">
          {formatCurrency(Math.abs(transaction.amount), transaction.iso_currency_code)}
        </span>{" "}
        {isIncome ? "income from" : "at"}{" "}
        <span className="font-medium">{transaction.name}</span>{" "}
        <span className="text-space-indigo-400">
          on {transaction.date}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/accounts/${transaction.account_id}/transactions/${transaction.transaction_id}`}
          className="text-xs font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700"
        >
          View
        </Link>
        <Button
          variant="bare"
          size="none"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-space-indigo-400 hover:text-space-indigo-600"
        >
          &times;
        </Button>
      </div>
    </div>
  );
}
