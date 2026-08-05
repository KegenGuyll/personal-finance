import { NextRequest } from "next/server";
import { type Db, type AnyBulkWriteOperation, type Document } from "mongodb";
import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";

const SYNC_TTL_MS = 5 * 60 * 1000;

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
  const plaidItem = await db
    .collection("plaid_items")
    .findOne({ itemId: accountItem.itemId });

  if (!plaidItem) return;

  const lastSyncedAt = plaidItem.lastSyncedAt
    ? new Date(plaidItem.lastSyncedAt).getTime()
    : 0;

  if (Date.now() - lastSyncedAt < SYNC_TTL_MS) return;

  let hasMore = true;
  let cursor: string | undefined = plaidItem.syncCursor;

  while (hasMore) {
    const syncResponse = await plaidClient.transactionsSync({
      access_token: accountItem.accessToken,
      cursor,
      options: {
        include_personal_finance_category: true,
      },
    });

    const { added, modified, removed, has_more, next_cursor } =
      syncResponse.data;

    const bulkOps: AnyBulkWriteOperation<Document>[] = [];

    for (const txn of added) {
      bulkOps.push({
        updateOne: {
          filter: { transaction_id: txn.transaction_id },
          update: {
            $set: {
              account_id: txn.account_id,
              amount: txn.amount,
              date: txn.date,
              name: txn.name,
              merchant_name: txn.merchant_name,
              category: txn.category,
              pending: txn.pending,
              payment_channel: txn.payment_channel,
              iso_currency_code: txn.iso_currency_code,
              datetime: txn.datetime,
              authorized_date: txn.authorized_date,
            },
          },
          upsert: true,
        },
      });
    }

    for (const txn of modified) {
      const existing = await db
        .collection("transactions")
        .findOne(
          { transaction_id: txn.transaction_id },
          { projection: { userModified: 1 } }
        );

      const setFields: Record<string, unknown> = {
        account_id: txn.account_id,
        amount: txn.amount,
        date: txn.date,
        name: txn.name,
        merchant_name: txn.merchant_name,
        pending: txn.pending,
        payment_channel: txn.payment_channel,
        iso_currency_code: txn.iso_currency_code,
        datetime: txn.datetime,
        authorized_date: txn.authorized_date,
      };

      if (!existing?.userModified) {
        setFields.category = txn.category;
      }

      bulkOps.push({
        updateOne: {
          filter: { transaction_id: txn.transaction_id },
          update: { $set: setFields },
          upsert: true,
        },
      });
    }

    for (const txn of removed) {
      bulkOps.push({
        deleteOne: {
          filter: { transaction_id: txn.transaction_id },
        },
      });
    }

    if (bulkOps.length > 0) {
      await db.collection("transactions").bulkWrite(bulkOps);
    }

    if (added.length > 0) {
      const newNames = [...new Set(added.map((t) => t.name))];
      const patterns = await db
        .collection("income_patterns")
        .find({ name: { $in: newNames } })
        .toArray();

      if (patterns.length > 0) {
        const patternNames = patterns.map((p) => p.name);
        await db.collection("transactions").updateMany(
          {
            transaction_id: { $in: added.map((t) => t.transaction_id) },
            name: { $in: patternNames },
            transaction_type: { $exists: false },
          },
          {
            $set: {
              transaction_type: "income",
              income_category: "Income",
            },
          }
        );
      }
    }

    for (const txn of [...added, ...modified]) {
      await db.collection("account_items").updateOne(
        { account_id: txn.account_id },
        {
          $set: {
            account_id: txn.account_id,
            accessToken: accountItem.accessToken,
            itemId: accountItem.itemId,
          },
        },
        { upsert: true }
      );
    }

    hasMore = has_more;
    cursor = next_cursor;
  }

  await db.collection("plaid_items").updateOne(
    { itemId: accountItem.itemId },
    { $set: { syncCursor: cursor, lastSyncedAt: new Date() } }
  );
}
