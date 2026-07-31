"use client";

import { useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppSelector } from "@/src/lib/hooks";
import { useAllTransactions } from "@/src/hooks/useAllTransactions";
import { useAllCategoryStats } from "@/src/hooks/useAllCategoryStats";
import TransactionItem from "@/src/components/TransactionItem";
import CategoryBreakdown from "@/src/components/CategoryBreakdown";
import SearchInput from "@/src/components/SearchInput";
import DateRangeFilter, { getStartDate } from "@/src/components/DateRangeFilter";

const TYPE_OPTIONS = [
  { label: "All", value: "" },
  { label: "Depository", value: "depository" },
  { label: "Credit", value: "credit" },
  { label: "Investment", value: "investment" },
  { label: "Loan", value: "loan" },
] as const;

function AccountTypeTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("type") ?? "";

  const handleSelect = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("type", value);
    } else {
      params.delete("type");
    }
    params.delete("category");
    router.replace(`/transactions?${params.toString()}`);
  };

  return (
    <div className="flex gap-1">
      {TYPE_OPTIONS.map(({ label, value }) => (
        <button
          key={label}
          onClick={() => handleSelect(value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            active === value
              ? "bg-space-indigo-600 text-white"
              : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TransactionList({
  accountIds,
}: {
  accountIds: string[];
}) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const range = searchParams.get("range") ?? "";
  const startDate = getStartDate(range);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllTransactions(accountIds, query, category, startDate);

  const transactions = data?.pages.flatMap((p) => p.transactions) ?? [];

  if (isLoading) {
    return (
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
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

  if (error) {
    return (
      <p className="mt-6 text-sm text-red-500">
        Failed to load transactions.
      </p>
    );
  }

  if (transactions.length === 0) {
    return (
      <p className="mt-6 text-sm text-space-indigo-400">
        {query || category
          ? "No transactions match your filters."
          : "No transactions found."}
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {transactions.map((txn) => (
        <TransactionItem key={txn.transaction_id} transaction={txn} />
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-lg border border-space-indigo-200 bg-white py-2.5 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

function CategoryStats({
  accountIds,
}: {
  accountIds: string[];
}) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "";
  const startDate = getStartDate(range);
  const selectedCategory = searchParams.get("category") ?? null;
  const router = useRouter();

  const { data, isLoading } = useAllCategoryStats(accountIds, startDate);

  const handleSelect = (category: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    router.replace(`/transactions?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
    );
  }

  if (!data || data.categories.length === 0) return null;

  return (
    <div>
      {selectedCategory && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-space-indigo-400">Filtering by:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-space-indigo-100 px-2.5 py-0.5 text-xs font-medium text-space-indigo-700">
            {selectedCategory}
            <button
              onClick={() => handleSelect(null)}
              className="ml-0.5 text-space-indigo-400 hover:text-space-indigo-600"
            >
              &times;
            </button>
          </span>
        </div>
      )}
      <CategoryBreakdown
        categories={data.categories}
        grandTotal={data.grandTotal}
        selectedCategory={selectedCategory}
        onSelect={handleSelect}
      />
    </div>
  );
}

export default function AllTransactionsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-8">
      <div>
        <Link
          href="/"
          className="text-sm text-cornflower-blue-500 hover:text-cornflower-blue-600"
        >
          &larr; Back to accounts
        </Link>
        <h1 className="mt-2 text-xl font-bold text-space-indigo-800">
          All Transactions
        </h1>
      </div>

      <Suspense fallback={null}>
        <AllTransactionsContent />
      </Suspense>
    </main>
  );
}

function AllTransactionsContent() {
  const { accounts, accountsLoaded } = useAppSelector((state) => state.plaid);
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") ?? "";

  const filteredAccounts = useMemo(() => {
    if (!activeType) return accounts;
    return accounts.filter((a) => a.type === activeType);
  }, [accounts, activeType]);

  const accountIds = useMemo(
    () => filteredAccounts.map((a) => a.account_id),
    [filteredAccounts]
  );

  return (
    <>
      <AccountTypeTabs />
      <SearchInput />
      <DateRangeFilter />

      {accountIds.length > 0 && (
        <>
          <Suspense
            fallback={
              <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
            }
          >
            <CategoryStats accountIds={accountIds} />
          </Suspense>
          <Suspense fallback={null}>
            <TransactionList accountIds={accountIds} />
          </Suspense>
        </>
      )}

      {accountIds.length === 0 && accountsLoaded && (
        <p className="text-sm text-space-indigo-400">
          No accounts linked yet.
        </p>
      )}

      {accountIds.length === 0 && !accountsLoaded && (
        <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
      )}
    </>
  );
}
