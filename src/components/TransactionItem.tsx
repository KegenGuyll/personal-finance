import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import Link from "next/link";

export default function TransactionItem({
  transaction,
}: {
  transaction: Transaction;
}) {
  return (
    <Link
      href={`/accounts/${transaction.account_id}/transactions/${transaction.transaction_id}`}
      className="block transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between rounded-lg border border-space-indigo-100 bg-white px-4 py-3 shadow-sm">
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
        <p
          className={`ml-3 whitespace-nowrap text-sm font-semibold ${
            transaction.amount < 0 ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {formatCurrency(
            -transaction.amount,
            transaction.iso_currency_code
          )}
        </p>
      </div>
    </Link>
  );
}
