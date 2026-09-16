import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import type { ManualTransactionInput } from "@/src/lib/manual-transactions";
import {
  invalidateTransactionQueries,
  readApiError,
} from "@/src/lib/transaction-queries";

export function useCreateManualTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ManualTransactionInput) => {
      const res = await fetch("/api/transactions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Failed to add the manual transaction")
        );
      }
      return res.json() as Promise<{ transaction: Transaction }>;
    },
    onSuccess: () => {
      invalidateTransactionQueries(queryClient);
    },
  });
}
