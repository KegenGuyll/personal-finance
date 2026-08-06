import { useQuery } from "@tanstack/react-query";
import type { Budget } from "@/src/types/budget";

interface BudgetsResponse {
  budgets: Budget[];
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ["budget", month],
    queryFn: async () => {
      const res = await fetch(`/api/budget?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return res.json() as Promise<BudgetsResponse>;
    },
    staleTime: 60_000,
  });
}
