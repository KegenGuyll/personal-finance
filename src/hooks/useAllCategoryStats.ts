import { useQuery } from "@tanstack/react-query";
import type { CategoryStat } from "./useCategoryStats";

interface CategoryStatsResponse {
  categories: CategoryStat[];
  grandTotal: number;
}

export function useAllCategoryStats(
  accountIds: string[],
  startDate: string | null
) {
  return useQuery({
    queryKey: ["all-category-stats", accountIds.join(","), startDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountIds.length > 0) params.set("accountIds", accountIds.join(","));
      if (startDate) params.set("startDate", startDate);
      const res = await fetch(`/api/plaid/transactions/stats?${params}`);
      if (!res.ok) throw new Error("Failed to fetch category stats");
      return res.json() as Promise<CategoryStatsResponse>;
    },
    enabled: accountIds.length > 0,
    staleTime: 60_000,
  });
}
