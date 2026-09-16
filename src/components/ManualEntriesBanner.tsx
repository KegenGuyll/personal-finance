"use client";

import Link from "next/link";
import { useManualTransactions } from "@/src/hooks/useManualTransactions";
import { describeAge } from "@/src/lib/manual-transactions";

/**
 * Nudges the user to match the temporary transactions they added before Plaid
 * synced them. Hidden entirely when there is nothing waiting.
 */
export default function ManualEntriesBanner() {
  const { data, isLoading } = useManualTransactions();
  const entries = data?.transactions ?? [];

  if (isLoading || entries.length === 0) return null;

  const oldest = entries.reduce<string | null>((earliest, entry) => {
    if (!entry.createdAt) return earliest;
    if (!earliest) return entry.createdAt;
    return entry.createdAt < earliest ? entry.createdAt : earliest;
  }, null);

  const label = entries.length === 1 ? "1 manual entry" : `${entries.length} manual entries`;

  return (
    <Link
      href="/transactions?manual=1"
      className="flex w-full max-w-4xl items-center justify-between gap-3 rounded-lg border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-4 py-3 transition-colors hover:bg-soft-periwinkle-100"
    >
      <span className="text-sm text-soft-periwinkle-800">
        <span className="font-semibold">{label}</span> awaiting a Plaid sync
        {oldest ? ` · oldest ${describeAge(oldest)}` : ""}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-soft-periwinkle-700">
        Review &rarr;
      </span>
    </Link>
  );
}
