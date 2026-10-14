"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAppSelector } from "@/src/lib/hooks";
import { useTransactionsByName } from "@/src/hooks/useTransactionsByName";
import { useBulkMarkIncome } from "@/src/hooks/useBulkMarkIncome";
import { formatCurrency } from "@/src/utils/currency";
import { getStartDate } from "@/src/components/DateRangeFilter";
import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import Modal from "@/src/components/ui/Modal";
import Notice from "@/src/components/ui/Notice";

interface BulkMarkIncomeModalProps {
  transactionName: string;
  onClose: () => void;
}

export default function BulkMarkIncomeModal({
  transactionName,
  onClose,
}: BulkMarkIncomeModalProps) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "";
  const activeType = searchParams.get("type") ?? "";
  const startDate = getStartDate(range);
  const endDate = searchParams.get("endDate") ?? "";

  const { accounts } = useAppSelector((state) => state.plaid);

  const filteredAccounts = useMemo(() => {
    if (!activeType) return accounts;
    return accounts.filter((a) => a.type === activeType);
  }, [accounts, activeType]);

  const accountIds = useMemo(
    () => filteredAccounts.map((a) => a.account_id),
    [filteredAccounts]
  );

  const { data, isLoading } = useTransactionsByName(
    transactionName,
    startDate,
    endDate || null,
    accountIds,
    true
  );

  const bulkMarkIncome = useBulkMarkIncome();

  const transactions = useMemo(() => data?.transactions ?? [], [data]);

  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const selectedIds = useMemo(() => {
    const selected = new Set<string>();
    for (const t of transactions) {
      if (!excludedIds.has(t.transaction_id)) {
        selected.add(t.transaction_id);
      }
    }
    return selected;
  }, [transactions, excludedIds]);

  const getAccountMask = (accountId: string): string => {
    const account = accounts.find((a) => a.account_id === accountId);
    return account?.mask ?? "";
  };

  const toggleTransaction = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (excludedIds.size > 0) {
      setExcludedIds(new Set());
    } else {
      setExcludedIds(new Set(transactions.map((t) => t.transaction_id)));
    }
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;

    bulkMarkIncome.mutate(
      {
        name: transactionName,
        transactionIds: [...selectedIds],
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const alreadyMarked = transactions.some(
    (t) => t.transaction_type === "income"
  );

  return (
    <Modal onClose={onClose} labelledBy="bulk-mark-income-title" size="lg">
      <h3 id="bulk-mark-income-title" className="text-lg font-semibold text-space-indigo-800">
        Mark as Income
      </h3>
        <p className="mt-1 text-sm text-space-indigo-400">
          &ldquo;{transactionName}&rdquo; —{" "}
          {transactions.length} transaction
          {transactions.length !== 1 ? "s" : ""} found
        </p>

        {alreadyMarked && (
          <Notice tone="blue" className="mt-2">
            Some transactions are already marked as income. The pattern will be
            created so future occurrences of &ldquo;{transactionName}&rdquo; are
            auto-tagged.
          </Notice>
        )}

        {isLoading ? (
          <div className="my-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded bg-space-indigo-50"
              />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="my-6 text-sm text-space-indigo-400">
            No transactions found with this name.
          </p>
        ) : (
          <>
            <div className="my-3 flex items-center gap-2 border-b border-space-indigo-50 pb-2">
              <Button
                variant="bare"
                onClick={toggleAll}
                className="text-xs font-medium text-space-indigo-500 hover:text-space-indigo-700"
              >
                {selectedIds.size === transactions.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
              <span className="text-xs text-space-indigo-300">
                {selectedIds.size} of {transactions.length} selected
              </span>
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {transactions.map((txn) => {
                const isSelected = selectedIds.has(txn.transaction_id);
                const isAlreadyIncome = txn.transaction_type === "income";
                const mask = getAccountMask(txn.account_id);

                return (
                  <label
                    key={txn.transaction_id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-space-indigo-50 ${
                      isSelected ? "bg-space-indigo-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTransaction(txn.transaction_id)}
                      className="h-4 w-4 rounded border-space-indigo-200 accent-space-indigo-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-space-indigo-700">
                          {txn.date}
                        </span>
                        {mask && (
                          <span className="text-space-indigo-300">
                            ····{mask}
                          </span>
                        )}
                        {isAlreadyIncome && (
                          <Chip tone="emerald" className="rounded px-1.5">
                            Income
                          </Chip>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        txn.amount < 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {formatCurrency(-txn.amount, txn.iso_currency_code)}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-space-indigo-50 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={
              bulkMarkIncome.isPending ||
              selectedIds.size === 0 ||
              transactions.length === 0
            }
          >
            {bulkMarkIncome.isPending
              ? "Saving..."
              : `Mark ${selectedIds.size} as Income`}
          </Button>
        </div>
    </Modal>
  );
}
