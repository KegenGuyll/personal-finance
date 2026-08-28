import { connectToDatabase } from "@/src/lib/mongodb";
import {
  resolveInstitutionLabel,
  syncItemTransactions,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export interface PlaidSyncItemResult {
  itemId: string;
  label: string;
  status: "synced" | "skipped" | "error";
  added: number;
  modified: number;
  removed: number;
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const items = (await db
      .collection("plaid_items")
      .find({})
      .toArray()) as unknown as PlaidItemDoc[];

    const results: PlaidSyncItemResult[] = [];
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    let totalAdded = 0;

    for (const item of items) {
      const label = await resolveInstitutionLabel(db, item);
      let itemAdded = 0;
      let itemModified = 0;
      let itemRemoved = 0;

      try {
        const status = await syncItemTransactions(db, item, (progress) => {
          itemAdded += progress.added;
          itemModified += progress.modified;
          itemRemoved += progress.removed;
        });

        if (status === "synced") {
          synced++;
        } else {
          skipped++;
        }

        totalAdded += itemAdded;

        results.push({
          itemId: item.itemId,
          label,
          status,
          added: itemAdded,
          modified: itemModified,
          removed: itemRemoved,
        });
      } catch (error) {
        console.error(`Error syncing Plaid item ${item.itemId}:`, error);
        errors++;
        results.push({
          itemId: item.itemId,
          label,
          status: "error",
          added: 0,
          modified: 0,
          removed: 0,
        });
      }
    }

    return Response.json({
      synced,
      skipped,
      errors,
      totalAdded,
      results,
    });
  } catch (error) {
    console.error("Error running Plaid sync:", error);
    return Response.json(
      { error: "Failed to sync Plaid accounts" },
      { status: 500 }
    );
  }
}
