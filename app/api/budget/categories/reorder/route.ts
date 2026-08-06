import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: { orderedNames: string[] } = await request.json();

    if (!body.orderedNames || !Array.isArray(body.orderedNames)) {
      return Response.json(
        { error: "orderedNames array is required" },
        { status: 400 }
      );
    }

    const ops = body.orderedNames.map((name, index) => ({
      updateOne: {
        filter: { name },
        update: {
          $set: { name, sortOrder: index },
          $setOnInsert: { isBudgeted: true, createdAt: new Date() },
        },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await db.collection("budget_categories").bulkWrite(ops);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error reordering budget categories:", error);
    return Response.json(
      { error: "Failed to reorder budget categories" },
      { status: 500 }
    );
  }
}
