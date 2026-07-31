import { NextRequest } from "next/server";
import { plaidClient } from "@/src/lib/plaid";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const { db } = await connectToDatabase();

    const accountItem = await db
      .collection("account_items")
      .findOne({ account_id: accountId });

    if (!accountItem) {
      return Response.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const response = await plaidClient.accountsGet({
      access_token: accountItem.accessToken,
    });

    const account = response.data.accounts.find(
      (a) => a.account_id === accountId
    );

    if (!account) {
      return Response.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    return Response.json({ account });
  } catch (error) {
    console.error("Error fetching account:", error);
    return Response.json(
      { error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}
