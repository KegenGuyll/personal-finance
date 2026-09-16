"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { useAppSelector } from "@/src/lib/hooks";
import { useAccount } from "@/src/hooks/useAccount";
import { useDeleteManualTransaction } from "@/src/hooks/useDeleteManualTransaction";
import ManualTransactionModal from "@/src/components/ManualTransactionModal";

/**
 * Edit / discard controls for a temporary transaction, shown on its own detail
 * page. Linking is deliberately not offered here: a manual entry is matched from
 * the synced transaction it belongs to, once Plaid has synced it.
 */
export default function ManualEntryActions({
  transaction,
}: {
  transaction: Transaction;
}) {
  const router = useRouter();
  const accounts = useAppSelector((state) => state.plaid.accounts);
  // Redux is empty on a deep link until AccountProvider resolves; this is the
  // same query the detail page already runs, so it comes from cache.
  const { data: accountData } = useAccount(transaction.account_id);
  const deleteManual = useDeleteManualTransaction();

  const [isEditing, setIsEditing] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteManual.mutateAsync(transaction.transaction_id);
      router.push(`/accounts/${transaction.account_id}`);
    } catch {
      // The mutation state carries the message shown below.
    }
  };

  // The modal allows moving an entry to another account, which leaves this page
  // pointing at the old one (header, related transactions and the Back link all
  // read the account from the URL).
  const handleSaved = (saved: Transaction) => {
    if (saved.account_id !== transaction.account_id) {
      router.replace(
        `/accounts/${saved.account_id}/transactions/${saved.transaction_id}`
      );
    }
  };

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-space-indigo-400">
        This is a manual transaction: it counts right away and stays until you
        link it to the real transaction once Plaid syncs it. Open the synced
        transaction and choose &ldquo;Link transaction&rdquo; to match them.
      </p>

      {deleteManual.error && (
        <p className="mt-3 rounded-md border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-2 text-xs text-soft-periwinkle-800">
          {deleteManual.error.message}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setIsEditing(true)}
          className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-700 transition-colors hover:bg-space-indigo-50"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteManual.isPending}
          className="rounded-lg border border-soft-periwinkle-200 px-4 py-2 text-sm font-medium text-soft-periwinkle-700 transition-colors hover:bg-soft-periwinkle-50 disabled:opacity-50"
        >
          {deleteManual.isPending ? "Discarding..." : "Discard"}
        </button>
      </div>

      {isEditing && (
        <ManualTransactionModal
          mode="edit"
          transaction={transaction}
          accounts={accounts}
          fallbackAccount={accountData?.account ?? null}
          onClose={() => setIsEditing(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
