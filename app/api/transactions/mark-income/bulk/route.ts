import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: { name: string; transactionIds: string[] } =
      await request.json();

    if (!body.name || !body.transactionIds || !Array.isArray(body.transactionIds) || body.transactionIds.length === 0) {
      return Response.json(
        { error: "name and transactionIds array are required" },
        { status: 400 }
      );
    }

    await db.collection("transactions").updateMany(
      { transaction_id: { $in: body.transactionIds } },
      {
        $set: {
          transaction_type: "income",
          income_category: "Income",
        },
      }
    );

    await db.collection("income_patterns").updateOne(
      { name: body.name },
      {
        $set: {
          name: body.name,
          incomeCategory: "Income",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return Response.json({
      success: true,
      marked: body.transactionIds.length,
      pattern: body.name,
    });
  } catch (error) {
    console.error("Error bulk marking income:", error);
    return Response.json(
      { error: "Failed to mark transactions as income" },
      { status: 500 }
    );
  }
}
