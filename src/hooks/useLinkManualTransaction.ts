import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MergeField } from "@/src/lib/manual-transactions";
import {
  invalidateTransactionQueries,
  readApiError,
} from "@/src/lib/transaction-queries";

export interface LinkManualTransactionInput {
  /** The synced transaction that absorbs the manual entry. */
  transactionId: string;
  manualTransactionId: string;
}

export interface LinkManualTransactionResult {
  success: boolean;
  transactionId: string;
  merged: MergeField[];
}

/**
 * Links a manual entry into the synced transaction it turned out to be. The
 * API copies the entry's details across and deletes it, so a manual entry can
 * only ever be linked once.
 */
export function useLinkManualTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transactionId,
      manualTransactionId,
    }: LinkManualTransactionInput) => {
      const res = await fetch(
        `/api/transactions/${transactionId}/link-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualTransactionId }),
        }
      );
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Failed to link the manual transaction")
        );
      }
      return res.json() as Promise<LinkManualTransactionResult>;
    },
    onSuccess: () => {
      invalidateTransactionQueries(queryClient);
    },
    // A failed link can still have changed the data underneath us (the entry may
    // have been consumed by another request, or the merge may have landed before
    // the error surfaced), so refresh rather than leaving a picker that offers
    // an entry which no longer exists.
    onError: () => {
      invalidateTransactionQueries(queryClient);
    },
  });
}
