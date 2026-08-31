"use client";

import { use, Suspense } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppSelector } from "@/src/lib/hooks";
import { useAccount } from "@/src/hooks/useAccount";
import { formatCurrency } from "@/src/utils/currency";
import { useAccountTransactions } from "@/src/hooks/useAccountTransactions";
import { useCategoryStats } from "@/src/hooks/useCategoryStats";
import { useCategoryNameStats } from "@/src/hooks/useCategoryNameStats";
import { useSpendingTrend } from "@/src/hooks/useSpendingTrend";
import TransactionList from "@/src/components/TransactionList";
import CategoryBreakdown from "@/src/components/CategoryBreakdown";
import CategoryNameBreakdown from "@/src/components/CategoryNameBreakdown";
import SpendingTrend from "@/src/components/SpendingTrend";
import ChartCarousel from "@/src/components/ChartCarousel";
import SearchInput from "@/src/components/SearchInput";
import DateRangeFilter, { getStartDate } from "@/src/components/DateRangeFilter";
import BackButton from "@/src/components/BackButton";

function AccountTransactionList({
  accountId,
}: {
  accountId: string;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const range = searchParams.get("range") ?? "";
  const urlStartDate = searchParams.get("startDate") ?? "";
  const urlEndDate = searchParams.get("endDate") ?? "";
  const dateFilter = searchParams.get("date") ?? "";

  const startDate = dateFilter || urlStartDate || getStartDate(range);
  const endDate = dateFilter || urlEndDate || null;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAccountTransactions(accountId, query, category, startDate, endDate);

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
          : "No transactions found for this account."
      }
    />
  );
}

function CategoryStats({ accountId }: { accountId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category") ?? null;
  const range = searchParams.get("range") ?? "";
  const urlStartDate = searchParams.get("startDate") ?? "";
  const urlEndDate = searchParams.get("endDate") ?? "";
  const dateFilter = searchParams.get("date") ?? "";

  const startDate = dateFilter || urlStartDate || getStartDate(range);
  const endDate = dateFilter || urlEndDate || null;

  const { data, isLoading } = useCategoryStats(
    accountId,
    startDate,
    endDate
  );

  const { data: nameData, isLoading: nameLoading } = useCategoryNameStats(
    [accountId],
    selectedCategory ?? "",
    startDate,
    endDate
  );

  const { data: trendData, isLoading: trendLoading } = useSpendingTrend(
    [accountId],
    selectedCategory ?? "",
    startDate,
    endDate
  );

  const handleSelect = (category: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    router.replace(`?${params.toString()}`);
  };

  const handleDateClick = (date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    router.replace(`?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
    );
  }

  if (!data || data.categories.length === 0) return null;

  const chartSkeleton = (
    <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
  );

  const slides: ReactNode[] = [
    <CategoryBreakdown
      key="category"
      categories={data.categories}
      grandTotal={data.grandTotal}
      selectedCategory={selectedCategory}
      onSelect={handleSelect}
    />,
  ];

  if (selectedCategory) {
    if (nameLoading) {
      slides.push(<div key="name-loading">{chartSkeleton}</div>);
    } else if (nameData && nameData.names.length > 0) {
      slides.push(
        <CategoryNameBreakdown
          key="name"
          names={nameData.names}
          grandTotal={nameData.grandTotal}
        />
      );
    }
  }

  if (trendLoading) {
    slides.push(<div key="trend-loading">{chartSkeleton}</div>);
  } else if (trendData && trendData.points.length >= 2) {
    slides.push(
      <SpendingTrend
        key="trend"
        points={trendData.points}
        className=""
        onPointClick={handleDateClick}
      />
    );
  }

  return (
    <div>
      {selectedCategory && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-space-indigo-400">
            Filtering by:
          </span>
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
      <ChartCarousel slides={slides} />
    </div>
  );
}

export default function AccountView({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = use(params);
  const reduxAccount = useAppSelector((state) =>
    state.plaid.accounts.find((a) => a.account_id === accountId)
  );

  const { data: accountData, isLoading: isAccountLoading } =
    useAccount(accountId);

  const account = reduxAccount ?? accountData?.account;

  if (!account) {
    if (isAccountLoading) {
      return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/4 rounded bg-space-indigo-100" />
            <div className="h-6 w-2/3 rounded bg-space-indigo-100" />
            <div className="h-4 w-1/3 rounded bg-space-indigo-50" />
          </div>
        </main>
      );
    }
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="text-lg font-medium text-space-indigo-700">
            Account not found
          </p>
          <BackButton
            fallbackHref="/"
            label="Back to accounts"
            className="mt-3 inline-block text-sm text-cornflower-blue-500 hover:text-cornflower-blue-600"
          />
        </div>
      </main>
    );
  }

  const displayName = account.type === "credit"
    ? account.official_name ?? account.name
    : account.name;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <BackButton fallbackHref="/" label="Back" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-space-indigo-800">
          {displayName}
        </h1>
        <p className="text-sm text-space-indigo-400">
          {account.mask && <>···{account.mask} · </>}
          {account.subtype}
        </p>
        <p
          className={`mt-2 text-2xl font-bold ${
            account.type === "credit"
              ? "text-red-500"
              : "text-space-indigo-600"
          }`}
        >
          {account.type === "credit"
            ? formatCurrency(
                -account.balances.current,
                account.balances.iso_currency_code
              )
            : formatCurrency(
                account.balances.current,
                account.balances.iso_currency_code
              )}
        </p>
      </div>

      <Suspense fallback={null}>
        <SearchInput />
      </Suspense>

      <Suspense fallback={null}>
        <DateRangeFilter />
      </Suspense>

      <Suspense
        fallback={
          <div className="h-60 animate-pulse rounded-lg border border-space-indigo-100 bg-white" />
        }
      >
        <CategoryStats accountId={accountId} />
      </Suspense>

      <Suspense fallback={null}>
        <AccountTransactionList accountId={accountId} />
      </Suspense>
    </main>
  );
}
