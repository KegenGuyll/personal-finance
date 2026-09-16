import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildManualMerge,
  parseLinkManualTransactionInput,
  type LinkSource,
  type LinkTarget,
} from "@/src/lib/manual-transactions";

function toLinkSource(doc: Record<string, unknown>): LinkSource {
  return {
    transaction_id: String(doc.transaction_id),
    name: typeof doc.name === "string" ? doc.name : "",
    amount: typeof doc.amount === "number" ? doc.amount : 0,
    date: typeof doc.date === "string" ? doc.date : "",
    category: Array.isArray(doc.category) ? (doc.category as string[]) : null,
    transaction_type: typeof doc.transaction_type === "string" ? doc.transaction_type : undefined,
    goalId: doc.goalId,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : undefined,
  };
}

function toLinkTarget(doc: Record<string, unknown>): LinkTarget {
  return {
    transaction_id: String(doc.transaction_id),
    amount: typeof doc.amount === "number" ? doc.amount : 0,
    category: Array.isArray(doc.category) ? (doc.category as string[]) : null,
    transaction_type: typeof doc.transaction_type === "string" ? doc.transaction_type : undefined,
    goalId: doc.goalId,
    manualEntryId: typeof doc.manualEntryId === "string" ? doc.manualEntryId : undefined,
  };
}

/**
 * Links a manual ("temporary") transaction to the synced transaction it turned
 * out to be: the manual entry's category, income flag and goal assignment are
 * copied onto the synced row, which also records where they came from, and the
 * manual row is deleted so the purchase is only ever counted once.
 *
 * A manual entry can be linked exactly once. The order below is what makes that
 * true under double clicks and concurrent tabs:
 *
 *   1. validate the pair,
 *   2. atomically claim the manual entry by deleting it (`deleteOne` guarded by
 *      `manual: true`), so only one request can ever own it,
 *   3. merge into the synced row with a compare-and-set on `manualEntryId`, so a
 *      synced row can only absorb one manual entry,
 *   4. restore the claimed manual entry if step 3 lost the race.
 *
 * We deliberately avoid a multi-document transaction: the app cannot assume the
 * configured MongoDB deployment is a replica set. Every failure path above
 * leaves the manual entry either fully linked or fully intact.
 */
export async function POST(
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

    const parsed = parseLinkManualTransactionInput(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const { manualTransactionId } = parsed.value;

    const manual = await db
      .collection("transactions")
      .findOne({ transaction_id: manualTransactionId });

    if (!manual) {
      return Response.json(
        { error: "Manual transaction not found" },
        { status: 404 }
      );
    }

    if (manual.manual !== true) {
      return Response.json(
        { error: "That transaction is not a manual entry" },
        { status: 400 }
      );
    }

    const target = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!target) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (target.manual === true) {
      return Response.json(
        { error: "Manual entries can only be linked to synced transactions" },
        { status: 400 }
      );
    }

    const merge = buildManualMerge(toLinkSource(manual), toLinkTarget(target));
    if (!merge.ok) {
      return Response.json({ error: merge.error }, { status: merge.status });
    }

    // Claim the manual entry first — a manual entry can only be linked once.
    const claim = await db
      .collection("transactions")
      .deleteOne({ transaction_id: manualTransactionId, manual: true });

    if (claim.deletedCount !== 1) {
      return Response.json(
        { error: "This manual transaction has already been linked" },
        { status: 409 }
      );
    }

    const merged = await db.collection("transactions").updateOne(
      { transaction_id: id, manualEntryId: { $exists: false } },
      Object.keys(merge.unset).length > 0
        ? { $set: merge.set, $unset: merge.unset }
        : { $set: merge.set }
    );

    if (merged.matchedCount !== 1) {
      // Another request linked a manual entry to this transaction in between.
      // Put the claimed entry back so nothing is lost.
      await db.collection("transactions").insertOne(manual);
      return Response.json(
        { error: "That transaction was just linked to another manual entry" },
        { status: 409 }
      );
    }

    return Response.json({
      success: true,
      transactionId: id,
      merged: merge.mergedFields,
    });
  } catch (error) {
    console.error("Error linking manual transaction:", error);
    return Response.json(
      { error: "Failed to link the manual transaction" },
      { status: 500 }
    );
  }
}
