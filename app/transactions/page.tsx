"use client";

import { useMemo, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppSelector } from "@/src/lib/hooks";
import { useAllTransactions } from "@/src/hooks/useAllTransactions";
import { useAllCategoryStats } from "@/src/hooks/useAllCategoryStats";
import TransactionList from "@/src/components/TransactionList";
import CategoryBreakdown from "@/src/components/CategoryBreakdown";
import SearchInput from "@/src/components/SearchInput";
import DateRangeFilter, { getStartDate } from "@/src/components/DateRangeFilter";
import BulkMarkIncomeModal from "@/src/components/BulkMarkIncomeModal";

const TYPE_OPTIONS = [
  { label: "All", value: "" },
  { label: "Depository", value: "depository" },
  { label: "Credit", value: "credit" },
  { label: "Investment", value: "investment" },
  { label: "Loan", value: "loan" },
] as const;

const TRANSACTION_TYPE_OPTIONS = [
  { label: "All Expenses", value: "" },
  { label: "Expenses", value: "expense" },
  { label: "Income", value: "income" },
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

function TransactionTypeTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("transactionType") ?? "";

  const handleSelect = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("transactionType", value);
    } else {
      params.delete("transactionType");
    }
    params.delete("category");
    router.replace(`/transactions?${params.toString()}`);
  };

  return (
    <div className="flex gap-1">
      {TRANSACTION_TYPE_OPTIONS.map(({ label, value }) => (
        <button
          key={label}
          onClick={() => handleSelect(value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            active === value || (!active && value === "")
              ? "bg-cornflower-blue-500 text-white"
              : "bg-cornflower-blue-50 text-cornflower-blue-600 hover:bg-cornflower-blue-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AllTransactionList({
  accountIds,
  onMarkIncomeStart,
}: {
  accountIds: string[];
  onMarkIncomeStart?: (name: string) => void;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const range = searchParams.get("range") ?? "";
  const urlStartDate = searchParams.get("startDate") ?? "";
  const urlEndDate = searchParams.get("endDate") ?? "";
  const urlTransactionType = searchParams.get("transactionType") ?? "";
  const startDate = urlStartDate || getStartDate(range);
  const markIncome = searchParams.get("markIncome") === "true";

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllTransactions(accountIds, query, category, startDate, urlEndDate || null, urlTransactionType || null);

  const transactions = data?.pages.flatMap((p) => p.transactions) ?? [];

  return (
    <TransactionList
      transactions={transactions}
      isLoading={isLoading}
      error={error}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      emptyMessage={
        query || category
          ? "No transactions match your filters."
          : "No transactions found."
      }
      showIncomeButtons={markIncome}
      onMarkIncomeStart={onMarkIncomeStart}
    />
  );
}

function CategoryStats({
  accountIds,
}: {
  accountIds: string[];
}) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "";
  const urlStartDate = searchParams.get("startDate") ?? "";
  const urlTransactionType = searchParams.get("transactionType") ?? "";
  const startDate = urlStartDate || getStartDate(range);
  const selectedCategory = searchParams.get("category") ?? null;
  const router = useRouter();

  const { data, isLoading } = useAllCategoryStats(
    accountIds,
    startDate,
    urlTransactionType || null
  );

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
  const markIncome = searchParams.get("markIncome") === "true";
  const range = searchParams.get("range") ?? "";
  const urlStartDate = searchParams.get("startDate") ?? "";
  const router = useRouter();

  const [markIncomeModalName, setMarkIncomeModalName] = useState<string | null>(null);

  useEffect(() => {
    if (markIncome && !range && !urlStartDate) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const lastOfMonth = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", firstOfMonth);
      params.set("endDate", lastOfMonth);
      router.replace(`/transactions?${params.toString()}`, { scroll: false });
    }
  }, [markIncome, range, urlStartDate, router, searchParams]);

  const filteredAccounts = useMemo(() => {
    if (!activeType) return accounts;
    return accounts.filter((a) => a.type === activeType);
  }, [accounts, activeType]);

  const accountIds = useMemo(
    () => filteredAccounts.map((a) => a.account_id),
    [filteredAccounts]
  );

  const handleExitMarkIncome = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("markIncome");
    params.delete("range");
    params.delete("startDate");
    params.delete("endDate");
    params.delete("transactionType");
    router.replace(`/transactions?${params.toString()}`);
  };

  return (
    <>
      {markIncome && (
        <div className="rounded-lg border border-cornflower-blue-200 bg-cornflower-blue-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-cornflower-blue-800">
                Mark Income Transactions
              </p>
              <p className="text-xs text-cornflower-blue-600">
                Click <span className="font-medium">Income?</span> on deposits and paychecks. These will be auto-detected from now on.
              </p>
            </div>
            <button
              onClick={handleExitMarkIncome}
              className="shrink-0 rounded-lg bg-cornflower-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cornflower-blue-600"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <AccountTypeTabs />
      <TransactionTypeTabs />
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
            <AllTransactionList
              accountIds={accountIds}
              onMarkIncomeStart={(name) => setMarkIncomeModalName(name)}
            />
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

      {markIncomeModalName && (
        <BulkMarkIncomeModal
          transactionName={markIncomeModalName}
          onClose={() => setMarkIncomeModalName(null)}
        />
      )}
    </>
  );
}
