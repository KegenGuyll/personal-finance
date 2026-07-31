import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      {
        $set: {
          transaction_type: "income",
          income_category: "Income",
        },
      }
    );

    await db.collection("income_patterns").updateOne(
      { name: transaction.name },
      {
        $set: {
          name: transaction.name,
          incomeCategory: "Income",
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return Response.json({ success: true, pattern: transaction.name });
  } catch (error) {
    console.error("Error marking transaction as income:", error);
    return Response.json(
      { error: "Failed to mark transaction as income" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();

    const transaction = await db
      .collection("transactions")
      .findOne({ transaction_id: id });

    if (!transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    await db.collection("transactions").updateOne(
      { transaction_id: id },
      {
        $unset: { transaction_type: "", income_category: "" },
      }
    );

    await db.collection("income_patterns").deleteOne({
      name: transaction.name,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error unmarking income transaction:", error);
    return Response.json(
      { error: "Failed to unmark income transaction" },
      { status: 500 }
    );
  }
}
