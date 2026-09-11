import { useQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";

interface GoalTransactionsResponse {
  transactions: Transaction[];
  totalSpent: number;
}

export function useGoalTransactions(goalId: string) {
  return useQuery({
    queryKey: ["goal-transactions", goalId],
    queryFn: async () => {
      const res = await fetch(`/api/goals/${goalId}/transactions`);
      if (!res.ok) throw new Error("Failed to fetch goal transactions");
      return res.json() as Promise<GoalTransactionsResponse>;
    },
    enabled: !!goalId,
    staleTime: 60_000,
  });
}
