import { useQuery } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import type { TransactionCategoryRule } from "@/src/types/budget";

export function useTransaction(transactionId: string) {
  return useQuery({
    queryKey: ["transaction", transactionId],
    queryFn: async () => {
      const res = await fetch(`/api/plaid/transactions/${transactionId}`);
      if (!res.ok) throw new Error("Failed to fetch transaction");
      return res.json() as Promise<{
        transaction: Transaction;
        categoryRule: TransactionCategoryRule | null;
      }>;
    },
    enabled: !!transactionId,
  });
}
