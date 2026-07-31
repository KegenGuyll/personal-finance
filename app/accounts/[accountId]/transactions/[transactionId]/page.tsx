"use client";

import { use } from "react";
import Link from "next/link";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import { useAppSelector } from "@/src/lib/hooks";
import { useAccount } from "@/src/hooks/useAccount";
import { useTransaction } from "@/src/hooks/useTransaction";
import { useRelatedTransactions } from "@/src/hooks/useRelatedTransactions";
import TransactionItem from "@/src/components/TransactionItem";
import SpendingTrend from "@/src/components/SpendingTrend";
import CategoryEditor from "@/src/components/CategoryEditor";

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ accountId: string; transactionId: string }>;
}) {
  const { accountId, transactionId } = use(params);

  const reduxAccount = useAppSelector((state) =>
    state.plaid.accounts.find((a) => a.account_id === accountId)
  );

  const { data: accountData } = useAccount(accountId);

  const account = reduxAccount ?? accountData?.account;

  const { data, isLoading, error } = useTransaction(transactionId);

  const transaction = data?.transaction;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-8">
      <div>
        <Link
          href={`/accounts/${accountId}`}
          className="text-sm text-cornflower-blue-500 hover:text-cornflower-blue-600"
        >
          &larr; Back to transactions
        </Link>
        {account && (
          <p className="mt-1 text-sm text-space-indigo-400">
            {account.name}
            {account.mask && <> ····{account.mask}</>}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-2/3 rounded bg-space-indigo-100" />
          <div className="h-4 w-1/3 rounded bg-space-indigo-50" />
          <div className="h-4 w-1/2 rounded bg-space-indigo-50" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500">Failed to load transaction.</p>
      )}

      {transaction && (
        <div className="rounded-lg border border-space-indigo-100 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-space-indigo-800">
            {transaction.name}
          </h1>

          {transaction.merchant_name && (
            <p className="mt-1 text-sm text-space-indigo-400">
              {transaction.merchant_name}
            </p>
          )}

          <p
            className={`mt-4 text-3xl font-bold ${
              transaction.amount < 0
                ? "text-emerald-600"
                : "text-red-500"
            }`}
          >
            {formatCurrency(
              -transaction.amount,
              transaction.iso_currency_code
            )}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-space-indigo-100 pt-4">
            <div>
              <dt className="text-xs font-medium text-space-indigo-400">
                Date
              </dt>
              <dd className="text-sm text-space-indigo-800">
                {formatDate(transaction.date)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-space-indigo-400">
                Status
              </dt>
              <dd className="text-sm text-space-indigo-800">
                {transaction.pending ? "Pending" : "Posted"}
              </dd>
            </div>

            {account && (
              <div>
                <dt className="text-xs font-medium text-space-indigo-400">
                  Account
                </dt>
                <dd className="text-sm text-space-indigo-800">
                  {account.name}
                  {account.mask && <> ····{account.mask}</>}
                </dd>
              </div>
            )}

            {transaction.payment_channel && (
              <div>
                <dt className="text-xs font-medium text-space-indigo-400">
                  Payment channel
                </dt>
                <dd className="text-sm capitalize text-space-indigo-800">
                  {transaction.payment_channel}
                </dd>
              </div>
            )}

            {transaction.category &&
              transaction.category.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-space-indigo-400">
                    Category
                  </dt>
                  <dd className="flex items-center gap-2 text-sm text-space-indigo-800">
                    <span>{transaction.category.join(" · ")}</span>
                    <CategoryEditor
                      transactionId={transactionId}
                      accountId={accountId}
                      currentCategory={transaction.category}
                      transactionName={transaction.name}
                    />
                  </dd>
                </div>
              )}

            {(!transaction.category ||
              transaction.category.length === 0) && (
              <div>
                <dt className="text-xs font-medium text-space-indigo-400">
                  Category
                </dt>
                <dd className="text-sm">
                  <CategoryEditor
                    transactionId={transactionId}
                    accountId={accountId}
                    currentCategory={null}
                    transactionName={transaction.name}
                  />
                </dd>
              </div>
            )}

            {transaction.authorized_date && (
              <div>
                <dt className="text-xs font-medium text-space-indigo-400">
                  Authorized date
                </dt>
                <dd className="text-sm text-space-indigo-800">
                  {formatDate(transaction.authorized_date)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {transaction && (
        <RelatedTransactions
          accountId={accountId}
          name={transaction.name}
          excludeTransactionId={transactionId}
        />
      )}
    </main>
  );
}

function RelatedTransactions({
  accountId,
  name,
  excludeTransactionId,
}: {
  accountId: string;
  name: string;
  excludeTransactionId: string;
}) {
  const { data, isLoading } = useRelatedTransactions(
    accountId,
    name
  );

  const allTransactions = data?.transactions ?? [];
  const transactions = allTransactions.filter(
    (t) => t.transaction_id !== excludeTransactionId
  );

  if (isLoading) {
    return (
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-space-indigo-100 bg-white px-4 py-3"
          >
            <div className="mb-2 h-4 w-3/4 rounded bg-space-indigo-100" />
            <div className="h-3 w-1/4 rounded bg-space-indigo-50" />
          </div>
        ))}
      </div>
    );
  }

  if (allTransactions.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-space-indigo-700">
        Past Transactions
      </h2>
      <p className="mt-1 text-sm font-medium text-space-indigo-400">
        Total:{" "}
        {(() => {
          const total = allTransactions.reduce(
            (sum, txn) => sum + -txn.amount,
            0
          );

          const earliest = allTransactions
            .map((t) => new Date(`${t.date}T12:00:00`))
            .reduce((a, b) => (a < b ? a : b));

          const now = new Date();
          const months =
            (now.getFullYear() - earliest.getFullYear()) * 12 +
            (now.getMonth() - earliest.getMonth());

          const rangeLabel =
            months < 1
              ? "this month"
              : `w/in ${months} month${months > 1 ? "s" : ""}`;

          return (
            <span>
              <span
                className={
                  total < 0 ? "text-red-500" : "text-emerald-600"
                }
              >
                {formatCurrency(
                  total,
                  allTransactions[0]?.iso_currency_code
                )}
              </span>{" "}
              {rangeLabel}
            </span>
          );
        })()}
      </p>
      <SpendingTrend transactions={allTransactions} />
      <div className="mt-3 space-y-2">
        {transactions.map((txn) => (
          <TransactionItem key={txn.transaction_id} transaction={txn} />
        ))}
      </div>
    </div>
  );
}
