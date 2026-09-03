import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/src/lib/mongodb";
import { ensureMonthInitialized } from "@/src/lib/budget-pipeline";
import { upsertBudgetCarryForward } from "@/src/lib/budget-carry-forward";
import type { Budget } from "@/src/types/budget";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

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

    await ensureMonthInitialized(db, month);

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
      applyToFutureMonths?: boolean;
    } = await request.json();

    if (!body.month || !body.budgets || !Array.isArray(body.budgets)) {
      return Response.json(
        { error: "month and budgets array are required" },
        { status: 400 }
      );
    }

    if (!MONTH_REGEX.test(body.month)) {
      return Response.json({ error: "invalid month format" }, { status: 400 });
    }

    for (const b of body.budgets) {
      if (
        !b.category ||
        !b.groupId ||
        typeof b.plannedAmount !== "number" ||
        !Number.isFinite(b.plannedAmount) ||
        b.plannedAmount < 0
      ) {
        return Response.json(
          { error: "invalid budget item (category, groupId, and a finite non-negative plannedAmount are required)" },
          { status: 400 }
        );
      }
    }

    // Avoid duplicate categories racing on the same anchor write when carrying forward.
    const itemsByCategory = new Map<string, (typeof body.budgets)[number]>();
    for (const b of body.budgets) {
      itemsByCategory.set(b.category, b);
    }
    const uniqueItems = [...itemsByCategory.values()];

    const affectedMonthSet = new Set<string>();

    if (body.applyToFutureMonths) {
      await Promise.all(
        uniqueItems.map(async (b) => {
          const result = await upsertBudgetCarryForward(db, {
            month: body.month,
            groupId: b.groupId,
            category: b.category,
            plannedAmount: b.plannedAmount,
          });
          for (const m of result.affectedMonths) {
            affectedMonthSet.add(m);
          }
        })
      );
    } else {
      const ops = uniqueItems.map((b) => ({
        updateOne: {
          filter: { month: body.month, category: b.category },
          update: {
            $set: {
              month: body.month,
              groupId: new ObjectId(b.groupId),
              category: b.category,
              plannedAmount: b.plannedAmount,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (ops.length > 0) {
        await db.collection("budgets").bulkWrite(ops);
      }
    }

    const budgets = await db
      .collection<Budget>("budgets")
      .find({ month: body.month })
      .toArray();

    return Response.json({ budgets, affectedMonths: [...affectedMonthSet] });
  } catch (error) {
    console.error("Error updating budgets:", error);
    return Response.json(
      { error: "Failed to update budgets" },
      { status: 500 }
    );
  }
}
