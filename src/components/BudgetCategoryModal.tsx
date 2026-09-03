"use client";

import { useState } from "react";
import { formatCurrency } from "@/src/utils/currency";
import { useBudgetCarryForwardPreview } from "@/src/hooks/useBudgetCarryForwardPreview";
import { useDebounce } from "@/src/hooks/useDebounce";

interface BudgetCategoryModalProps {
  isOpen: boolean;
  category: string;
  currentAmount: number;
  anchorMonth: string;
  onSave: (amount: number) => void;
  onClose: () => void;
  isPending?: boolean;
}

function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export default function BudgetCategoryModal({
  isOpen,
  category,
  currentAmount,
  anchorMonth,
  onSave,
  onClose,
  isPending = false,
}: BudgetCategoryModalProps) {
  const [amountInput, setAmountInput] = useState(String(currentAmount || ""));
  const [confirming, setConfirming] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);

  const parsed = Math.round(parseFloat(amountInput) * 100) / 100;
  const isValidAmount = !isNaN(parsed) && parsed >= 0;
  const amountValue = isValidAmount ? parsed : currentAmount;
  const debouncedAmount = useDebounce(amountValue, 300);

  const {
    data: preview,
    isLoading: previewLoading,
  } = useBudgetCarryForwardPreview({
    month: anchorMonth,
    category,
    plannedAmount: debouncedAmount,
    enabled: isOpen && isValidAmount,
  });

  const wouldChangeMonths = preview?.months.filter((m) => m.wouldChange) ?? [];
  const wouldChangeCount = wouldChangeMonths.length;

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount) return;

    if (wouldChangeCount > 0) {
      setPendingAmount(parsed);
      setConfirming(true);
    } else {
      onSave(parsed);
    }
  };

  const handleConfirm = () => {
    if (pendingAmount === null) return;
    onSave(pendingAmount);
  };

  const handleCancelConfirm = () => {
    setConfirming(false);
    setPendingAmount(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-space-indigo-100 bg-white p-5 shadow-xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-space-indigo-800">
              Set Planned Budget
            </h3>
            <p className="text-xs font-medium text-space-indigo-400">
              For <span className="font-semibold text-space-indigo-700">{category}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-space-indigo-400 hover:bg-space-indigo-50 hover:text-space-indigo-700"
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-space-indigo-600">
              Monthly Budget Amount
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-base font-semibold text-space-indigo-400">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setConfirming(false);
                  setPendingAmount(null);
                }}
                placeholder="0.00"
                autoFocus
                className="w-full rounded-xl border border-space-indigo-200 bg-space-indigo-50/30 py-2.5 pl-8 pr-4 text-base font-bold text-space-indigo-900 focus:border-space-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
            {currentAmount > 0 && !confirming && (
              <p className="mt-1 text-[11px] text-space-indigo-400">
                Current budget: {formatCurrency(currentAmount)}
              </p>
            )}
          </div>

          {confirming && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-space-indigo-800">
                This change will also update {wouldChangeCount} future month
                {wouldChangeCount > 1 ? "s" : ""}:
              </p>
              <p className="mt-1 text-xs text-space-indigo-600">
                {wouldChangeMonths
                  .slice(0, 6)
                  .map((m) => formatMonthShort(m.month))
                  .join(", ")}
                {wouldChangeCount > 6 && "…"}
              </p>
              <p className="mt-1.5 text-[11px] text-space-indigo-400">
                Past months are unchanged. Future months will be set to{" "}
                <span className="font-semibold text-space-indigo-700">
                  {formatCurrency(pendingAmount ?? 0)}
                </span>
                .
              </p>
            </div>
          )}

          {previewLoading && !confirming && isValidAmount && (
            <p className="text-[11px] text-space-indigo-400">
              Checking future months…
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-space-indigo-600 py-2.5 text-center text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700 active:bg-space-indigo-800 disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Apply to Future Months"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelConfirm}
                  className="rounded-xl border border-space-indigo-200 px-4 py-2.5 text-sm font-semibold text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={isPending || !isValidAmount}
                  className="flex-1 rounded-xl bg-space-indigo-600 py-2.5 text-center text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700 active:bg-space-indigo-800 disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Save Budget"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-space-indigo-200 px-4 py-2.5 text-sm font-semibold text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
