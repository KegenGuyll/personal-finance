import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import type { ManualTransactionPatch } from "@/src/lib/manual-transactions";
import {
  invalidateTransactionQueries,
  readApiError,
} from "@/src/lib/transaction-queries";

interface UpdateManualTransactionInput {
  transactionId: string;
  patch: ManualTransactionPatch;
}

export function useUpdateManualTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, patch }: UpdateManualTransactionInput) => {
      const res = await fetch(`/api/transactions/manual/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Failed to update the manual transaction")
        );
      }
      return res.json() as Promise<{ transaction: Transaction }>;
    },
    onSuccess: () => {
      invalidateTransactionQueries(queryClient);
    },
  });
}
