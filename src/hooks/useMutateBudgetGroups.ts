import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BudgetGroup } from "@/src/types/budget";

interface UpdateGroupsInput {
  groups: {
    _id: string;
    name?: string;
    percentage?: number;
    categories?: string[];
  }[];
}

export function useMutateBudgetGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateGroupsInput) => {
      const res = await fetch("/api/budget/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update budget groups");
      return res.json() as Promise<{ groups: BudgetGroup[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-groups"] });
    },
  });
}
