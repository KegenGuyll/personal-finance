import { type NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  resolveInstitutionLabel,
  syncItemTransactions,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export async function POST(request: NextRequest) {
  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return Response.json({ error: "itemId is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const item = (await db
      .collection("plaid_items")
      .findOne({ itemId })) as unknown as PlaidItemDoc | null;

    if (!item) {
      return Response.json({ error: "Item not found" }, { status: 404 });
    }

    const label = await resolveInstitutionLabel(db, item);

    let added = 0;
    let modified = 0;
    let removed = 0;

    const status = await syncItemTransactions(db, item, (progress) => {
      added += progress.added;
      modified += progress.modified;
      removed += progress.removed;
    });

    return Response.json({
      itemId: item.itemId,
      label,
      status,
      added,
      modified,
      removed,
    });
  } catch (error) {
    console.error("Error syncing item:", error);
    return Response.json({ error: "Failed to sync item" }, { status: 500 });
  }
}
