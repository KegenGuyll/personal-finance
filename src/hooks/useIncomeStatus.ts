import { useQuery } from "@tanstack/react-query";

interface IncomeStatusResponse {
  hasIncome: boolean;
  count: number;
}

export function useIncomeStatus(month: string) {
  return useQuery({
    queryKey: ["income-status", month],
    queryFn: async () => {
      const res = await fetch(`/api/income/status?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch income status");
      return res.json() as Promise<IncomeStatusResponse>;
    },
    staleTime: 60_000,
  });
}
