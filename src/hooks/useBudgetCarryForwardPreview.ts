import { useQuery } from "@tanstack/react-query";
import type { CarryForwardPreview } from "@/src/types/budget";

interface UseBudgetCarryForwardPreviewParams {
  month: string;
  category: string;
  plannedAmount: number;
  enabled: boolean;
}

export function useBudgetCarryForwardPreview({
  month,
  category,
  plannedAmount,
  enabled,
}: UseBudgetCarryForwardPreviewParams) {
  return useQuery({
    queryKey: ["budget-carry-forward-preview", month, category, plannedAmount],
    queryFn: async () => {
      const params = new URLSearchParams({
        month,
        category,
        plannedAmount: String(plannedAmount),
      });
      const res = await fetch(`/api/budget/carry-forward-preview?${params}`);
      if (!res.ok) throw new Error("Failed to fetch carry-forward preview");
      return res.json() as Promise<CarryForwardPreview>;
    },
    enabled,
    staleTime: 0,
  });
}
