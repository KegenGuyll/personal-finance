import { useQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

/**
 * Manual ("temporary") transactions that are still awaiting a Plaid sync.
 *
 * A manual entry is deleted the moment it is linked to the synced transaction
 * it turned out to be, so every entry returned here still needs matching.
 */
export function useManualTransactions(accountIds: string[] = []) {
  return useQuery({
    queryKey: ["manual-transactions", accountIds.join(",")],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountIds.length > 0) {
        params.set("accountIds", accountIds.join(","));
      }
      const res = await fetch(`/api/transactions/manual?${params}`);
      if (!res.ok) throw new Error("Failed to fetch manual transactions");
      return res.json() as Promise<{ transactions: Transaction[] }>;
    },
    staleTime: 30_000,
  });
}
