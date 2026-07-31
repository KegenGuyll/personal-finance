import { useQuery } from "@tanstack/react-query";
import type { BudgetGroup } from "@/src/types/budget";

interface BudgetGroupsResponse {
  groups: BudgetGroup[];
}

export function useBudgetGroups() {
  return useQuery({
    queryKey: ["budget-groups"],
    queryFn: async () => {
      const res = await fetch("/api/budget/groups");
      if (!res.ok) throw new Error("Failed to fetch budget groups");
      return res.json() as Promise<BudgetGroupsResponse>;
    },
    staleTime: 5 * 60_000,
  });
}
