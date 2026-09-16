import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateTransactionQueries,
  readApiError,
} from "@/src/lib/transaction-queries";

export function useDeleteManualTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: string) => {
      const res = await fetch(`/api/transactions/manual/${transactionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Failed to discard the manual transaction")
        );
      }
      return res.json() as Promise<{ success: boolean }>;
    },
    onSuccess: () => {
      invalidateTransactionQueries(queryClient);
    },
  });
}
