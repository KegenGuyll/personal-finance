import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useUnmarkIncome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: string) => {
      const res = await fetch(`/api/transactions/${transactionId}/mark-income`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unmark income transaction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
      queryClient.invalidateQueries({ queryKey: ["income-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["income-status"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
    },
  });
}
