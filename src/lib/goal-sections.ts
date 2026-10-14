import type { Goal } from "@/src/types/budget";

export interface GoalSections {
  active: Goal[];
  completed: Goal[];
  past: Goal[];
  archived: Goal[];
}

export interface ActiveGoalSummary {
  count: number;
  monthlyNeeded: number;
  saved: number;
  target: number;
  remaining: number;
  progressPct: number;
  next: Goal | null;
  savingsThisMonth: number;
  shortfall: number;
}

/**
 * Where each goal belongs on the goals page. The sections and the summary card
 * both read this, so a goal cannot count as active in one and not the other.
 */
export function classifyGoals(goals: Goal[], today: string): GoalSections {
  const sections: GoalSections = {
    active: [],
    completed: [],
    past: [],
    archived: [],
  };

  for (const goal of goals) {
    if (goal.deletedAt) sections.archived.push(goal);
    else if (goal.targetDate < today) sections.past.push(goal);
    else if (goal.currentAmount >= goal.targetAmount) sections.completed.push(goal);
    else sections.active.push(goal);
  }

  sections.active.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return sections;
}

/**
 * Totals for the active goals. `monthlyNeeded` sums the per-goal figures the
 * API already computes, and `shortfall` weighs that against what was actually
 * saved this month — the same comparison the API uses to flag feasibility.
 */
export function summarizeActiveGoals(
  active: Goal[],
  savingsThisMonth: number
): ActiveGoalSummary {
  let monthlyNeeded = 0;
  let saved = 0;
  let target = 0;
  let next: Goal | null = null;

  for (const goal of active) {
    monthlyNeeded += goal.monthlyContribution;
    saved += goal.currentAmount;
    target += goal.targetAmount;
    if (!next || goal.targetDate < next.targetDate) next = goal;
  }

  return {
    count: active.length,
    monthlyNeeded,
    saved,
    target,
    remaining: Math.max(0, target - saved),
    progressPct: target > 0 ? Math.min((saved / target) * 100, 100) : 0,
    next,
    savingsThisMonth,
    shortfall: Math.max(0, monthlyNeeded - savingsThisMonth),
  };
}
