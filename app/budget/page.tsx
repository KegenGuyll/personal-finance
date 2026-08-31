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
import { useGoals } from "@/src/hooks/useGoals";
import MonthSelector from "@/src/components/MonthSelector";
import BudgetEnvelopeCard from "@/src/components/BudgetEnvelopeCard";
import IncomeBanner from "@/src/components/IncomeBanner";
import IncomeSection from "@/src/components/IncomeSection";
import CategoryMappingsManager from "@/src/components/CategoryMappingsManager";
import BudgetCategoryModal from "@/src/components/BudgetCategoryModal";
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

const PERIODS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Bi-Weekly", value: "bi-weekly" },
  { label: "Monthly", value: "monthly" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function BudgetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMonth = searchParams.get("month") ?? getCurrentMonth();
  const [month, setMonth] = useState(initialMonth);

  const [editingBudget, setEditingBudget] = useState<{
    category: string;
    currentAmount: number;
  } | null>(null);
  const [editingExpectedIncome, setEditingExpectedIncome] = useState(false);
  const [expectedIncomeInput, setExpectedIncomeInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
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
  const { data: goalsData } = useGoals({ month, includeDeleted: true });

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
        <div className="h-64 animate-pulse rounded-xl bg-space-indigo-50" />
      </div>
    );
  }

  if (showIncomePrompt) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-space-indigo-100 bg-white p-8 py-16 text-center shadow-xs">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-space-indigo-50 text-space-indigo-600">
          <span className="text-xl">📊</span>
        </div>
        <p className="mb-2 text-lg font-bold text-space-indigo-800">
          Budget Not Set Up
        </p>
        <p className="mb-6 max-w-md text-sm text-space-indigo-500">
          Seed your 50/20/30 budget groups to get started. Categories will be
          automatically assigned based on your existing transactions.
        </p>
        <button
          onClick={() => seedGroups.mutate()}
          disabled={seedGroups.isPending}
          className="rounded-xl bg-space-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700 active:bg-space-indigo-800 disabled:opacity-50"
        >
          {seedGroups.isPending ? "Setting up..." : "Set Up 50/20/30 Budget"}
        </button>
      </div>
    );
  }

  const groups = summary?.groups ?? [];
  const isLoading = summaryLoading || healthLoading || groupsLoading;

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

  function handleEditCategory(category: string) {
    const current = groups
      .flatMap((g) => g.categories)
      .find((c) => c.category === category);

    setEditingBudget({
      category,
      currentAmount: current?.plannedAmount ?? 0,
    });
  }

  function handleSaveBudget(amount: number) {
    if (!editingBudget) return;

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
  }

  function handleSaveExpectedIncome() {
    const amount = Math.round(parseFloat(expectedIncomeInput) * 100) / 100;
    if (!isNaN(amount) && amount >= 0) {
      mutateSettings.mutate({ month, expectedIncome: amount });
    }
    setEditingExpectedIncome(false);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Controls Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link
            href="/budget/goals"
            className="rounded-lg bg-ocean-deep-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-ocean-deep-600 active:bg-ocean-deep-700"
          >
            Goals
          </Link>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isEditing
                ? "bg-space-indigo-600 text-white shadow-2xs hover:bg-space-indigo-700"
                : "border border-space-indigo-200 bg-white text-space-indigo-700 hover:bg-space-indigo-50"
            }`}
          >
            {isEditing ? "Done Editing" : "Edit Categories"}
          </button>
          <button
            onClick={() => dispatch(setCategoryMappingsOpen(!showMappingsManager))}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              showMappingsManager
                ? "bg-space-indigo-100 text-space-indigo-800"
                : "border border-space-indigo-200 bg-white text-space-indigo-700 hover:bg-space-indigo-50"
            }`}
          >
            {showMappingsManager ? "Close Mappings" : "Mappings"}
          </button>
        </div>
      </div>

      {/* Expected Income Bar */}
      {hasIncome && (
        <div className="rounded-xl border border-space-indigo-100 bg-white p-3 shadow-2xs sm:p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-space-indigo-700">
                Expected Monthly Income:
              </span>
              {editingExpectedIncome ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="relative flex items-center">
                    <span className="absolute left-2 text-xs text-space-indigo-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={expectedIncomeInput}
                      onChange={(e) => setExpectedIncomeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveExpectedIncome();
                      }}
                      className="w-28 rounded-lg border border-space-indigo-300 py-1 pl-5 pr-2 text-xs font-bold text-space-indigo-900 focus:border-space-indigo-500 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleSaveExpectedIncome}
                    className="rounded-lg bg-space-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingExpectedIncome(false)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-space-indigo-500 transition-colors hover:bg-space-indigo-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpectedIncomeInput(String(settingsData?.expectedIncome ?? 0));
                    setEditingExpectedIncome(true);
                  }}
                  className={`rounded-md px-1.5 py-0.5 text-xs font-bold transition-colors hover:bg-space-indigo-50 ${
                    settingsData?.expectedIncome
                      ? "text-space-indigo-900 underline-offset-2 hover:underline"
                      : "text-cornflower-blue-600 hover:text-cornflower-blue-700"
                  }`}
                >
                  {settingsData?.expectedIncome
                    ? formatCurrency(settingsData.expectedIncome)
                    : "+ Set expected income"}
                </button>
              )}
            </div>

            {settingsData?.expectedIncome && settingsData.expectedIncome > 0 && health && (
              <span
                className={`text-xs font-semibold ${
                  health.totalIncome >= settingsData.expectedIncome
                    ? "text-emerald-600"
                    : "text-red-500"
                }`}
              >
                {formatCurrency(health.totalIncome)} actual
              </span>
            )}
          </div>
        </div>
      )}

      {/* Category Mappings Modal / Section */}
      {showMappingsManager && (
        <CategoryMappingsManager onClose={() => dispatch(setCategoryMappingsOpen(false))} month={month} />
      )}

      {/* Income Banner (when 0 income) or Income Section */}
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

      {/* Modal for Setting Category Budget Amount */}
      {editingBudget && (
        <BudgetCategoryModal
          key={editingBudget.category}
          isOpen={Boolean(editingBudget)}
          category={editingBudget.category}
          currentAmount={editingBudget.currentAmount}
          onSave={handleSaveBudget}
          onClose={() => setEditingBudget(null)}
          isPending={mutateBudget.isPending}
        />
      )}

      {/* Period Segmented Switcher & Envelope Cards Grid */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl bg-space-indigo-50"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Period Segmented Switcher */}
          <div className="flex w-full overflow-x-auto rounded-xl border border-space-indigo-100 bg-white p-1 shadow-2xs">
            <div className="flex min-w-full gap-1">
              {PERIODS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setPeriod(value)}
                  className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-colors ${
                    period === value
                      ? "bg-ocean-deep-500 text-white shadow-2xs"
                      : "text-ocean-deep-700 hover:bg-ocean-deep-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Envelope Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => {
              const [y, m] = month.split("-").map(Number);
              const daysInMonth = new Date(y, m, 0).getDate();
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
                  dailyLimit: Math.round(c.plannedAmount / daysInMonth),
                })),
              };
              return (
                <BudgetEnvelopeCard
                  key={`${group.groupId}-${month}`}
                  group={adjusted}
                  month={month}
                  isEditing={isEditing}
                  goals={group.name === "Savings" ? goalsData?.goals : undefined}
                  unallocatedSavings={
                    group.name === "Savings" ? goalsData?.unallocated : undefined
                  }
                  periodFactor={periodFactor}
                  onEditCategory={handleEditCategory}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onToggleBudgetCategory={handleToggleBudgetCategory}
                  onReorderCategories={handleReorderCategories}
                />
              );
            })}
          </div>

          {/* Monthly Summary Health Card */}
          {!healthLoading && health && (
            <div className="rounded-xl border border-space-indigo-100 bg-white p-4 shadow-xs sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-space-indigo-800">
                Monthly Financial Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-space-indigo-50/50 p-2.5">
                  <p className="text-[11px] font-medium text-space-indigo-400">Total Income</p>
                  <p className="text-base font-extrabold text-emerald-600">
                    {formatCurrency(health.totalIncome)}
                  </p>
                  {health.expectedIncome > 0 && (
                    <p className="text-[10px] text-space-indigo-400">
                      of {formatCurrency(health.expectedIncome)} exp
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-space-indigo-50/50 p-2.5">
                  <p className="text-[11px] font-medium text-space-indigo-400">Total Expenses</p>
                  {health.totalExpenses > 0 ? (
                    <Link
                      href={`/transactions?startDate=${month}-01&endDate=${getEndOfMonth(month)}&transactionType=expense`}
                      className="text-base font-extrabold text-red-500 underline-offset-2 hover:text-cornflower-blue-600 hover:underline"
                    >
                      {formatCurrency(health.totalExpenses)}
                    </Link>
                  ) : (
                    <p className="text-base font-extrabold text-red-500">
                      {formatCurrency(health.totalExpenses)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-space-indigo-50/50 p-2.5">
                  <p className="text-[11px] font-medium text-space-indigo-400">Total Savings</p>
                  {health.savingsGroupActual > 0 ? (
                    <Link
                      href={`/transactions?startDate=${month}-01&endDate=${getEndOfMonth(month)}&transactionType=expense`}
                      className="text-base font-extrabold text-ocean-deep-600 underline-offset-2 hover:text-cornflower-blue-600 hover:underline"
                    >
                      {formatCurrency(health.savingsGroupActual)}
                    </Link>
                  ) : (
                    <p className="text-base font-extrabold text-ocean-deep-600">
                      {formatCurrency(health.savingsGroupActual)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-space-indigo-50/50 p-2.5">
                  <p className="text-[11px] font-medium text-space-indigo-400">
                    {health.net >= 0 ? "Net Surplus" : "Net Deficit"}
                  </p>
                  <p
                    className={`text-base font-extrabold ${
                      health.net >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {formatCurrency(Math.abs(health.net))}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-space-indigo-50 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-space-indigo-500">Savings Rate</span>
                  <span className="font-bold text-space-indigo-800">
                    {health.savingsRate}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-space-indigo-100">
                  <div
                    className="h-full rounded-full bg-ocean-deep-500 transition-all duration-300"
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Link
          href="/"
          className="text-xs font-semibold text-cornflower-blue-600 underline-offset-2 hover:text-cornflower-blue-700 hover:underline"
        >
          &larr; Back to accounts
        </Link>
        <h1 className="mt-1.5 text-2xl font-extrabold text-space-indigo-900 sm:text-3xl">
          Monthly Budget
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-xl bg-space-indigo-50" />
        }
      >
        <BudgetContent />
      </Suspense>
    </main>
  );
}
