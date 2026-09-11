import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useUnassignTransactionGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: string) => {
      const res = await fetch(`/api/transactions/${transactionId}/goal`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unassign transaction from goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-by-name"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      queryClient.invalidateQueries({ queryKey: ["all-category-stats"] });
      queryClient.invalidateQueries({ queryKey: ["category-name-stats"] });
      queryClient.invalidateQueries({ queryKey: ["spending-trend"] });
      queryClient.invalidateQueries({ queryKey: ["category-stats"] });
    },
  });
}
