import { useQuery } from "@tanstack/react-query";

export interface NameStat {
  name: string;
  total: number;
  count: number;
}

interface CategoryNameStatsResponse {
  names: NameStat[];
  grandTotal: number;
}

export function useCategoryNameStats(
  accountIds: string[],
  category: string,
  startDate: string | null,
  endDate: string | null = null,
  transactionType: string | null = null
) {
  return useQuery({
    queryKey: [
      "category-name-stats",
      accountIds.join(","),
      category,
      startDate,
      endDate,
      transactionType,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountIds.length > 0) params.set("accountIds", accountIds.join(","));
      if (category) params.set("category", category);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (transactionType) params.set("transactionType", transactionType);
      const res = await fetch(`/api/plaid/transactions/name-stats?${params}`);
      if (!res.ok) throw new Error("Failed to fetch category name stats");
      return res.json() as Promise<CategoryNameStatsResponse>;
    },
    enabled: accountIds.length > 0 && !!category,
    staleTime: 60_000,
  });
}
