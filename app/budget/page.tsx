"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/src/lib/hooks";
import { setCategoryMappingsOpen } from "@/src/features/ui/uiSlice";
import { useBudgetSummary } from "@/src/hooks/useBudgetSummary";
import { useBudgetHealth } from "@/src/hooks/useBudgetHealth";
import { useIncomeStatus } from "@/src/hooks/useIncomeStatus";
import { useMutateBudget } from "@/src/hooks/useMutateBudget";
import { useSeedBudgetGroups } from "@/src/hooks/useSeedBudgetGroups";
import { useBudgetGroups } from "@/src/hooks/useBudgetGroups";
import { useBudgetSettings } from "@/src/hooks/useBudgetSettings";
import { useMutateBudgetSettings } from "@/src/hooks/useMutateBudgetSettings";
import { useMutateBudgetCategory } from "@/src/hooks/useMutateBudgetCategory";
import { useReorderBudgetCategories } from "@/src/hooks/useReorderBudgetCategories";
import MonthSelector from "@/src/components/MonthSelector";
import BudgetEnvelopeCard from "@/src/components/BudgetEnvelopeCard";
import IncomeBanner from "@/src/components/IncomeBanner";
import IncomeSection from "@/src/components/IncomeSection";
import CategoryMappingsManager from "@/src/components/CategoryMappingsManager";
import { formatCurrency } from "@/src/utils/currency";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getEndOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function BudgetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMonth = searchParams.get("month") ?? getCurrentMonth();
  const [month, setMonth] = useState(initialMonth);

  const [editingBudget, setEditingBudget] = useState<{
    category: string;
    currentAmount: number;
  } | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editingExpectedIncome, setEditingExpectedIncome] = useState(false);
  const [expectedIncomeInput, setExpectedIncomeInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const PERIODS = [
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Bi-Weekly", value: "bi-weekly" },
    { label: "Monthly", value: "monthly" },
  ] as const;
  type Period = (typeof PERIODS)[number]["value"];
  const [period, setPeriod] = useState<Period>("monthly");

  const periodFactor: number =
    period === "daily" ? 365 / 12 : period === "weekly" ? 52 / 12 : period === "bi-weekly" ? 26 / 12 : 1;

  const dispatch = useAppDispatch();
  const showMappingsManager = useAppSelector((state) => state.ui.categoryMappingsOpen);

  const { accountsLoaded } = useAppSelector((state) => state.plaid);

  const { data: groupsData, isLoading: groupsLoading } = useBudgetGroups();
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary(month);
  const { data: health, isLoading: healthLoading } = useBudgetHealth(month);
  const { data: incomeStatus } = useIncomeStatus(month);
  const { data: settingsData } = useBudgetSettings(month);

  const mutateBudget = useMutateBudget();
  const mutateSettings = useMutateBudgetSettings();
  const mutateBudgetCategory = useMutateBudgetCategory();
  const reorderBudgetCategories = useReorderBudgetCategories();
  const seedGroups = useSeedBudgetGroups();

  const hasIncome = incomeStatus?.hasIncome ?? false;
  const showIncomePrompt = !groupsLoading && groupsData?.groups && groupsData.groups.length === 0;

  if (!accountsLoaded) {
    return (
      <div className="flex-1 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-space-indigo-100" />
        <div className="h-64 animate-pulse rounded-lg bg-space-indigo-50" />
      </div>
    );
  }

  if (showIncomePrompt) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-2 text-lg font-semibold text-space-indigo-800">
          Budget Not Set Up
        </p>
        <p className="mb-4 max-w-md text-sm text-space-indigo-400">
          Seed your budget groups to get started. Categories will be
          automatically assigned based on your existing transactions. You can
          always reassign them later.
        </p>
        <button
          onClick={() => seedGroups.mutate()}
          disabled={seedGroups.isPending}
          className="rounded-lg bg-space-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        >
          {seedGroups.isPending ? "Setting up..." : "Set Up 50/20/30 Budget"}
        </button>
      </div>
    );
  }

  function handleAcceptSuggestion(category: string, suggestedAmount: number) {
    const group = groups.find((g) =>
      g.categories.some((c) => c.category === category)
    );
    if (!group) return;

    mutateBudget.mutate({
      month,
      budgets: [
        {
          groupId: group.groupId,
          category,
          plannedAmount: suggestedAmount,
        },
      ],
    });
  }

  function handleToggleBudgetCategory(category: string, isBudgeted: boolean) {
    mutateBudgetCategory.mutate({ name: category, isBudgeted });
  }

  function handleReorderCategories(orderedNames: string[]) {
    reorderBudgetCategories.mutate({ orderedNames });
  }

  const groups = summary?.groups ?? [];
  const isLoading = summaryLoading || healthLoading || groupsLoading;

  function handleEditCategory(category: string) {
    const current = groups
      .flatMap((g) => g.categories)
      .find((c) => c.category === category);

    setEditingBudget({
      category,
      currentAmount: current?.plannedAmount ?? 0,
    });
    setEditAmount(String(current?.plannedAmount ?? 0));
  }

  function handleSaveBudget() {
    if (!editingBudget) return;

    const amount = Math.round(parseFloat(editAmount) * 100) / 100;
    if (isNaN(amount) || amount < 0) return;

    const group = groups.find((g) =>
      g.categories.some((c) => c.category === editingBudget.category)
    );

    if (!group) return;

    mutateBudget.mutate({
      month,
      budgets: [
        {
          groupId: group.groupId,
          category: editingBudget.category,
          plannedAmount: amount,
        },
      ],
    });

    setEditingBudget(null);
    setEditAmount("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MonthSelector
          value={month}
          onChange={(m) => {
            setMonth(m);
            setEditingBudget(null);
            const params = new URLSearchParams(searchParams.toString());
            if (m === getCurrentMonth()) {
              params.delete("month");
            } else {
              params.set("month", m);
            }
            const query = params.toString();
            router.replace(`/budget${query ? `?${query}` : ""}`, { scroll: false });
          }}
        />
        <div className="flex gap-2">
          <Link
            href="/budget/goals"
            className="rounded-lg bg-ocean-deep-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ocean-deep-600"
          >
            Goals
          </Link>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isEditing
                ? "bg-space-indigo-600 text-white hover:bg-space-indigo-700"
                : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
            }`}
          >
            {isEditing ? "Done" : "Edit"}
          </button>
          <button
            onClick={() => dispatch(setCategoryMappingsOpen(!showMappingsManager))}
            className="rounded-lg bg-space-indigo-50 px-3 py-1.5 text-xs font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
          >
            {showMappingsManager ? "Close Mappings" : "Category Mappings"}
          </button>
        </div>
      </div>

      {hasIncome && (
        <div className="rounded-lg border border-space-indigo-100 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-space-indigo-600">
                Expected Monthly Income
              </span>
              {editingExpectedIncome ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-space-indigo-600">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={expectedIncomeInput}
                    onChange={(e) => setExpectedIncomeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const amount = Math.round(parseFloat(expectedIncomeInput) * 100) / 100;
                        if (!isNaN(amount) && amount >= 0) {
                          mutateSettings.mutate({ month, expectedIncome: amount });
                        }
                        setEditingExpectedIncome(false);
                      }
                    }}
                    className="w-32 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const amount = Math.round(parseFloat(expectedIncomeInput) * 100) / 100;
                      if (!isNaN(amount) && amount >= 0) {
                        mutateSettings.mutate({ month, expectedIncome: amount });
                      }
                      setEditingExpectedIncome(false);
                    }}
                    className="rounded-md bg-space-indigo-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-space-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingExpectedIncome(false)}
                    className="rounded-md px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => {
                    setExpectedIncomeInput(String(settingsData?.expectedIncome ?? 0));
                    setEditingExpectedIncome(true);
                  }}
                  className={`cursor-pointer text-xs font-semibold hover:text-cornflower-blue-600 ${
                    settingsData?.expectedIncome
                      ? "text-space-indigo-700"
                      : "text-space-indigo-300"
                  }`}
                >
                  {settingsData?.expectedIncome
                    ? formatCurrency(settingsData.expectedIncome)
                    : "Set expected income"}
                </span>
              )}
            </div>
            {settingsData?.expectedIncome && settingsData.expectedIncome > 0 && health && (
              <span className={`text-xs font-medium ${
                health.totalIncome >= settingsData.expectedIncome
                  ? "text-emerald-600"
                  : "text-red-500"
              }`}>
                {formatCurrency(health.totalIncome)} actual
              </span>
            )}
          </div>
        </div>
      )}

      {showMappingsManager && (
        <CategoryMappingsManager onClose={() => dispatch(setCategoryMappingsOpen(false))} month={month} />
      )}

      {!hasIncome && (
        <IncomeBanner
          month={month}
          onMarkIncome={() => {
            const startDate = `${month}-01`;
            const endDate = getEndOfMonth(month);
            router.push(`/transactions?markIncome=true&startDate=${startDate}&endDate=${endDate}`);
          }}
        />
      )}

      {hasIncome && !healthLoading && health && (
        <IncomeSection totalIncome={health.totalIncome} expectedIncome={health.expectedIncome} />
      )}

      {editingBudget && (
        <div className="rounded-lg border border-space-indigo-200 bg-space-indigo-50 p-4">
          <p className="mb-2 text-sm font-medium text-space-indigo-800">
            Set budget for <span className="font-semibold">{editingBudget.category}</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-space-indigo-600">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveBudget();
              }}
              className="w-32 rounded-md border border-space-indigo-200 px-3 py-1.5 text-sm text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleSaveBudget}
              disabled={mutateBudget.isPending}
              className="rounded-md bg-space-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
            >
              {mutateBudget.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditingBudget(null)}
              className="rounded-md px-3 py-1 text-xs text-space-indigo-500 transition-colors hover:bg-space-indigo-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg bg-space-indigo-50"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-1">
            {PERIODS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === value
                    ? "bg-ocean-deep-500 text-white"
                    : "bg-ocean-deep-50 text-ocean-deep-600 hover:bg-ocean-deep-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {groups.map((group) => {
              const adjusted = {
                ...group,
                targetAmount: Math.round(group.targetAmount / periodFactor),
                plannedAmount: Math.round(group.plannedAmount / periodFactor),
                actualAmount: Math.round(group.actualAmount / periodFactor),
                allocatedAmount: Math.round(group.allocatedAmount / periodFactor),
                unallocatedAmount: Math.round(group.unallocatedAmount / periodFactor),
                unbudgetedAmount: Math.round(group.unbudgetedAmount / periodFactor),
                unbudgetedCategories: group.unbudgetedCategories.map((c) => ({
                  ...c,
                  actualAmount: Math.round(c.actualAmount / periodFactor),
                })),
                categories: group.categories.map((c) => ({
                  ...c,
                  plannedAmount: Math.round(c.plannedAmount / periodFactor),
                  actualAmount: Math.round(c.actualAmount / periodFactor),
                  remaining: Math.round(c.remaining / periodFactor),
                  carryoverFromPrevious: Math.round(c.carryoverFromPrevious / periodFactor),
                  suggestedAmount: Math.round(c.suggestedAmount / periodFactor),
                })),
              };
              return (
                <BudgetEnvelopeCard
                  key={`${group.groupId}-${month}`}
                  group={adjusted}
                  month={month}
                  isEditing={isEditing}
                  onEditCategory={handleEditCategory}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onToggleBudgetCategory={handleToggleBudgetCategory}
                  onReorderCategories={handleReorderCategories}
                />
              );
            })}
          </div>

          {!healthLoading && health && (
            <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-space-indigo-800">
                Monthly Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-space-indigo-400">Income</p>
                  <p className="font-semibold text-emerald-600">
                    {formatCurrency(health.totalIncome)}
                  </p>
                  {health.expectedIncome > 0 && (
                    <p className="text-[10px] text-space-indigo-400">
                      of {formatCurrency(health.expectedIncome)} expected
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-space-indigo-400">Expenses</p>
                  {health.totalExpenses > 0 ? (
                    <Link
                      href={`/transactions?startDate=${month}-01&endDate=${getEndOfMonth(month)}&transactionType=expense`}
                      className="font-semibold text-red-500 hover:text-cornflower-blue-600 hover:underline"
                    >
                      {formatCurrency(health.totalExpenses)}
                    </Link>
                  ) : (
                    <p className="font-semibold text-red-500">
                      {formatCurrency(health.totalExpenses)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-space-indigo-400">Savings</p>
                  {health.savingsGroupActual > 0 ? (
                    <Link
                      href={`/transactions?startDate=${month}-01&endDate=${getEndOfMonth(month)}&transactionType=expense`}
                      className="font-semibold text-ocean-deep-600 hover:text-cornflower-blue-600 hover:underline"
                    >
                      {formatCurrency(health.savingsGroupActual)}
                    </Link>
                  ) : (
                    <p className="font-semibold text-ocean-deep-600">
                      {formatCurrency(health.savingsGroupActual)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-space-indigo-400">
                    {health.net >= 0 ? "Surplus" : "Deficit"}
                  </p>
                  <p
                    className={`font-semibold ${
                      health.net >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {formatCurrency(Math.abs(health.net))}
                  </p>
                </div>
              </div>
              <div className="mt-3 border-t border-space-indigo-50 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-space-indigo-400">Savings Rate</span>
                  <span className="font-semibold text-space-indigo-700">
                    {health.savingsRate}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-space-indigo-100">
                  <div
                    className="h-full rounded-full bg-ocean-deep-400 transition-all"
                    style={{ width: `${Math.min(health.savingsRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BudgetPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
      <div>
        <Link
          href="/"
          className="text-sm text-cornflower-blue-500 hover:text-cornflower-blue-600"
        >
          &larr; Back to accounts
        </Link>
        <h1 className="mt-2 text-xl font-bold text-space-indigo-800">Budget</h1>
      </div>

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-lg bg-space-indigo-50" />
        }
      >
        <BudgetContent />
      </Suspense>
    </main>
  );
}
