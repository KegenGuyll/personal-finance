import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import type { Budget } from "@/src/types/budget";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");

    if (!month) {
      return Response.json(
        { error: "month query parameter is required (YYYY-MM)" },
        { status: 400 }
      );
    }

    const budgets = await db
      .collection<Budget>("budgets")
      .find({ month })
      .toArray();

    return Response.json({ budgets });
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return Response.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      month: string;
      budgets: { groupId: string; category: string; plannedAmount: number }[];
      applyToFuture?: boolean;
    } = await request.json();

    if (!body.month || !body.budgets || !Array.isArray(body.budgets)) {
      return Response.json(
        { error: "month and budgets array are required" },
        { status: 400 }
      );
    }

    const { ObjectId } = await import("mongodb");

    function getMonthKey(month: string, offset: number): string {
      const [y, m] = month.split("-").map(Number);
      const d = new Date(y, m - 1 + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    const operationMonths = body.applyToFuture
      ? [body.month, ...Array.from({ length: 12 }, (_, i) => getMonthKey(body.month, i + 1))]
      : [body.month];

    const allOps = operationMonths.flatMap((m) =>
      body.budgets.map((b) => ({
        updateOne: {
          filter: { month: m, category: b.category },
          update: {
            $set: {
              month: m,
              groupId: new ObjectId(b.groupId),
              category: b.category,
              plannedAmount: b.plannedAmount,
              carryoverFromPrevious: 0,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      }))
    );

    if (allOps.length > 0) {
      await db.collection("budgets").bulkWrite(allOps);
    }

    const budgets = await db
      .collection<Budget>("budgets")
      .find({ month: body.month })
      .toArray();

    return Response.json({ budgets });
  } catch (error) {
    console.error("Error updating budgets:", error);
    return Response.json(
      { error: "Failed to update budgets" },
      { status: 500 }
    );
  }
}
