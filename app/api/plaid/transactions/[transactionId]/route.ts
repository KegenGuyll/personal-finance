import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params;

  try {
    const { db } = await connectToDatabase();

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: transactionId });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return Response.json({ transaction });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return Response.json(
      { error: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params;

  try {
    const { db } = await connectToDatabase();
    const { category, applyToAll }: { category: string[]; applyToAll: boolean } =
      await request.json();

    if (!category || !Array.isArray(category)) {
      return Response.json(
        { error: "Category must be an array of strings" },
        { status: 400 }
      );
    }

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: transactionId });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    if (applyToAll) {
      await db.collection("transactions").updateMany(
        {
          account_id: transaction.account_id,
          name: transaction.name,
        },
        {
          $set: { category, userModified: true },
        }
      );
    } else {
      await db.collection("transactions").updateOne(
        { transaction_id: transactionId },
        { $set: { category, userModified: true } }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating transaction:", error);
    return Response.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}
