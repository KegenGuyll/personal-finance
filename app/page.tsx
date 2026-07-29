"use client";

import { useEffect, useMemo } from "react";
import PlaidLinkButton from "@/src/components/PlaidLinkButton";
import AccountCard from "@/src/components/AccountCard";
import { useAppDispatch, useAppSelector } from "@/src/lib/hooks";
import { setAccounts, setLinked } from "@/src/features/plaid/plaidSlice";
import type { Account } from "@/src/features/plaid/plaidSlice";
import { usePlaidStatus } from "@/src/hooks/usePlaidStatus";
import { usePlaidAccounts } from "@/src/hooks/usePlaidAccounts";

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

  const { data } = usePlaidAccounts(isLinked);

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

      {sorted.length > 0 && (
        <div className="w-full max-w-4xl space-y-6">
          <h2 className="text-xl font-semibold text-space-indigo-700">
            Connected Accounts
          </h2>
          {[...grouped].map(([type, groupedAccounts]) => (
            <div key={type}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-space-indigo-400">
                  {type}
                </span>
                <div className="h-px flex-1 bg-space-indigo-100" />
              </div>
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
