import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { ObjectId } from "mongodb";

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

    if (!body.goalId) {
      return Response.json(
        { error: "goalId is required" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(body.goalId)) {
      return Response.json(
        { error: "Invalid goalId" },
        { status: 400 }
      );
    }

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    if (transaction.transaction_type === "income") {
      return Response.json(
        { error: "Income transactions cannot be spent from a goal" },
        { status: 400 }
      );
    }

    // Plaid reports money out as a positive amount, and imported inflows or
    // refunds often carry no transaction_type at all. Reject them by sign: the
    // goals aggregation sums $abs(amount), so an incoming refund would
    // otherwise be counted as spending.
    if (transaction.amount <= 0) {
      return Response.json(
        { error: "Only outgoing transactions can be spent from a goal" },
        { status: 400 }
      );
    }

    const goal = await db.collection("goals").findOne({
      _id: new ObjectId(body.goalId),
      deletedAt: { $exists: false },
    });

    if (!goal) {
      return Response.json(
        { error: "Goal not found" },
        { status: 404 }
      );
    }

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      { $set: { goalId: body.goalId } }
    );

    return Response.json({ success: true, goalId: body.goalId });
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
