import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = await db.collection("plaid_items").find({}).toArray();

    if (items.length === 0) {
      return Response.json({ accounts: [] });
    }

    const allAccounts = [];
    for (const item of items) {
      const response = await plaidClient.accountsGet({
        access_token: item.accessToken,
      });
      const accounts = response.data.accounts;
      allAccounts.push(...accounts);

      for (const account of accounts) {
        await db.collection("account_items").updateOne(
          { account_id: account.account_id },
          { $set: { account_id: account.account_id, accessToken: item.accessToken, itemId: item.itemId } },
          { upsert: true }
        );
      }
    }

    return Response.json({ accounts: allAccounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
