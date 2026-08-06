import { useQuery } from "@tanstack/react-query";
import type { BudgetSummary } from "@/src/types/budget";

export function useBudgetSummary(month: string) {
  return useQuery({
    queryKey: ["budget-summary", month],
    queryFn: async () => {
      const res = await fetch(`/api/budget/summary?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch budget summary");
      return res.json() as Promise<BudgetSummary>;
    },
    staleTime: 60_000,
  });
}
