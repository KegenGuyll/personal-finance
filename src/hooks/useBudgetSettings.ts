import { useQuery } from "@tanstack/react-query";

interface BudgetSettingsResponse {
  expectedIncome: number;
}

export function useBudgetSettings(month: string) {
  return useQuery({
    queryKey: ["budget-settings", month],
    queryFn: async () => {
      const res = await fetch(`/api/budget/settings?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch budget settings");
      return res.json() as Promise<BudgetSettingsResponse>;
    },
    staleTime: 60_000,
  });
}
