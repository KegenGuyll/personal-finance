import { useQuery } from "@tanstack/react-query";
import type { BudgetHealth } from "@/src/types/budget";

export function useBudgetHealth(month: string) {
  return useQuery({
    queryKey: ["budget-health", month],
    queryFn: async () => {
      const res = await fetch(`/api/budget/health?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch budget health");
      return res.json() as Promise<BudgetHealth>;
    },
    staleTime: 60_000,
  });
}
