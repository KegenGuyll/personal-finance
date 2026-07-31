"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useGoals } from "@/src/hooks/useGoals";
import GoalCard from "@/src/components/GoalCard";
import GoalForm from "@/src/components/GoalForm";

function GoalsContent() {
  const { data, isLoading } = useGoals();
  const [showForm, setShowForm] = useState(false);

  const goals = data?.goals ?? [];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-space-indigo-600">
          {goals.length === 0
            ? "No goals yet"
            : `${goals.length} goal${goals.length > 1 ? "s" : ""}`}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-space-indigo-50 px-3 py-1.5 text-xs font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
        >
          {showForm ? "Cancel" : "New Goal"}
        </button>
      </div>

      {showForm && <GoalForm onClose={() => setShowForm(false)} />}

      {goals.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-space-indigo-400">
            No savings goals set up yet.
          </p>
          <p className="mt-1 text-xs text-space-indigo-300">
            Create a goal to track your progress toward a target amount.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((goal) => (
          <GoalCard key={goal._id} goal={goal} />
        ))}
      </div>
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
