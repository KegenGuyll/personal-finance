"use client";

import { useMemo, useState } from "react";

import type { Account, Transaction } from "@/src/features/plaid/plaidSlice";
import { useCategories } from "@/src/hooks/useCategories";
import { useCreateManualTransaction } from "@/src/hooks/useCreateManualTransaction";
import { useGoals } from "@/src/hooks/useGoals";
import GoalSelect from "@/src/components/GoalSelect";
import ConfidenceBadge from "@/src/components/ConfidenceBadge";
import {
  parseCategoryInput,
  todayIsoDate,
  type ManualTransactionType,
} from "@/src/lib/manual-transactions";
import type {
  ReceiptConfidence,
  ReceiptDraft,
  ReceiptPhotoQuality,
} from "@/src/lib/receipt-vlm-mapping";

const CATEGORY_LIST_ID = "receipt-categories";

export interface ReceiptReviewFormProps {
  draft: ReceiptDraft;
  confidence: ReceiptConfidence;
  notes: string[];
  quality: ReceiptPhotoQuality;
  accounts: Account[];
  defaultAccountId?: string;
  fallbackAccount?: Account | null;
  onSaved: (transaction: Transaction) => void;
  onBack: () => void;
}

function accountLabel(account: Account): string {
  return `${account.name}${account.mask ? ` ····${account.mask}` : ""}`;
}

/**
 * The pre-filled form a scan lands in.
 *
 * Field-for-field the same entry as a typed manual transaction, so nothing here
 * needs its own save path: it submits through the shared create hook and lands
 * in the same collection. What it adds over `ManualTransactionModal` is the
 * provenance — a confidence marker per field and the parser's notes — which is
 * what turns "check this receipt" from a re-typing exercise into reading three
 * numbers.
 */
export default function ReceiptReviewForm({
  draft,
  confidence,
  notes,
  quality,
  accounts,
  defaultAccountId,
  fallbackAccount,
  onSaved,
  onBack,
}: ReceiptReviewFormProps) {
  const { data: categoryData } = useCategories();
  const { data: goalsData } = useGoals();
  const createManual = useCreateManualTransaction();

  const goals = useMemo(() => goalsData?.goals ?? [], [goalsData]);

  const accountOptions = useMemo(() => {
    if (!fallbackAccount) return accounts;
    if (accounts.some((account) => account.account_id === fallbackAccount.account_id)) {
      return accounts;
    }
    return [fallbackAccount, ...accounts];
  }, [accounts, fallbackAccount]);

  // Deliberately not defaulted to `accounts[0]`. The list is ordered by whatever
  // the API returned, so falling back to it silently booked a scanned
  // transaction against an account the user never chose — and a wrong account is
  // invisible in the form once the select shows a name.
  //
  // `defaultAccountId` is still honoured because the only callers that set it are
  // the account pages, where the account is what the page is about.
  const [accountId, setAccountId] = useState(
    () => defaultAccountId ?? fallbackAccount?.account_id ?? ""
  );
  const [type, setType] = useState<ManualTransactionType>(draft.type);
  const [amount, setAmount] = useState(() =>
    draft.amount === null ? "" : String(draft.amount)
  );
  const [name, setName] = useState(draft.name);
  const [date, setDate] = useState(() => draft.date || todayIsoDate());
  const [category, setCategory] = useState(() => draft.category?.join(" > ") ?? "");
  const [goalId, setGoalId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedAccount = accountOptions.find(
    (account) => account.account_id === accountId
  );
  const parsedAmount = Number(amount);
  const isSaving = createManual.isPending;

  const canSave =
    !isSaving &&
    accountId.length > 0 &&
    name.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const errorMessage = validationError ?? createManual.error?.message ?? null;

  const handleSubmit = async () => {
    if (!canSave) return;
    setValidationError(null);

    const parsedCategory = parseCategoryInput(category);
    if (!parsedCategory.ok) {
      setValidationError(parsedCategory.error);
      return;
    }

    try {
      const saved = await createManual.mutateAsync({
        accountId,
        name: name.trim(),
        amount: parsedAmount,
        type,
        date,
        category: parsedCategory.value,
        // Matches the account's currency rather than assuming USD; an empty
        // code falls back to the API's default.
        isoCurrencyCode: selectedAccount?.balances?.iso_currency_code ?? "",
        goalId: goalId || null,
      });

      onSaved(saved.transaction);
    } catch {
      // The mutation state carries the message shown below the form.
    }
  };

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge confidence={confidence.amount} label="Amount" />
        <ConfidenceBadge confidence={confidence.date} label="Date" />
        <ConfidenceBadge confidence={confidence.name} label="Name" />
        <ConfidenceBadge confidence={confidence.category} label="Category" />
      </div>

      {[...quality.warnings, ...notes].length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-space-indigo-100 bg-space-indigo-50 px-3 py-2">
          {[...quality.warnings, ...notes].map((note) => (
            <li key={note} className="text-[10px] text-space-indigo-600">
              {note}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-1">
        {(
          [
            { label: "Expense", value: "expense" },
            { label: "Income", value: "income" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            onClick={() => {
              setType(option.value);
              // Income cannot be goal-funded, so a chosen goal is dropped rather
              // than kept and rejected on save.
              if (option.value === "income") setGoalId("");
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              type === option.value
                ? option.value === "income"
                  ? "bg-ocean-deep-500 text-white"
                  : "bg-cornflower-blue-500 text-white"
                : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-xs font-medium text-space-indigo-600">
        Amount
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.00"
        className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
      />

      <label className="mt-3 block text-xs font-medium text-space-indigo-600">
        Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Corner Cafe"
        className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
      />

      <label className="mt-3 block text-xs font-medium text-space-indigo-600">
        Date
      </label>
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
      />

      <label className="mt-3 block text-xs font-medium text-space-indigo-600">
        Account
      </label>
      <select
        value={accountId}
        onChange={(event) => setAccountId(event.target.value)}
        className="mt-1 w-full rounded-lg border border-space-indigo-200 bg-white px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
      >
        <option value="" disabled>
          Choose an account…
        </option>
        {accountOptions.map((account) => (
          <option key={account.account_id} value={account.account_id}>
            {accountLabel(account)}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-xs font-medium text-space-indigo-600">
        Category (optional)
      </label>
      <input
        type="text"
        list={CATEGORY_LIST_ID}
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        placeholder='e.g. "Food and Drink > Restaurants"'
        className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
      />
      <datalist id={CATEGORY_LIST_ID}>
        {(categoryData?.categories ?? []).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p className="mt-1 text-[10px] text-space-indigo-400">
        Only suggested when the receipt matches a category you already have.
      </p>

      {type === "expense" && (
        <>
          <label className="mt-3 block text-xs font-medium text-space-indigo-600">
            Spend from goal (optional)
          </label>
          {goals.length === 0 && !goalId ? (
            <p className="mt-1 text-xs text-space-indigo-400">No goals yet.</p>
          ) : (
            <div className="mt-1">
              <GoalSelect
                aria-label="Spend from goal"
                goals={goals}
                value={goalId}
                onChange={setGoalId}
                emptyOptionLabel="No goal"
              />
            </div>
          )}
        </>
      )}

      {accountId.length === 0 && (
        <p className="mt-1 text-[10px] text-amber-700">
          Choose an account before saving.
        </p>
      )}

      {errorMessage && (
        <p className="mt-3 rounded-md border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-2 text-xs text-soft-periwinkle-800">
          {errorMessage}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSave}
          className="rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Add transaction"}
        </button>
      </div>
    </div>
  );
}
