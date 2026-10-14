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
    const body: {
      name?: string;
      isBudgeted?: boolean;
      carryOver?: boolean;
    } = await request.json();

    if (!body.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    if (body.isBudgeted !== undefined && typeof body.isBudgeted !== "boolean") {
      return Response.json(
        { error: "isBudgeted must be a boolean" },
        { status: 400 }
      );
    }
    if (body.carryOver !== undefined && typeof body.carryOver !== "boolean") {
      return Response.json(
        { error: "carryOver must be a boolean" },
        { status: 400 }
      );
    }
    if (body.isBudgeted === undefined && body.carryOver === undefined) {
      return Response.json(
        { error: "isBudgeted or carryOver is required" },
        { status: 400 }
      );
    }

    const set: Record<string, unknown> = { name: body.name };
    const setOnInsert: Record<string, unknown> = { createdAt: new Date() };
    // A caller that flips one switch omits the other, so only ever write the flags it sent.
    if (body.isBudgeted === undefined) setOnInsert.isBudgeted = true;
    else set.isBudgeted = body.isBudgeted;
    if (body.carryOver === undefined) setOnInsert.carryOver = true;
    else set.carryOver = body.carryOver;

    await db.collection("budget_categories").updateOne(
      { name: body.name },
      { $set: set, $setOnInsert: setOnInsert },
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
