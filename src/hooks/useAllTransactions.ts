import { useInfiniteQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

interface TransactionsResponse {
  transactions: Transaction[];
  hasNext: boolean;
  nextOffset: number | null;
}

export function useAllTransactions(
  accountIds: string[],
  query: string,
  category: string,
  startDate: string | null
) {
  return useInfiniteQuery({
    queryKey: [
      "all-transactions",
      accountIds.join(","),
      query,
      category,
      startDate,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (accountIds.length > 0) params.set("accountIds", accountIds.join(","));
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (startDate) params.set("startDate", startDate);
      if (pageParam) params.set("offset", String(pageParam));
      const res = await fetch(`/api/plaid/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json() as Promise<TransactionsResponse>;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled: accountIds.length > 0,
    staleTime: 60_000,
  });
}
