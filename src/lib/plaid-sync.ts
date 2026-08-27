import { type Db, type AnyBulkWriteOperation, type Document } from "mongodb";
import { CountryCode } from "plaid";
import { plaidClient } from "@/src/lib/plaid";

export const SYNC_TTL_MS = 5 * 60 * 1000;

export interface PlaidItemDoc {
  itemId: string;
  accessToken: string;
  syncCursor?: string;
  lastSyncedAt?: Date | string;
  institutionName?: string;
  institutionId?: string;
}

export type SyncStatus = "synced" | "skipped";

export interface SyncProgress {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
}

/**
 * Incrementally syncs a single Plaid item's transactions into MongoDB.
 *
 * Rate-limited by SYNC_TTL_MS: if the item was synced recently it is skipped
 * and the cached transactions are returned as-is. Returns "synced" when a pull
 * actually happened, "skipped" when the TTL gate held. When `onProgress` is
 * provided it is called after each sync page is written to MongoDB with the
 * counts of added/modified/removed transactions on that page.
 */
export async function syncItemTransactions(
  db: Db,
  plaidItem: PlaidItemDoc,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncStatus> {
  const lastSyncedAt = plaidItem.lastSyncedAt
    ? new Date(plaidItem.lastSyncedAt).getTime()
    : 0;

  if (Date.now() - lastSyncedAt < SYNC_TTL_MS) return "skipped";

  let hasMore = true;
  let cursor: string | undefined = plaidItem.syncCursor;

  while (hasMore) {
    const syncResponse = await plaidClient.transactionsSync({
      access_token: plaidItem.accessToken,
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

    onProgress?.({
      itemId: plaidItem.itemId,
      added: added.length,
      modified: modified.length,
      removed: removed.length,
    });

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
            accessToken: plaidItem.accessToken,
            itemId: plaidItem.itemId,
          },
        },
        { upsert: true }
      );
    }

    hasMore = has_more;
    cursor = next_cursor;
  }

  await db.collection("plaid_items").updateOne(
    { itemId: plaidItem.itemId },
    { $set: { syncCursor: cursor, lastSyncedAt: new Date() } }
  );

  return "synced";
}

/**
 * Resolves a human-readable label for a Plaid item (e.g. "Chase").
 *
 * Uses the institution name stored at link time; if it is missing (items
 * linked before institution names were persisted), it backfills the name via
 * Plaid's accountsGet + institutionsGetById and stores it for next time.
 * Falls back to a truncated item id if the name cannot be resolved.
 */
export async function resolveInstitutionLabel(
  db: Db,
  item: PlaidItemDoc
): Promise<string> {
  if (item.institutionName) return item.institutionName;

  try {
    const accountsResponse = await plaidClient.accountsGet({
      access_token: item.accessToken,
    });
    const institutionId = accountsResponse.data.item?.institution_id;

    if (institutionId) {
      const institutionsResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      const name = institutionsResponse.data.institution.name;
      await db.collection("plaid_items").updateOne(
        { itemId: item.itemId },
        { $set: { institutionName: name, institutionId } }
      );
      return name;
    }
  } catch (error) {
    console.error(
      `Error resolving institution for item ${item.itemId}:`,
      error
    );
  }

  return `Item ${item.itemId.slice(0, 8)}`;
}
