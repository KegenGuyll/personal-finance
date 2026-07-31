import { useQuery } from "@tanstack/react-query";

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
}

interface CategoryStatsResponse {
  categories: CategoryStat[];
  grandTotal: number;
}

export function useCategoryStats(accountId: string, startDate: string | null) {
  return useQuery({
    queryKey: ["category-stats", accountId, startDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      const res = await fetch(
        `/api/plaid/accounts/${accountId}/transactions/stats?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch category stats");
      return res.json() as Promise<CategoryStatsResponse>;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}
