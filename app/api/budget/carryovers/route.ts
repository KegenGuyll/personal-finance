import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getCategoryActuals } from "@/src/lib/budget-pipeline";
import type { Budget, CarryoverItem } from "@/src/types/budget";

function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

    const prevMonth = getPreviousMonth(month);
    const actuals = await getCategoryActuals(db, prevMonth, false);
    const budgets = await db
      .collection<Budget>("budgets")
      .find({ month: prevMonth })
      .toArray();

    const carryovers: CarryoverItem[] = [];

    for (const budget of budgets) {
      if (budget.plannedAmount <= 0) continue;
      if (budget.carryoverDecision) continue;

      const actual = actuals.get(budget.category);
      const actualAmount = actual?.total ?? 0;
      const underspent = budget.plannedAmount - actualAmount;

      if (underspent > 0) {
        carryovers.push({
          category: budget.category,
          month: prevMonth,
          underspentAmount: underspent,
          hasDecision: false,
        });
      }
    }

    return Response.json({ carryovers });
  } catch (error) {
    console.error("Error fetching carryovers:", error);
    return Response.json(
      { error: "Failed to fetch carryovers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      month: string;
      category: string;
      decision: "carryover" | "savings" | "goal" | "reset";
      goalId?: string;
    } = await request.json();

    if (!body.month || !body.category || !body.decision) {
      return Response.json(
        { error: "month, category, and decision are required" },
        { status: 400 }
      );
    }

    const prevMonth = getPreviousMonth(body.month);

    const decisionDoc = {
      decision: body.decision,
      goalId: body.goalId,
      resolvedAt: new Date(),
    };

    await db.collection("budgets").updateOne(
      { month: prevMonth, category: body.category },
      { $set: { carryoverDecision: decisionDoc, updatedAt: new Date() } }
    );

    if (body.decision === "carryover") {
      const prevBudget = await db
        .collection<Budget>("budgets")
        .findOne({ month: prevMonth, category: body.category });

      if (prevBudget) {
        const actuals = await getCategoryActuals(db, prevMonth, false);
        const actual = actuals.get(body.category);
        const actualAmount = actual?.total ?? 0;
        const carryoverAmount = prevBudget.plannedAmount - actualAmount;

        if (carryoverAmount > 0) {
          await db.collection("budgets").updateOne(
            { month: body.month, category: body.category },
            {
              $set: {
                carryoverFromPrevious: carryoverAmount,
                updatedAt: new Date(),
              },
              $setOnInsert: {
                month: body.month,
                groupId: prevBudget.groupId,
                category: body.category,
                plannedAmount: 0,
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error resolving carryover:", error);
    return Response.json(
      { error: "Failed to resolve carryover" },
      { status: 500 }
    );
  }
}
