import { useQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

interface TransactionsByNameResponse {
  transactions: Transaction[];
}

export function useTransactionsByName(
  name: string,
  startDate: string | null,
  endDate: string | null,
  accountIds: string[],
  enabled: boolean
) {
  return useQuery({
    queryKey: ["transactions-by-name", name, startDate, endDate, accountIds.join(",")],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("name", name);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (accountIds.length > 0) params.set("accountIds", accountIds.join(","));
      const res = await fetch(`/api/transactions/by-name?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json() as Promise<TransactionsByNameResponse>;
    },
    enabled: enabled && !!name,
    staleTime: 30_000,
  });
}
