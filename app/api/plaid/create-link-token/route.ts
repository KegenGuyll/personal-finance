import { type NextRequest } from "next/server";
import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";
import { CountryCode, Products } from "plaid";
import type { PlaidItemDoc } from "@/src/lib/plaid-sync";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      itemId?: string;
    };
    const { itemId } = body;

    // Update mode: add/remove accounts on an existing Item. The Item's
    // access_token never leaves the server.
    if (itemId) {
      const { db } = await connectToDatabase();
      const item = (await db
        .collection("plaid_items")
        .findOne({ itemId })) as PlaidItemDoc | null;

      if (!item) {
        return Response.json({ error: "Item not found" }, { status: 404 });
      }

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: "single-user" },
        client_name: "Personal Finance",
        country_codes: [CountryCode.Us],
        language: "en",
        access_token: item.accessToken,
        update: { account_selection_enabled: true },
      });

      return Response.json({ link_token: response.data.link_token });
    }

    // Add mode: first-time connection.
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "single-user" },
      client_name: "Personal Finance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Error creating link token:", error);
    return Response.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
