"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import BackButton from "@/src/components/BackButton";
import ChartCarousel from "@/src/components/ChartCarousel";
import CategoryComparisonChart from "@/src/components/CategoryComparisonChart";
import PlannedVsActualChart from "@/src/components/PlannedVsActualChart";
import ComparisonDeltaTable, {
  type CategoryDelta,
} from "@/src/components/ComparisonDeltaTable";
import BudgetCategoryModal from "@/src/components/BudgetCategoryModal";
import { useAppSelector } from "@/src/lib/hooks";
import { useBudgetComparison } from "@/src/hooks/useBudgetComparison";
import { useMutateBudget } from "@/src/hooks/useMutateBudget";
import { getLastMonths } from "@/src/lib/month-utils";
import { CHART_COLORS } from "@/src/utils/chart-colors";
import type { ComparisonCategory } from "@/src/types/budget";

const WINDOW_OPTIONS = [3, 6, 12] as const;
const MAX_LINES = 6;

function formatMonthLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function totalActual(category: ComparisonCategory): number {
  return category.monthly.reduce((sum, m) => sum + m.actual, 0);
}

function ComparisonBody({
  count,
  onCountChange,
}: {
  count: number;
  onCountChange: (next: number) => void;
}) {
  const { accountsLoaded } = useAppSelector((state) => state.plaid);
  const months = useMemo(() => getLastMonths(count), [count]);
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1]);
  const [selectedNames, setSelectedNames] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{
    category: string;
    groupId: string;
    currentAmount: number;
  } | null>(null);

  const { data, isLoading } = useBudgetComparison(months);
  const mutateBudget = useMutateBudget();

  const allCategories = useMemo(
    () => data?.groups.flatMap((g) => g.categories) ?? [],
    [data]
  );
  const anyData = data && data.groups.length > 0;

  const autoSelected = useMemo(
    () =>
      [...allCategories]
        .sort((a, b) => totalActual(b) - totalActual(a))
        .slice(0, MAX_LINES)
        .map((c) => c.category),
    [allCategories]
  );

  const visibleNames = useMemo(() => {
    const base = selectedNames ?? autoSelected;
    return base.filter((name) => allCategories.some((c) => c.category === name));
  }, [selectedNames, autoSelected, allCategories]);

  const toggleCategory = useCallback(
    (name: string) => {
      setSelectedNames((prev) => {
        const current = prev ?? autoSelected;
        return current.includes(name)
          ? current.filter((n) => n !== name)
          : [...current, name];
      });
    },
    [autoSelected]
  );

  const selectedCategories = useMemo(
    () => visibleNames.map((name) => allCategories.find((c) => c.category === name)),
    [visibleNames, allCategories]
  );

  const rows: CategoryDelta[] = useMemo(() => {
    const lastIdx = months.length - 1;
    const prevIdx = lastIdx - 1;
    return allCategories.map((c) => {
      const last = c.monthly[lastIdx] ?? { planned: 0, actual: 0 };
      const prev = c.monthly[prevIdx] ?? { planned: 0, actual: 0 };
      const delta = last.actual - prev.actual;
      const pctChange =
        prev.actual !== 0
          ? (delta / prev.actual) * 100
          : last.actual !== 0
            ? 100
            : 0;
      const anchor = c.monthly.find((m) => m.month === selectedMonth);
      return {
        category: c.category,
        groupName: c.groupName,
        groupId: c.groupId,
        latestPlanned: last.planned,
        latestActual: last.actual,
        prevActual: prev.actual,
        delta,
        pctChange,
        plannedAtAnchor: anchor?.planned ?? 0,
        isVisible: visibleNames.includes(c.category),
      };
    });
  }, [allCategories, months, selectedMonth, visibleNames]);

  const series = useMemo(
    () =>
      selectedCategories
        .filter((c): c is ComparisonCategory => Boolean(c))
        .map((c, i) => ({
          name: c.category,
          color: CHART_COLORS[i % CHART_COLORS.length],
          values: months.map(
            (month) => c.monthly.find((m) => m.month === month)?.actual ?? 0
          ),
        })),
    [selectedCategories, months]
  );

  const anchorLabel = useMemo(() => formatMonthLong(selectedMonth), [selectedMonth]);

  const barEntries = useMemo(
    () =>
      selectedCategories
        .filter((c): c is ComparisonCategory => Boolean(c))
        .map((c) => {
          const anchor = c.monthly.find((m) => m.month === selectedMonth);
          return {
            name: c.category,
            planned: anchor?.planned ?? 0,
            actual: anchor?.actual ?? 0,
          };
        }),
    [selectedCategories, selectedMonth]
  );

  const handleSaveEdit = useCallback(
    (amount: number) => {
      if (!editing) return;
      mutateBudget.mutate({
        month: selectedMonth,
        budgets: [
          { groupId: editing.groupId, category: editing.category, plannedAmount: amount },
        ],
        applyToFutureMonths: true,
      });
      setEditing(null);
    },
    [editing, mutateBudget, selectedMonth]
  );

  if (!accountsLoaded) {
    return (
      <div className="flex-1 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-space-indigo-100" />
        <div className="h-64 animate-pulse rounded-xl bg-space-indigo-50" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-space-indigo-50" />
        ))}
      </div>
    );
  }

  if (!anyData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-space-indigo-100 bg-white p-8 py-16 text-center shadow-xs">
        <p className="mb-2 text-lg font-bold text-space-indigo-800">Budget Not Set Up</p>
        <p className="max-w-md text-sm text-space-indigo-500">
          Set up your 50/20/30 budget groups from the Budget page to start comparing
          categories over time.
        </p>
        <Link
          href="/budget"
          className="mt-6 rounded-xl bg-space-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700"
        >
          Go to Budget
        </Link>
      </div>
    );
  }

  const slides: ReactNode[] = [
    <CategoryComparisonChart key="trend" months={months} series={series} />,
    <PlannedVsActualChart
      key="planned-actual"
      entries={barEntries}
      anchorMonthLabel={anchorLabel}
    />,
  ];

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {/* Window + Month controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-space-indigo-100 bg-white p-1 shadow-2xs sm:w-auto">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onCountChange(opt)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-semibold transition-colors sm:flex-none ${
                count === opt
                  ? "bg-ocean-deep-500 text-white shadow-2xs"
                  : "text-ocean-deep-700 hover:bg-ocean-deep-50"
              }`}
            >
              {opt} mo
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {months.map((month) => (
            <button
              key={month}
              type="button"
              onClick={() => setSelectedMonth(month)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                selectedMonth === month
                  ? "bg-space-indigo-600 text-white shadow-2xs"
                  : "border border-space-indigo-200 bg-white text-space-indigo-700 hover:bg-space-indigo-50"
              }`}
            >
              {formatMonthShort(month)}
            </button>
          ))}
        </div>
      </div>

      {/* Category toggle chips */}
      {allCategories.length > 0 && (
        <div className="rounded-xl border border-space-indigo-100 bg-white p-3 shadow-2xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-space-indigo-600">Categories</span>
            {selectedNames && (
              <button
                type="button"
                onClick={() => setSelectedNames(null)}
                className="text-xs font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allCategories.map((c) => {
              const active = visibleNames.includes(c.category);
              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => toggleCategory(c.category)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-space-indigo-600 text-white"
                      : "border border-space-indigo-200 bg-white text-space-indigo-600 hover:bg-space-indigo-50"
                  }`}
                >
                  {c.category}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts carousel */}
      <ChartCarousel slides={slides} />

      {/* Delta table */}
      <ComparisonDeltaTable
        rows={rows}
        anchorMonthLabel={anchorLabel}
        onEdit={(row) =>
          setEditing({
            category: row.category,
            groupId: row.groupId,
            currentAmount: row.plannedAtAnchor,
          })
        }
      />

      {editing && (
        <BudgetCategoryModal
          key={editing.category}
          isOpen={Boolean(editing)}
          category={editing.category}
          currentAmount={editing.currentAmount}
          anchorMonth={selectedMonth}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
          isPending={mutateBudget.isPending}
        />
      )}
    </div>
  );
}

function ComparisonContent() {
  const [count, setCount] = useState<number>(3);
  return <ComparisonBody key={count} count={count} onCountChange={setCount} />;
}

export default function BudgetComparisonView() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <BackButton fallbackHref="/budget" label="Back" />
        <h1 className="mt-1.5 text-2xl font-extrabold text-space-indigo-900 sm:text-3xl">
          Budget Comparison
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-xl bg-space-indigo-50" />
        }
      >
        <ComparisonContent />
      </Suspense>
    </main>
  );
}
