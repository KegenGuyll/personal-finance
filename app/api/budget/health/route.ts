import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getCategoryActuals, getMappings, remapActuals } from "@/src/lib/budget-pipeline";
import type { BudgetHealth } from "@/src/types/budget";

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

    const [incomeActuals, expenseActuals, savingsRawActuals, mappings, settings] = await Promise.all([
      getCategoryActuals(db, month, true),
      getCategoryActuals(db, month, false),
      getCategoryActuals(db, month, false, true, true),
      getMappings(db),
      db.collection("budget_settings").findOne({ month }) as Promise<{ expectedIncome?: number } | null>,
    ]);

    const totalIncome = [...incomeActuals.values()].reduce(
      (sum, a) => sum + a.total,
      0
    );
    const totalExpenses = [...expenseActuals.values()].reduce(
      (sum, a) => sum + a.total,
      0
    );

    const { actualsByGroup } = remapActuals(savingsRawActuals, mappings);

    let savingsGroupActual = 0;
    const savingsMap = actualsByGroup.get("Savings");
    if (savingsMap) {
      savingsGroupActual = [...savingsMap.values()].reduce(
        (sum, a) => sum + a.total,
        0
      );
    }

    const net = totalIncome - totalExpenses;
    const surplus = net - savingsGroupActual;
    const savingsRate =
      totalIncome > 0
        ? Math.round((savingsGroupActual / totalIncome) * 100)
        : 0;

    const health: BudgetHealth = {
      month,
      totalIncome,
      expectedIncome: settings?.expectedIncome ?? 0,
      totalExpenses,
      net,
      savingsGroupPlanned: 0,
      savingsGroupActual,
      surplus,
      savingsRate,
    };

    return Response.json(health);
  } catch (error) {
    console.error("Error generating budget health:", error);
    return Response.json(
      { error: "Failed to generate budget health" },
      { status: 500 }
    );
  }
}
