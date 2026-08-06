import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { DEFAULT_CATEGORY_SORT_ORDER } from "@/src/lib/budget-pipeline";
import type { BudgetCategory } from "@/src/types/budget";

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const categories = await db
      .collection<BudgetCategory>("budget_categories")
      .find({})
      .sort({ name: 1 })
      .toArray();

    return Response.json({
      categories: categories.map((c) => ({
        ...c,
        sortOrder: c.sortOrder ?? DEFAULT_CATEGORY_SORT_ORDER,
      })),
    });
  } catch (error) {
    console.error("Error fetching budget categories:", error);
    return Response.json(
      { error: "Failed to fetch budget categories" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: { name: string; isBudgeted: boolean } = await request.json();

    if (!body.name || typeof body.isBudgeted !== "boolean") {
      return Response.json(
        { error: "name and isBudgeted are required" },
        { status: 400 }
      );
    }

    await db.collection("budget_categories").updateOne(
      { name: body.name },
      {
        $set: { name: body.name, isBudgeted: body.isBudgeted },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating budget category:", error);
    return Response.json(
      { error: "Failed to update budget category" },
      { status: 500 }
    );
  }
}
