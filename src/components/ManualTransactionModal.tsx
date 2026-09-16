"use client";

import { useMemo, useState } from "react";
import type { Account, Transaction } from "@/src/features/plaid/plaidSlice";
import { useCategories } from "@/src/hooks/useCategories";
import { useGoals } from "@/src/hooks/useGoals";
import GoalSelect from "@/src/components/GoalSelect";
import { useCreateManualTransaction } from "@/src/hooks/useCreateManualTransaction";
import { useUpdateManualTransaction } from "@/src/hooks/useUpdateManualTransaction";
import {
  parseCategoryInput,
  todayIsoDate,
  type ManualTransactionType,
} from "@/src/lib/manual-transactions";

const CATEGORY_LIST_ID = "manual-transaction-categories";

interface ManualTransactionModalProps {
  /** `edit` requires `transaction`; `create` only needs the account list. */
  mode: "create" | "edit";
  transaction?: Transaction;
  accounts: Account[];
  defaultAccountId?: string;
  /**
   * The account already fetched by the page that opened this modal. Redux only
   * holds the account list once AccountProvider has resolved, so a deep link
   * would otherwise open the modal with nothing to choose from.
   */
  fallbackAccount?: Account | null;
  onClose: () => void;
  onSaved?: (transaction: Transaction) => void;
}

function accountLabel(account: Account): string {
  return `${account.name}${account.mask ? ` ····${account.mask}` : ""}`;
}

/**
 * Adds — or edits — a temporary transaction for a purchase Plaid has not synced
 * yet. The entry is a normal transaction row from the moment it is saved, so it
 * shows up in the lists, budgets and charts immediately and is deleted once it
 * is linked to the synced transaction it turned out to be.
 */
export default function ManualTransactionModal({
  mode,
  transaction,
  accounts,
  defaultAccountId,
  fallbackAccount,
  onClose,
  onSaved,
}: ManualTransactionModalProps) {
  const isEdit = mode === "edit" && !!transaction;

  const { data: categoryData } = useCategories();
  const { data: goalsData } = useGoals();
  const createManual = useCreateManualTransaction();
  const updateManual = useUpdateManualTransaction();

  const goals = useMemo(() => goalsData?.goals ?? [], [goalsData]);

  // The fallback keeps a deep-linked page usable before AccountProvider resolves.
  const accountOptions = useMemo(() => {
    if (!fallbackAccount) return accounts;
    if (accounts.some((a) => a.account_id === fallbackAccount.account_id)) {
      return accounts;
    }
    return [fallbackAccount, ...accounts];
  }, [accounts, fallbackAccount]);

  const [accountId, setAccountId] = useState(
    () =>
      transaction?.account_id ??
      defaultAccountId ??
      fallbackAccount?.account_id ??
      accounts[0]?.account_id ??
      ""
  );
  const [type, setType] = useState<ManualTransactionType>(() =>
    transaction && (transaction.transaction_type === "income" || transaction.amount < 0)
      ? "income"
      : "expense"
  );
  const [amount, setAmount] = useState(() =>
    transaction ? String(Math.abs(transaction.amount)) : ""
  );
  const [name, setName] = useState(() => transaction?.name ?? "");
  const [date, setDate] = useState(() => transaction?.date ?? todayIsoDate());
  const [category, setCategory] = useState(
    () => transaction?.category?.join(" > ") ?? ""
  );
  const [goalId, setGoalId] = useState(() => transaction?.goalId ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutationError = createManual.error ?? updateManual.error;
  const isSaving = createManual.isPending || updateManual.isPending;
  const parsedAmount = Number(amount);

  // Falls back when the stored id is empty because the account list had not
  // loaded yet when this modal mounted.
  const effectiveAccountId =
    accountId || defaultAccountId || fallbackAccount?.account_id || accountOptions[0]?.account_id || "";
  const selectedAccount = accountOptions.find(
    (account) => account.account_id === effectiveAccountId
  );

  const canSave =
    !isSaving &&
    effectiveAccountId.length > 0 &&
    name.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;
  const errorMessage = validationError ?? mutationError?.message ?? null;

  const handleSubmit = async () => {
    if (!canSave) return;
    setValidationError(null);

    const parsedCategory = parseCategoryInput(category);
    if (!parsedCategory.ok) {
      setValidationError(parsedCategory.error);
      return;
    }

    try {
      const saved =
        isEdit && transaction
          ? await updateManual.mutateAsync({
              transactionId: transaction.transaction_id,
              patch: {
                accountId: effectiveAccountId,
                name: name.trim(),
                amount: parsedAmount,
                type,
                date,
                category: parsedCategory.value,
                // "" clears the assignment.
                goalId: goalId || null,
              },
            })
          : await createManual.mutateAsync({
              accountId: effectiveAccountId,
              name: name.trim(),
              amount: parsedAmount,
              type,
              date,
              category: parsedCategory.value,
              // Match the account's currency instead of always assuming USD; an
              // empty code falls back to the API's default.
              isoCurrencyCode: selectedAccount?.balances?.iso_currency_code ?? "",
              goalId: goalId || null,
            });

      onSaved?.(saved.transaction);
      onClose();
    } catch {
      // The mutation state carries the message shown below the form.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-space-indigo-900/40 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-space-indigo-100 bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-space-indigo-800">
          {isEdit ? "Edit manual transaction" : "Add manual transaction"}
        </h3>
        <p className="mt-1 text-sm text-space-indigo-400">
          {isEdit
            ? "Update the details you entered before this purchase synced."
            : "Track a purchase before Plaid syncs it. It counts in your budgets right away, and you link it to the real transaction later."}
        </p>

        {accountOptions.length === 0 ? (
          <div className="mt-4">
            <p className="text-sm text-space-indigo-600">
              Link an account before adding manual transactions.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
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
                    // Income cannot be goal-funded, so a chosen goal is dropped
                    // rather than silently kept and rejected on save.
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
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
            />

            <label className="mt-3 block text-xs font-medium text-space-indigo-600">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Corner Cafe"
              className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
            />

            <label className="mt-3 block text-xs font-medium text-space-indigo-600">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
            />

            <label className="mt-3 block text-xs font-medium text-space-indigo-600">
              Account
            </label>
            <select
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-space-indigo-200 bg-white px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
            >
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
              onChange={(e) => setCategory(e.target.value)}
              placeholder='e.g. "Food and Drink > Restaurants"'
              className="mt-1 w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
            />
            <datalist id={CATEGORY_LIST_ID}>
              {(categoryData?.categories ?? []).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-space-indigo-400">
              Use &ldquo;Parent &gt; Child&rdquo; to nest a category. Leave it
              empty to keep the purchase uncategorized for now.
            </p>

            {type === "expense" && (
              <>
                <label className="mt-3 block text-xs font-medium text-space-indigo-600">
                  Spend from goal (optional)
                </label>
                {goals.length === 0 && !goalId ? (
                  <p className="mt-1 text-xs text-space-indigo-400">
                    No goals yet.
                  </p>
                ) : (
                  <>
                    <div className="mt-1">
                      <GoalSelect
                        aria-label="Spend from goal"
                        goals={goals}
                        value={goalId}
                        onChange={setGoalId}
                        emptyOptionLabel="No goal"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-space-indigo-400">
                      Drops out of your category spending and draws down the goal
                      instead. Linking carries the assignment onto the synced
                      transaction.
                    </p>
                  </>
                )}
              </>
            )}

            {errorMessage && (
              <p className="mt-3 rounded-md border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-2 text-xs text-soft-periwinkle-800">
                {errorMessage}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSave}
                className="rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : isEdit ? "Save changes" : "Add transaction"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
