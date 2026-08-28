import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BulkMarkIncomeInput {
  name: string;
  transactionIds: string[];
}

export function useBulkMarkIncome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BulkMarkIncomeInput) => {
      const res = await fetch("/api/transactions/mark-income/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to mark transactions as income");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-by-name"] });
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
      queryClient.invalidateQueries({ queryKey: ["income-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["income-status"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
    },
  });
}
