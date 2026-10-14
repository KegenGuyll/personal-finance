"use client";

import { useState } from "react";
import { formatCurrency } from "@/src/utils/currency";
import { useBudgetCarryForwardPreview } from "@/src/hooks/useBudgetCarryForwardPreview";
import type { CarryForwardPreview } from "@/src/types/budget";
import Button from "@/src/components/ui/Button";
import FieldLabel from "@/src/components/ui/FieldLabel";
import Modal from "@/src/components/ui/Modal";
import Notice from "@/src/components/ui/Notice";
import TextInput from "@/src/components/ui/TextInput";

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
  const [confirmPreview, setConfirmPreview] = useState<CarryForwardPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const parsed = Math.round(parseFloat(amountInput) * 100) / 100;
  const isValidAmount = !isNaN(parsed) && parsed >= 0;

  const { refetch } = useBudgetCarryForwardPreview({
    month: anchorMonth,
    category,
    plannedAmount: isValidAmount ? parsed : 0,
    enabled: false,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount || checking) return;

    setChecking(true);
    setPreviewError(false);
    try {
      const result = await refetch();
      if (result.isError) {
        setPreviewError(true);
        setChecking(false);
        return;
      }

      const preview = result.data;
      const wouldChangeMonths = preview?.months.filter((m) => m.wouldChange) ?? [];
      setChecking(false);

      if (wouldChangeMonths.length > 0) {
        setConfirmPreview(preview ?? null);
        setPendingAmount(parsed);
        setConfirming(true);
      } else {
        onSave(parsed);
      }
    } catch {
      setPreviewError(true);
      setChecking(false);
    }
  };

  const handleConfirm = () => {
    if (pendingAmount === null) return;
    onSave(pendingAmount);
  };

  const handleCancelConfirm = () => {
    setConfirming(false);
    setPendingAmount(null);
    setConfirmPreview(null);
  };

  const wouldChangeMonths = confirmPreview?.months.filter((m) => m.wouldChange) ?? [];
  const wouldChangeCount = wouldChangeMonths.length;

  return (
    <Modal onClose={onClose} variant="bottom-sheet">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-space-indigo-800">
            Set Planned Budget
          </h3>
          <p className="text-xs font-medium text-space-indigo-400">
            For <span className="font-semibold text-space-indigo-700">{category}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close dialog"
        >
          &times;
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel className="mb-1 font-semibold" htmlFor="budget-category-amount">
            Monthly Budget Amount
          </FieldLabel>
          <div className="relative flex items-center">
            <TextInput
              id="budget-category-amount"
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setConfirming(false);
                setPendingAmount(null);
                setConfirmPreview(null);
                setPreviewError(false);
              }}
              placeholder="0.00"
              autoFocus
              leading={
                <span className="text-base font-semibold text-space-indigo-400">
                  $
                </span>
              }
              className="rounded-xl bg-space-indigo-50/30 py-2.5 pl-8 text-base font-bold text-space-indigo-900 focus:border-space-indigo-500 focus:bg-white"
            />
          </div>
          {currentAmount > 0 && !confirming && (
            <p className="mt-1 text-[11px] text-space-indigo-400">
              Current budget: {formatCurrency(currentAmount)}
            </p>
          )}
        </div>

        {confirming && (
          <Notice as="div" tone="warning" className="rounded-lg p-3">
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
          </Notice>
        )}

        {previewError && !confirming && (
          <p className="text-[11px] font-medium text-red-500">
            Couldn&apos;t check future months. Please try again.
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          {confirming ? (
            <>
              <Button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl py-2.5 text-center font-semibold shadow-2xs"
              >
                {isPending ? "Saving…" : "Apply to Future Months"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleCancelConfirm}
                className="rounded-xl py-2.5 font-semibold"
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="submit"
                disabled={isPending || !isValidAmount || checking}
                className="flex-1 rounded-xl py-2.5 text-center font-semibold shadow-2xs"
              >
                {checking ? "Checking…" : isPending ? "Saving…" : "Save Budget"}
              </Button>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={checking}
                className="rounded-xl py-2.5 font-semibold"
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
