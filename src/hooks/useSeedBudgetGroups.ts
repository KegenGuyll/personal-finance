import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSeedBudgetGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/budget/groups/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed budget groups");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-groups"] });
    },
  });
}
