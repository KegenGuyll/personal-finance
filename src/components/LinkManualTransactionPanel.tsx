"use client";

import { useState } from "react";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { useManualTransactions } from "@/src/hooks/useManualTransactions";
import { useLinkManualTransaction } from "@/src/hooks/useLinkManualTransaction";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";
import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import Modal from "@/src/components/ui/Modal";
import Notice from "@/src/components/ui/Notice";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate } from "@/src/utils/date";
import {
  buildManualMerge,
  MERGE_FIELD_LABELS,
  rankManualEntriesForTransaction,
  summarizeManualMerge,
} from "@/src/lib/manual-transactions";

function daysLabel(daysDiff: number): string {
  if (daysDiff === 0) return "Same day";
  const magnitude = Math.abs(daysDiff);
  return `${magnitude} day${magnitude === 1 ? "" : "s"} ${
    daysDiff < 0 ? "earlier" : "later"
  }`;
}

/**
 * Links a temporary ("manual") transaction to the synced transaction it turned
 * out to be.
 *
 * It lives on the synced transaction on purpose: the manual entry is the thing
 * that goes away, and matching is easy once the real amount and date are on
 * screen next to the list. A manual entry can only be linked once — the API
 * deletes it as part of the link, so it disappears from this list.
 */
export default function LinkManualTransactionPanel({
  transaction,
}: {
  transaction: Transaction;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);

  const { data, isLoading } = useManualTransactions();
  const linkManual = useLinkManualTransaction();

  const entries = data?.transactions ?? [];
  const total = data?.total ?? entries.length;
  const ranked = rankManualEntriesForTransaction(transaction, entries);
  const selected = ranked.find(
    (candidate) => candidate.entry.transaction_id === selectedId
  );

  const handleLink = async () => {
    if (!selected) return;
    setLinkedName(selected.entry.name);
    try {
      await linkManual.mutateAsync({
        transactionId: transaction.transaction_id,
        manualTransactionId: selected.entry.transaction_id,
      });
    } catch {
      setLinkedName(null);
    }
  };

  if (!isOpen) {
    // Once a manual entry has been absorbed there is nothing left to link.
    if (transaction.manualEntryId) return null;

    return (
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Link transaction
      </Button>
    );
  }

  const success = linkManual.isSuccess && linkedName !== null;

  return (
    <Modal onClose={() => setIsOpen(false)} className="max-h-full overflow-y-auto">
        {success ? (
          <>
            <h3 className="text-lg font-semibold text-space-indigo-800">
              Linked
            </h3>
            <p className="mt-1 text-sm text-space-indigo-400">
              &ldquo;{linkedName}&rdquo; was merged into this transaction and
              removed, so it is only counted once.
            </p>
            <ul className="mt-3 space-y-1">
              {(linkManual.data?.merged ?? []).map((field) => (
                <li
                  key={field}
                  className="text-sm text-space-indigo-700"
                >
                  {MERGE_FIELD_LABELS[field]}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setIsOpen(false)}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-space-indigo-800">
              Link a manual transaction
            </h3>
            <p className="mt-1 text-sm text-space-indigo-400">
              Pick the entry you added before this purchase synced. Its details
              are copied here and the manual entry is removed.
            </p>

            <div className="mt-4">
              {isLoading && (
                <LoadingSkeleton count={2} className="space-y-2" />
              )}

              {!isLoading && ranked.length === 0 && (
                <p className="rounded-lg border border-space-indigo-100 bg-space-indigo-50 px-3 py-2 text-sm text-space-indigo-600">
                  No manual transactions to link. Add one from an account page or
                  from the All Transactions page when a purchase has not synced
                  yet.
                </p>
              )}

              {!isLoading && total > entries.length && (
                <p className="mb-2 text-xs text-space-indigo-400">
                  Showing the newest {entries.length} of {total} manual
                  transactions.
                </p>
              )}

              <div className="space-y-2">
                {ranked.map((candidate) => {
                  const { entry } = candidate;
                  const compatibility = buildManualMerge(entry, transaction);
                  const isSelected = selectedId === entry.transaction_id;

                  return (
                    <Button
                      key={entry.transaction_id}
                      variant="bare"
                      onClick={() => setSelectedId(entry.transaction_id)}
                      disabled={!compatibility.ok}
                      className={`w-full rounded-lg border px-3 py-2 text-left font-normal ${
                        isSelected
                          ? "border-space-indigo-400 bg-space-indigo-50"
                          : "border-space-indigo-100 bg-white hover:bg-space-indigo-50"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-space-indigo-800">
                          {entry.name}
                        </span>
                        <span className="whitespace-nowrap text-sm font-semibold text-space-indigo-700">
                          {formatCurrency(-entry.amount, entry.iso_currency_code)}
                        </span>
                      </div>
                      <p className="text-xs text-space-indigo-400">
                        {formatDate(entry.date)}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {candidate.sameAmount && (
                          <Chip className="rounded-md bg-baby-blue-ice-100 px-1.5 text-ocean-deep-700">
                            Same amount
                          </Chip>
                        )}
                        {candidate.sameAccount && (
                          <Chip className="rounded-md bg-soft-periwinkle-100 px-1.5 text-soft-periwinkle-700">
                            Same account
                          </Chip>
                        )}
                        <Chip
                          tone="indigo"
                          className="rounded-md px-1.5 text-space-indigo-500"
                        >
                          {daysLabel(candidate.daysDiff)}
                        </Chip>
                      </p>
                      {!compatibility.ok && (
                        <p className="mt-1 text-[10px] text-space-indigo-400">
                          {compatibility.error}
                        </p>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>

            {selected && (
              <div className="mt-4 rounded-lg border border-baby-blue-ice-200 bg-baby-blue-ice-50 px-3 py-2">
                <p className="text-xs font-medium text-ocean-deep-700">
                  Linking will:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {summarizeManualMerge(selected.entry, transaction).map(
                    (line) => (
                      <li
                        key={line}
                        className="text-xs text-ocean-deep-700"
                      >
                        {line}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {linkManual.error && (
              <Notice className="mt-3">{linkManual.error.message}</Notice>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLink}
                disabled={!selected || linkManual.isPending}
              >
                {linkManual.isPending ? "Linking..." : "Link"}
              </Button>
            </div>
          </>
        )}
    </Modal>
  );
}
