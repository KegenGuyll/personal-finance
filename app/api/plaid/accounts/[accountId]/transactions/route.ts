import { NextRequest } from "next/server";
import { type Db } from "mongodb";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  syncItemTransactions,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const { db } = await connectToDatabase();

    const accountItem = (await db
      .collection("account_items")
      .findOne({ account_id: accountId })) as {
      accessToken: string;
      itemId: string;
    } | null;

    if (!accountItem) {
      return Response.json({
        transactions: [],
        hasNext: false,
        nextOffset: null,
      });
    }

    await syncIfStale(db, accountItem);

    const url = request.nextUrl;
    const query = url.searchParams.get("q") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
    const offset = Number(url.searchParams.get("offset")) || 0;

    const exclude = url.searchParams.get("exclude");

    const filter: Record<string, unknown> = {
      account_id: accountId,
    };

    if (exclude) {
      filter.transaction_id = { $ne: exclude };
    }

    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> =
        (filter.date as Record<string, unknown>) ?? {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.date = dateFilter;
    }

    const conditions: Record<string, unknown>[] = [];

    if (query.trim()) {
      const escaped = escapeRegex(query.toLowerCase());
      conditions.push({
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { merchant_name: { $regex: escaped, $options: "i" } },
          { category: { $regex: escaped, $options: "i" } },
        ],
      });
    }

    if (category) {
      conditions.push({ category });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [total, transactions] = await Promise.all([
      db.collection("transactions").countDocuments(filter),
      db
        .collection("transactions")
        .find(filter)
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);

    const nextOffset = offset + transactions.length;
    const hasNext = nextOffset < total;

    return Response.json({ transactions, hasNext, nextOffset });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return Response.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

async function syncIfStale(
  db: Db,
  accountItem: { accessToken: string; itemId: string }
) {
  const plaidItem = (await db
    .collection("plaid_items")
    .findOne({ itemId: accountItem.itemId })) as PlaidItemDoc | null;

  if (!plaidItem) return;

  await syncItemTransactions(db, plaidItem);
}
