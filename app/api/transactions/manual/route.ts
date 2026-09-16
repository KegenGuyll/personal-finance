import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildManualTransactionDoc,
  parseManualTransactionInput,
} from "@/src/lib/manual-transactions";

/**
 * Lists manual ("temporary") transactions — entries typed in before Plaid
 * synced the real transaction.
 *
 * A manual entry is deleted as soon as it is linked to a synced transaction
 * (see app/api/transactions/[id]/link-manual), so everything returned here is
 * still awaiting a match.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = request.nextUrl;
    const accountIds = (url.searchParams.get("accountIds") ?? "")
      .split(",")
      .filter(Boolean);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

    const filter: Record<string, unknown> = { manual: true };
    if (accountIds.length > 0) {
      filter.account_id = { $in: accountIds };
    }

    const transactions = await db
      .collection("transactions")
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    return Response.json({ transactions });
  } catch (error) {
    console.error("Error fetching manual transactions:", error);
    return Response.json(
      { error: "Failed to fetch manual transactions" },
      { status: 500 }
    );
  }
}

/** Creates a manual transaction for a purchase Plaid has not synced yet. */
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseManualTransactionInput(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    // The entry has to belong to a real (linked) account, otherwise it would be
    // invisible in every account view and could never be matched.
    const accountItem = await db
      .collection("account_items")
      .findOne({ account_id: parsed.value.accountId });

    if (!accountItem) {
      return Response.json({ error: "Unknown account" }, { status: 400 });
    }

    const doc = buildManualTransactionDoc(parsed.value);
    await db.collection("transactions").insertOne(doc);

    return Response.json({ transaction: doc }, { status: 201 });
  } catch (error) {
    console.error("Error creating manual transaction:", error);
    return Response.json(
      { error: "Failed to create manual transaction" },
      { status: 500 }
    );
  }
}
