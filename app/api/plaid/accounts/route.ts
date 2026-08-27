import { connectToDatabase } from "@/src/lib/mongodb";
import {
  resolveInstitutionLabel,
  upsertAccountsFromPlaid,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = (await db
      .collection("plaid_items")
      .find({})
      .toArray()) as unknown as PlaidItemDoc[];

    if (items.length === 0) {
      return Response.json({ accounts: [] });
    }

    const allAccounts = [];
    for (const item of items) {
      const accounts = await upsertAccountsFromPlaid(db, item);
      const institutionName = await resolveInstitutionLabel(db, item);

      for (const account of accounts) {
        allAccounts.push({
          ...account,
          itemId: item.itemId,
          institutionName,
        });
      }
    }

    return Response.json({ accounts: allAccounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
