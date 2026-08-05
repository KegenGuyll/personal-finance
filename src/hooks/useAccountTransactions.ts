import { useInfiniteQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

interface TransactionsResponse {
  transactions: Transaction[];
  hasNext: boolean;
  nextOffset: number | null;
}

export function useAccountTransactions(
  accountId: string,
  query: string,
  category: string,
  startDate: string | null,
  endDate: string | null = null
) {
  return useInfiniteQuery({
    queryKey: [
      "account-transactions",
      accountId,
      query,
      category,
      startDate,
      endDate,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (pageParam) params.set("offset", String(pageParam));
      const res = await fetch(
        `/api/plaid/accounts/${accountId}/transactions?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json() as Promise<TransactionsResponse>;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled: !!accountId,
    staleTime: 60_000,
  });
}
