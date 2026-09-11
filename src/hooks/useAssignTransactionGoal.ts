import { useMutation, useQueryClient } from "@tanstack/react-query";

interface AssignTransactionGoalInput {
  transactionId: string;
  goalId: string;
}

export function useAssignTransactionGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignTransactionGoalInput) => {
      const res = await fetch(`/api/transactions/${input.transactionId}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: input.goalId }),
      });
      if (!res.ok) throw new Error("Failed to assign transaction to goal");
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
