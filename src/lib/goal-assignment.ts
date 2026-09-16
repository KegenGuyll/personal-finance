import { type Db, ObjectId } from "mongodb";

export type GoalAssignmentCheck =
  | { ok: true; goalId: string }
  | { ok: false; status: number; error: string };

/**
 * Rules for "spend from a goal", shared by every route that can set a goal.
 *
 * Extracted from `app/api/transactions/[id]/goal` so the manual-transaction
 * create/update routes apply exactly the same restrictions instead of a second
 * copy that can drift:
 *
 * - a goal id has to be a valid id for an existing, non-deleted goal;
 * - income cannot be goal-funded — the goals aggregate would otherwise count a
 *   deposit as spending;
 * - nor can inflows/refunds, which are identified by sign: Plaid reports money
 *   out as a positive amount, and `amount <= 0` would be summed as spending by
 *   the goal aggregate.
 */
export async function validateGoalAssignment(
  db: Db,
  goalId: unknown,
  options: { amount: number; transactionType?: unknown }
): Promise<GoalAssignmentCheck> {
  if (typeof goalId !== "string" || !goalId.trim()) {
    return { ok: false, status: 400, error: "goalId is required" };
  }

  const id = goalId.trim();
  if (!ObjectId.isValid(id)) {
    return { ok: false, status: 400, error: "Invalid goalId" };
  }

  if (options.transactionType === "income") {
    return {
      ok: false,
      status: 400,
      error: "Income transactions cannot be spent from a goal",
    };
  }

  if (!(options.amount > 0)) {
    return {
      ok: false,
      status: 400,
      error: "Only outgoing transactions can be spent from a goal",
    };
  }

  const goal = await db.collection("goals").findOne({
    _id: new ObjectId(id),
    deletedAt: { $exists: false },
  });

  if (!goal) {
    return { ok: false, status: 404, error: "Goal not found" };
  }

  return { ok: true, goalId: id };
}
