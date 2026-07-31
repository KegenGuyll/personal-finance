import { useQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

export function useRelatedTransactions(
  accountId: string,
  name: string,
) {
  return useQuery({
    queryKey: [
      "related-transactions",
      accountId,
      name,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", name);
      params.set("limit", "500");
      const res = await fetch(
        `/api/plaid/accounts/${accountId}/transactions?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch related transactions");
      return res.json() as Promise<{ transactions: Transaction[] }>;
    },
    enabled: !!accountId && !!name,
  });
}
