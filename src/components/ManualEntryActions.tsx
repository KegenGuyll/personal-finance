"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { useAppSelector } from "@/src/lib/hooks";
import { useAccount } from "@/src/hooks/useAccount";
import { useDeleteManualTransaction } from "@/src/hooks/useDeleteManualTransaction";
import ManualTransactionModal from "@/src/components/ManualTransactionModal";
import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import Notice from "@/src/components/ui/Notice";

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
    if (!confirm("Discard this manual transaction?")) return;

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
    <Card>
      <p className="text-xs text-space-indigo-400">
        This is a manual transaction: it counts right away and stays until you
        link it to the real transaction once Plaid syncs it. Open the synced
        transaction and choose &ldquo;Link transaction&rdquo; to match them.
      </p>

      {deleteManual.error && <Notice className="mt-3">{deleteManual.error.message}</Notice>}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <Button
          variant="secondary"
          className="border-soft-periwinkle-200 text-soft-periwinkle-700 hover:bg-soft-periwinkle-50"
          onClick={handleDelete}
          disabled={deleteManual.isPending}
        >
          {deleteManual.isPending ? "Discarding..." : "Discard"}
        </Button>
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
    </Card>
  );
}
