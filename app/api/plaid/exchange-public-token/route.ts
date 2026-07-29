import { type NextRequest } from "next/server";
import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { public_token } = await request.json();

    if (!public_token) {
      return Response.json({ error: "public_token is required" }, { status: 400 });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    const { db } = await connectToDatabase();

    await db.collection("plaid_items").updateOne(
      { itemId },
      {
        $set: {
          itemId,
          accessToken,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error exchanging public token:", error);
    return Response.json({ error: "Failed to exchange token" }, { status: 500 });
  }
}
