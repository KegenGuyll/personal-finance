"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import PlaidLinkButton from "@/src/components/PlaidLinkButton";
import AccountCard from "@/src/components/AccountCard";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import SyncIndicator from "@/src/components/SyncIndicator";
import { useAppDispatch, useAppSelector } from "@/src/lib/hooks";
import { setAccounts, setLinked } from "@/src/features/plaid/plaidSlice";
import type { Account } from "@/src/features/plaid/plaidSlice";
import { usePlaidStatus } from "@/src/hooks/usePlaidStatus";
import { usePlaidAccounts } from "@/src/hooks/usePlaidAccounts";
import { useSyncAllTransactions } from "@/src/hooks/useSyncAllTransactions";

const TYPE_ORDER: Record<string, number> = {
  depository: 0,
  credit: 1,
  investment: 2,
  loan: 3,
};

function sortedAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  });
}

export default function Home() {
  const dispatch = useAppDispatch();
  const { isLinked, accounts, error } = useAppSelector((state) => state.plaid);

  const { data: statusData } = usePlaidStatus();

  useEffect(() => {
    if (statusData?.isLinked) {
      dispatch(setLinked());
    }
  }, [statusData, dispatch]);

  const { data, isLoading: isAccountsLoading } = usePlaidAccounts(isLinked);

  const {
    mutate: syncAll,
    isSyncing,
    currentItem,
    results,
    total,
    addedCount,
    lastSummary,
  } = useSyncAllTransactions();
  const syncTriggeredRef = useRef(false);

  useEffect(() => {
    if (isLinked && !syncTriggeredRef.current) {
      syncTriggeredRef.current = true;
      syncAll();
    }
  }, [isLinked, syncAll]);

  useEffect(() => {
    if (data?.accounts) {
      dispatch(setAccounts(data.accounts));
    }
  }, [data, dispatch]);

  const sorted = useMemo(() => sortedAccounts(accounts), [accounts]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Account[]>();
    for (const account of sorted) {
      const list = groups.get(account.type);
      if (list) {
        list.push(account);
      } else {
        groups.set(account.type, [account]);
      }
    }
    return groups;
  }, [sorted]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold text-space-indigo-800">
        Personal Finance
      </h1>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      <PlaidLinkButton />

      {isAccountsLoading && (
        <div className="w-full max-w-4xl">
          <LoadingSkeleton count={4} className="space-y-3" />
        </div>
      )}

      {sorted.length > 0 && (
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-space-indigo-700">
              Connected Accounts
            </h2>
            <div className="flex items-center gap-3">
              {(isSyncing || lastSummary) && (
                <SyncIndicator
                  isSyncing={isSyncing}
                  currentLabel={currentItem?.label ?? null}
                  results={results}
                  total={total}
                  addedCount={addedCount}
                  summary={lastSummary}
                />
              )}
              <Link
                href="/transactions"
                className="text-sm font-medium text-cornflower-blue-500 hover:text-cornflower-blue-600"
              >
                View all &rarr;
              </Link>
            </div>
          </div>
          {[...grouped].map(([type, groupedAccounts]) => (
            <div key={type}>
              <Link
                href={`/transactions?type=${type}`}
                className="group mb-3 flex items-center gap-2"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-space-indigo-400 group-hover:text-space-indigo-600 transition-colors">
                  {type}
                </span>
                <div className="h-px flex-1 bg-space-indigo-100 group-hover:bg-space-indigo-200 transition-colors" />
              </Link>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupedAccounts.map((account) => (
                  <AccountCard key={account.account_id} account={account} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
