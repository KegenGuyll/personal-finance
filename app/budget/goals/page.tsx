"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useGoals } from "@/src/hooks/useGoals";
import GoalCard from "@/src/components/GoalCard";
import GoalForm from "@/src/components/GoalForm";
import type { Goal } from "@/src/types/budget";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

interface GoalSections {
  active: Goal[];
  completed: Goal[];
  past: Goal[];
  archived: Goal[];
}

function Section({ title, goals }: { title: string; goals: Goal[] }) {
  if (goals.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-space-indigo-400">
          {title}
        </span>
        <div className="h-px flex-1 bg-space-indigo-100" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => (
          <GoalCard key={goal._id} goal={goal} />
        ))}
      </div>
    </div>
  );
}

function GoalsContent() {
  const { data, isLoading } = useGoals({ includeDeleted: true });
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const sections: GoalSections = useMemo(() => {
    const today = todayStr();
    const result: GoalSections = { active: [], completed: [], past: [], archived: [] };
    for (const g of data?.goals ?? []) {
      if (g.deletedAt) {
        result.archived.push(g);
      } else if (g.targetDate < today) {
        result.past.push(g);
      } else if (g.currentAmount >= g.targetAmount) {
        result.completed.push(g);
      } else {
        result.active.push(g);
      }
    }
    result.active.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    return result;
  }, [data]);

  const total = sections.active.length + sections.completed.length + sections.past.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-lg bg-space-indigo-50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-space-indigo-600">
          {total === 0 ? "No goals yet" : `${total} goal${total > 1 ? "s" : ""}`}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-space-indigo-50 px-3 py-1.5 text-xs font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
        >
          {showForm ? "Cancel" : "New Goal"}
        </button>
      </div>

      {showForm && <GoalForm onClose={() => setShowForm(false)} />}

      {total === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-space-indigo-400">
            No savings goals set up yet.
          </p>
          <p className="mt-1 text-xs text-space-indigo-300">
            Create a goal to track your progress toward a target amount.
          </p>
        </div>
      )}

      <Section title="Active" goals={sections.active} />
      <Section title="Completed" goals={sections.completed} />
      <Section title="Past" goals={sections.past} />

      {sections.archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="flex w-full items-center gap-2"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-space-indigo-400 transition-colors hover:text-space-indigo-600">
              <span className={`inline-block text-[9px] transition-transform ${showArchived ? "rotate-90" : ""}`}>
                &#9656;
              </span>{" "}
              Archived ({sections.archived.length})
            </span>
            <div className="h-px flex-1 bg-space-indigo-100" />
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-3 opacity-60 md:grid-cols-2">
              {sections.archived.map((goal) => (
                <GoalCard key={goal._id} goal={goal} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
      <div>
        <Link
          href="/budget"
          className="text-sm text-cornflower-blue-500 hover:text-cornflower-blue-600"
        >
          &larr; Back to budget
        </Link>
        <h1 className="mt-2 text-xl font-bold text-space-indigo-800">
          Savings Goals
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-lg bg-space-indigo-50" />
        }
      >
        <GoalsContent />
      </Suspense>
    </main>
  );
}
