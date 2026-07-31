import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getCategoryActuals } from "@/src/lib/budget-pipeline";
import type { Goal } from "@/src/types/budget";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function calcMonthlyContribution(goal: Goal): number {
  const today = new Date();
  const target = new Date(`${goal.targetDate}T00:00:00`);
  const remaining = target.getTime() - today.getTime();
  const monthsRemaining = Math.max(1, Math.ceil(remaining / (30.44 * 24 * 60 * 60 * 1000)));
  const amountNeeded = goal.targetAmount - goal.currentAmount;
  return amountNeeded > 0 ? Math.round(amountNeeded / monthsRemaining) : 0;
}

async function recalcFeasibility(db: NonNullable<Awaited<ReturnType<typeof connectToDatabase>>["db"]>, goal: Goal, monthlyContribution: number): Promise<boolean> {
  try {
    const month = getCurrentMonth();
    const incomeActuals = await getCategoryActuals(db, month, true);
    const expenseActuals = await getCategoryActuals(db, month, false);

    const totalIncome = [...incomeActuals.values()].reduce((s, a) => s + a.total, 0);
    const totalExpenses = [...expenseActuals.values()].reduce((s, a) => s + a.total, 0);

    const groups = await db
      .collection("budget_groups")
      .find({})
      .sort({ sortOrder: 1 })
      .toArray();

    const savingsGroup = groups.find((g) => g.name === "Savings");
    let savingsActual = 0;
    if (savingsGroup) {
      for (const cat of savingsGroup.categories as string[]) {
        savingsActual += expenseActuals.get(cat)?.total ?? 0;
      }
    }

    const surplus = totalIncome - totalExpenses - savingsActual;
    return monthlyContribution <= surplus;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const goals = await db
      .collection<Goal>("goals")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const enriched = await Promise.all(
      goals.map(async (g) => {
        const monthly = calcMonthlyContribution(g);
        const feasible = await recalcFeasibility(db, g, monthly);
        return { ...g, monthlyContribution: monthly, isFeasible: feasible };
      })
    );

    return Response.json({ goals: enriched });
  } catch (error) {
    console.error("Error fetching goals:", error);
    return Response.json(
      { error: "Failed to fetch goals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      name: string;
      targetAmount: number;
      targetDate: string;
      linkedAccountId?: string;
    } = await request.json();

    if (!body.name || !body.targetAmount || !body.targetDate) {
      return Response.json(
        { error: "name, targetAmount, and targetDate are required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const monthlyContribution = calcMonthlyContribution({
      name: body.name,
      targetAmount: body.targetAmount,
      targetDate: body.targetDate,
      currentAmount: 0,
      monthlyContribution: 0,
      isFeasible: false,
      contributions: [],
      createdAt: now,
      updatedAt: now,
    });

    const goal: Omit<Goal, "_id"> = {
      name: body.name,
      targetAmount: body.targetAmount,
      targetDate: body.targetDate,
      currentAmount: 0,
      monthlyContribution,
      isFeasible: false,
      linkedAccountId: body.linkedAccountId,
      contributions: [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("goals").insertOne(goal);
    const created = await db.collection<Goal>("goals").findOne({ _id: result.insertedId } as Record<string, unknown>);

    if (created) {
      created.isFeasible = await recalcFeasibility(db, created, monthlyContribution);
    }

    return Response.json({ goal: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating goal:", error);
    return Response.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
