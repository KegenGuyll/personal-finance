import { type NextRequest } from "next/server";
import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  upsertAccountsFromPlaid,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export async function POST(request: NextRequest) {
  try {
    const { itemId } = (await request.json()) as { itemId?: string };

    if (!itemId) {
      return Response.json({ error: "itemId is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const item = (await db
      .collection("plaid_items")
      .findOne({ itemId })) as PlaidItemDoc | null;

    if (!item) {
      return Response.json({ error: "Item not found" }, { status: 404 });
    }

    // Re-pull accounts after the user completed update mode in Link.
    const accounts = await upsertAccountsFromPlaid(db, item);

    // Kick off a backfill for any newly added accounts' transactions. This is
    // async on Plaid's side; the next transactions sync will pick the data up.
    try {
      await plaidClient.transactionsRefresh({
        access_token: item.accessToken,
      });
    } catch (error) {
      console.error(
        `Error refreshing transactions for item ${itemId}:`,
        error
      );
    }

    return Response.json({ accounts });
  } catch (error) {
    console.error("Error updating accounts:", error);
    return Response.json({ error: "Failed to update accounts" }, { status: 500 });
  }
}
