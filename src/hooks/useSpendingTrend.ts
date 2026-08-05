import { useQuery } from "@tanstack/react-query";

export interface TrendPoint {
  date: string;
  total: number;
}

interface SpendingTrendResponse {
  points: TrendPoint[];
}

export function useSpendingTrend(
  accountIds: string[],
  category: string,
  startDate: string | null,
  endDate: string | null = null,
  transactionType: string | null = null
) {
  return useQuery({
    queryKey: [
      "spending-trend",
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
      const res = await fetch(`/api/plaid/transactions/spending-trend?${params}`);
      if (!res.ok) throw new Error("Failed to fetch spending trend");
      return res.json() as Promise<SpendingTrendResponse>;
    },
    enabled: accountIds.length > 0,
    staleTime: 60_000,
  });
}
