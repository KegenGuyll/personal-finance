import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildManualTransactionUpdate,
  parseManualTransactionPatch,
} from "@/src/lib/manual-transactions";

/**
 * Edits a manual transaction in place.
 *
 * Scoped to manual entries on purpose: synced transactions are owned by Plaid
 * and keep their own routes (`/api/plaid/transactions/[transactionId]` for the
 * category, `/api/transactions/[id]/link-manual` for linking).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseManualTransactionPatch(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const existing = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!existing) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (existing.manual !== true) {
      return Response.json(
        { error: "Only manual transactions can be edited here" },
        { status: 400 }
      );
    }

    if (parsed.value.accountId !== undefined) {
      const accountItem = await db
        .collection("account_items")
        .findOne({ account_id: parsed.value.accountId });

      if (!accountItem) {
        return Response.json({ error: "Unknown account" }, { status: 400 });
      }
    }

    const { set, unset } = buildManualTransactionUpdate(
      {
        amount: typeof existing.amount === "number" ? existing.amount : 0,
        transaction_type: existing.transaction_type,
      },
      parsed.value
    );

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set }
    );

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    return Response.json({ transaction });
  } catch (error) {
    console.error("Error updating manual transaction:", error);
    return Response.json(
      { error: "Failed to update manual transaction" },
      { status: 500 }
    );
  }
}

/** Discards a manual transaction the user no longer wants to track. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    const result = await db
      .collection("transactions")
      .deleteOne({ transaction_id: id, manual: true });

    if (result.deletedCount === 0) {
      const existing = await db
        .collection("transactions")
        .findOne({ transaction_id: id }, { projection: { _id: 1 } });

      if (existing) {
        return Response.json(
          { error: "Only manual transactions can be discarded here" },
          { status: 400 }
        );
      }

      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting manual transaction:", error);
    return Response.json(
      { error: "Failed to delete manual transaction" },
      { status: 500 }
    );
  }
}
