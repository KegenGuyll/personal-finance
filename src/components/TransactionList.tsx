"use client";

import TransactionItem from "@/src/components/TransactionItem";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

interface TransactionListProps {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  emptyMessage?: string;
}

export default function TransactionList({
  transactions,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  emptyMessage = "No transactions found.",
}: TransactionListProps) {
  if (isLoading) {
    return <LoadingSkeleton count={5} className="mt-6 space-y-2" />;
  }

  if (error) {
    return (
      <p className="mt-6 text-sm text-red-500">
        Failed to load transactions.
      </p>
    );
  }

  if (transactions.length === 0) {
    return (
      <p className="mt-6 text-sm text-space-indigo-400">{emptyMessage}</p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {transactions.map((txn) => (
        <TransactionItem key={txn.transaction_id} transaction={txn} />
      ))}
      {hasNextPage && (
        <button
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="w-full rounded-lg border border-space-indigo-200 bg-white py-2.5 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
