import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { validateGoalAssignment } from "@/src/lib/goal-assignment";

// Marks a transaction as "spent from a goal". The transaction keeps its Plaid
// category but is excluded from all budget/category aggregates (see
// EXCLUDE_GOAL_TRANSACTIONS_MATCH in src/lib/budget-pipeline.ts) and instead
// draws down the goal's saved balance.
//
// NOTE: `goalId` is never written or unset by plaid-sync.ts, so the marker
// survives ordinary transaction updates. Plaid's pending -> posted replacement
// is handled separately: syncItemTransactions copies the assignment onto the
// posted transaction by matching `pending_transaction_id`. A pending row that
// was removed in an earlier sync page cannot be recovered.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    const body: { goalId: string } = await request.json();

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Shared with the manual-transaction routes so the rules cannot drift.
    const assignment = await validateGoalAssignment(db, body.goalId, {
      amount: typeof transaction.amount === "number" ? transaction.amount : 0,
      transactionType: transaction.transaction_type,
    });

    if (!assignment.ok) {
      return Response.json(
        { error: assignment.error },
        { status: assignment.status }
      );
    }

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      { $set: { goalId: assignment.goalId } }
    );

    return Response.json({ success: true, goalId: assignment.goalId });
  } catch (error) {
    console.error("Error assigning transaction to goal:", error);
    return Response.json(
      { error: "Failed to assign transaction to goal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      { $unset: { goalId: "" } }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error unassigning transaction from goal:", error);
    return Response.json(
      { error: "Failed to unassign transaction from goal" },
      { status: 500 }
    );
  }
}
