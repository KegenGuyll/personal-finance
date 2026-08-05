import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ReorderBudgetCategoriesInput {
  orderedNames: string[];
}

export function useReorderBudgetCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReorderBudgetCategoriesInput) => {
      const res = await fetch("/api/budget/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to reorder budget categories");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
    },
  });
}
