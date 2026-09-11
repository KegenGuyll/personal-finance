import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    const transactions = await db
      .collection("transactions")
      .find(
        { goalId: id },
        {
          projection: {
            transaction_id: 1,
            account_id: 1,
            name: 1,
            amount: 1,
            date: 1,
            iso_currency_code: 1,
            pending: 1,
            goalId: 1,
          },
        }
      )
      .sort({ date: -1 })
      .toArray();

    const totalSpent = transactions.reduce(
      (sum, t) => sum + Math.abs(t.amount as number),
      0
    );

    return Response.json({ transactions, totalSpent });
  } catch (error) {
    console.error("Error fetching goal transactions:", error);
    return Response.json(
      { error: "Failed to fetch goal transactions" },
      { status: 500 }
    );
  }
}
