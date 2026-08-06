import { useMutation, useQueryClient } from "@tanstack/react-query";

interface MutateBudgetCategoryInput {
  name: string;
  isBudgeted: boolean;
}

export function useMutateBudgetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MutateBudgetCategoryInput) => {
      const res = await fetch("/api/budget/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update budget category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
    },
  });
}
