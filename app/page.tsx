"use client";

import { useEffect, useMemo } from "react";
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
import { usePlaidSync } from "@/src/hooks/usePlaidSync";

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
  const { data: syncData, isFetching: isSyncing } = usePlaidSync(isLinked);

  useEffect(() => {
    if (data?.accounts) {
      dispatch(setAccounts(data.accounts));
    }
  }, [data, dispatch]);

  const sorted = useMemo(() => sortedAccounts(accounts), [accounts]);

  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; itemId?: string; accounts: Account[] }
    >();
    for (const account of sorted) {
      const key = account.itemId ?? account.institutionName ?? "Linked accounts";
      const entry = groups.get(key);
      if (entry) {
        entry.accounts.push(account);
      } else {
        groups.set(key, {
          label: account.institutionName ?? key,
          itemId: account.itemId,
          accounts: [account],
        });
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
              {(isSyncing || syncData) && (
                <SyncIndicator isSyncing={isSyncing} data={syncData} />
              )}
              <Link
                href="/transactions"
                className="text-sm font-medium text-cornflower-blue-500 hover:text-cornflower-blue-600"
              >
                View all &rarr;
              </Link>
            </div>
          </div>
          {[...grouped].map(([key, group]) => (
            <div key={key}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-space-indigo-400">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-space-indigo-100" />
                {group.itemId && (
                  <PlaidLinkButton
                    mode="update"
                    itemId={group.itemId}
                    label="Add accounts"
                    className="rounded-md border border-space-indigo-200 px-3 py-1 text-xs font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50 disabled:opacity-50"
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.accounts.map((account) => (
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
