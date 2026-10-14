import type { Goal } from "@/src/types/budget";

/**
 * The amount that has to be set aside each month to hit the target.
 *
 * Only time left from today counts, so a goal that started in the past is not
 * credited with the months it has already run. Months use the average Gregorian
 * length (30.44 days), and the result is rounded to whole dollars — the goals
 * list and the edit form must show the same figure, so this is the single
 * source for both.
 */
export function calcMonthlyContribution(
  goal: Pick<Goal, "targetAmount" | "targetDate" | "startDate" | "currentAmount">
): number {
  const today = new Date();
  const start = goal.startDate
    ? Math.max(today.getTime(), new Date(`${goal.startDate}T00:00:00`).getTime())
    : today.getTime();
  const target = new Date(`${goal.targetDate}T00:00:00`).getTime();

  if (today.getTime() > target) return 0;

  const monthsRemaining = Math.max(1, Math.ceil((target - start) / (30.44 * 24 * 60 * 60 * 1000)));
  const amountNeeded = goal.targetAmount - goal.currentAmount;
  return amountNeeded > 0 ? Math.round(amountNeeded / monthsRemaining) : 0;
}
