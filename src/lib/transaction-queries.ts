import type { QueryClient } from "@tanstack/react-query";

/**
 * Client-side data helpers shared by the manual-transaction hooks.
 *
 * Creating, editing, linking or discarding a transaction changes almost every
 * derived view in the app (the transaction lists, category breakdowns, spending
 * trend, budgets and goals), so the invalidation list lives here instead of
 * being copy-pasted into each mutation hook.
 */
const TRANSACTION_QUERY_KEYS = [
  "manual-transactions",
  "all-transactions",
  "account-transactions",
  "related-transactions",
  "transaction",
  "transactions-by-name",
  "all-category-stats",
  "category-stats",
  "category-name-stats",
  "spending-trend",
  "budget",
  "budget-summary",
  "budget-health",
  // Budget comparison and the carry-forward preview both read category actuals,
  // and manual entries can be goal-funded spending, so the goal views move too.
  // These are the same roots the existing goal mutations invalidate (see
  // useAssignTransactionGoal).
  "budget-comparison",
  "budget-carry-forward-preview",
  "goals",
  "goal-transactions",
  "income-status",
] as const;

export function invalidateTransactionQueries(
  queryClient: QueryClient,
  extraKeys: readonly string[] = []
): void {
  for (const key of [...TRANSACTION_QUERY_KEYS, ...extraKeys]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Reads the `{ error }` message the API routes return, falling back to a
 * generic message so a non-JSON body never masks the failure.
 */
export async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // fall through to the generic message
  }
  return fallback;
}
