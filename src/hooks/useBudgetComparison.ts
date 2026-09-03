import { useQuery } from "@tanstack/react-query";
import type { BudgetComparison } from "@/src/types/budget";

export function useBudgetComparison(months: string[]) {
  return useQuery({
    queryKey: ["budget-comparison", months.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/budget/comparison?months=${months.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch budget comparison");
      return res.json() as Promise<BudgetComparison>;
    },
    enabled: months.length > 1,
    staleTime: 60_000,
  });
}
