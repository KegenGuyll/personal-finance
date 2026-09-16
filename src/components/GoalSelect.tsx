"use client";

import type { Goal } from "@/src/types/budget";
import { formatCurrency } from "@/src/utils/currency";

/**
 * The goal picker, shared by the transaction detail page (GoalAssigner) and the
 * manual-transaction form so the same goals, labels and availability maths are
 * used everywhere.
 *
 * `size` exists instead of a free-form `className` on purpose: appending
 * utilities to a shared class string produces conflicting properties whose
 * winner depends on CSS order, not on the caller (see issue #18).
 */
interface GoalSelectProps {
  goals: Goal[];
  /** Empty string means "no goal". */
  value: string;
  onChange: (goalId: string) => void;
  onBlur?: () => void;
  /** Adds a selectable option for the empty value; omit for a disabled prompt. */
  emptyOptionLabel?: string;
  size?: "field" | "compact";
  disabled?: boolean;
  "aria-label"?: string;
}

const SIZE_CLASSES: Record<"field" | "compact", string> = {
  field: "w-full rounded-lg px-3 py-2 text-sm",
  compact: "rounded-md px-2 py-1 text-sm",
};

export function goalAvailableAmount(goal: Goal): number {
  return goal.currentAmount - (goal.spentAmount ?? 0);
}

export default function GoalSelect({
  goals,
  value,
  onChange,
  onBlur,
  emptyOptionLabel,
  size = "field",
  disabled = false,
  "aria-label": ariaLabel,
}: GoalSelectProps) {
  // A stored assignment can point at a goal that has since been archived or
  // deleted. Show it rather than silently dropping the value.
  const knownGoal = goals.some((goal) => String(goal._id) === value);
  const orphanedValue = value && !knownGoal ? value : null;

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      className={`border border-space-indigo-200 bg-white text-space-indigo-800 outline-none focus:border-space-indigo-400 disabled:opacity-50 ${SIZE_CLASSES[size]}`}
    >
      {emptyOptionLabel ? (
        <option value="">{emptyOptionLabel}</option>
      ) : (
        <option value="" disabled>
          Select a goal…
        </option>
      )}

      {orphanedValue && <option value={orphanedValue}>Unavailable goal</option>}

      {goals.map((goal) => (
        <option key={String(goal._id)} value={String(goal._id)}>
          {goal.name} · {formatCurrency(goalAvailableAmount(goal))} available
        </option>
      ))}
    </select>
  );
}
