import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UpsertBudgetInput {
  month: string;
  budgets: { groupId: string; category: string; plannedAmount: number }[];
  applyToFutureMonths?: boolean;
}

export function useMutateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertBudgetInput) => {
      const res = await fetch("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update budgets");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["budget", variables.month] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget-comparison"] });
    },
  });
}
