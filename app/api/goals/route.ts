import { NextRequest } from "next/server";
import type { Document } from "mongodb";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getCategoryActuals, getMappings, remapActuals, SAVINGS_GROUP_NAME } from "@/src/lib/budget-pipeline";
import { getCurrentMonth, getEndOfMonth } from "@/src/lib/month-utils";
import type { Goal } from "@/src/types/budget";

function calcMonthlyContribution(goal: Goal): number {
  const today = new Date();
  const start = goal.startDate
    ? Math.max(today.getTime(), new Date(`${goal.startDate}T00:00:00`).getTime())
    : today.getTime();
  const target = new Date(`${goal.targetDate}T00:00:00`).getTime();

  if (today.getTime() > target) return 0;

  const monthsRemaining = Math.max(1, Math.ceil((target - start) / (30.44 * 24 * 60 * 60 * 1000)));
  const amountNeeded = goal.targetAmount - goal.currentAmount;
  return amountNeeded > 0 ? Math.round(amountNeeded / monthsRemaining) : 0;
}

function isActiveToday(goal: Goal): boolean {
  const today = new Date().toISOString().split("T")[0];
  const start = goal.startDate ?? today;
  return start <= today && today <= goal.targetDate;
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? getCurrentMonth();
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";

    const match: Record<string, unknown> = {};
    if (!includeDeleted) {
      match.deletedAt = { $exists: false };
    }

    const goals = await db
      .collection<Goal>("goals")
      .find(match)
      .sort({ createdAt: -1 })
      .toArray();

    const [savingsRawActuals, mappings] = await Promise.all([
      getCategoryActuals(db, month, false, true, true),
      getMappings(db),
    ]);

    const { actualsByGroup } = remapActuals(savingsRawActuals, mappings);
    const savingsMap = actualsByGroup.get(SAVINGS_GROUP_NAME);
    let savingsActual = 0;
    if (savingsMap) {
      savingsActual = [...savingsMap.values()].reduce((sum, a) => sum + a.total, 0);
    }

    const contributions = await db
      .collection("goal_contributions")
      .find({
        goalId: { $in: goals.map((g) => g._id) },
        date: { $gte: `${month}-01`, $lte: getEndOfMonth(month) },
      })
      .toArray();

    const contributionsByGoal = new Map<string, typeof contributions>();
    for (const c of contributions) {
      const key = String(c.goalId);
      const list = contributionsByGoal.get(key) ?? [];
      list.push(c);
      contributionsByGoal.set(key, list);
    }

    const enriched: Goal[] = goals.map((g) => {
      const monthly = calcMonthlyContribution(g);
      const goalContribs = contributionsByGoal.get(String(g._id)) ?? [];
      const allocatedThisMonth = goalContribs.reduce((sum, c) => sum + c.amount, 0);
      return {
        ...g,
        monthlyContribution: monthly,
        isFeasible: false,
        contributions: goalContribs.map((c) => ({
          _id: String(c._id),
          goalId: String(c.goalId),
          amount: c.amount,
          date: c.date,
          source: c.source,
          transactionId: c.transactionId,
          createdAt: c.createdAt,
        })),
        allocatedThisMonth,
      };
    });

    const active = enriched
      .filter((g) => !g.deletedAt && isActiveToday(g) && g.currentAmount < g.targetAmount)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

    let cumulative = 0;
    for (const g of active) {
      cumulative += g.monthlyContribution;
      g.isFeasible = cumulative <= savingsActual;
    }

    const totalAllocated = enriched.reduce((sum, g) => sum + (g.allocatedThisMonth ?? 0), 0);

    return Response.json({
      goals: enriched,
      month,
      savingsActual,
      unallocated: savingsActual - totalAllocated,
    });
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
      startDate?: string;
      linkedAccountId?: string;
    } = await request.json();

    if (!body.name || !body.targetAmount || !body.targetDate) {
      return Response.json(
        { error: "name, targetAmount, and targetDate are required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const startDate = body.startDate ?? now.toISOString().split("T")[0];
    const goal: Goal = {
      name: body.name,
      targetAmount: body.targetAmount,
      targetDate: body.targetDate,
      startDate,
      currentAmount: 0,
      monthlyContribution: 0,
      isFeasible: false,
      linkedAccountId: body.linkedAccountId,
      contributionIds: [],
      createdAt: now,
      updatedAt: now,
    };
    goal.monthlyContribution = calcMonthlyContribution(goal);

    const result = await db.collection("goals").insertOne(goal as unknown as Document);
    const created = await db.collection<Goal>("goals").findOne({ _id: result.insertedId } as Record<string, unknown>);

    return Response.json({ goal: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating goal:", error);
    return Response.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
