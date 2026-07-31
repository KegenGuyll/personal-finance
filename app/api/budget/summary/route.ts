import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getBudgetGroups, getCategoryActuals, getMappings, remapActuals } from "@/src/lib/budget-pipeline";
import type { Budget, BudgetGroupSummary, BudgetCategorySummary, BudgetSummary } from "@/src/types/budget";

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

    const [groups, budgets, expenseActuals, incomeActuals, savingsActuals, mappings, settings] = await Promise.all([
      getBudgetGroups(db),
      db.collection<Budget>("budgets").find({ month }).toArray(),
      getCategoryActuals(db, month, false),
      getCategoryActuals(db, month, true),
      getCategoryActuals(db, month, false, true, true),
      getMappings(db),
      db.collection("budget_settings").findOne({ month }) as Promise<{ expectedIncome?: number } | null>,
    ]);

    const totalIncome = [...incomeActuals.values()].reduce(
      (sum, a) => sum + a.total,
      0
    );
    const baseIncome = settings?.expectedIncome ?? totalIncome;

    const { actualsByGroup } = remapActuals(expenseActuals, mappings);
    const { actualsByGroup: savingsByGroup } = remapActuals(savingsActuals, mappings);

    const budgetByCategory = new Map<string, Budget>();
    for (const b of budgets) {
      budgetByCategory.set(b.category, b);
    }

    const plaidLeavesByBudgetCat = new Map<string, string[]>();
    for (const m of mappings) {
      const existing = plaidLeavesByBudgetCat.get(m.budgetCategory);
      if (existing) {
        existing.push(m.plaidLeafCategory);
      } else {
        plaidLeavesByBudgetCat.set(m.budgetCategory, [m.plaidLeafCategory]);
      }
    }

    const groupSummaries: BudgetGroupSummary[] = groups.map((group) => {
      const groupTarget = Math.round((baseIncome * group.percentage) / 100);
      const isSavings = group.name === "Savings";
      const groupActuals = isSavings
        ? savingsByGroup.get(group.name)
        : actualsByGroup.get(group.name);

      let categories: BudgetCategorySummary[] = [];

      if (groupActuals) {
        categories = [...groupActuals.entries()].map(([budgetCat, actual]) => {
          const budget = budgetByCategory.get(budgetCat);
          const plannedAmount = budget?.plannedAmount ?? 0;
          const actualAmount = actual.total;

          const effectiveLimit = plannedAmount;
          const remaining = effectiveLimit - actualAmount;
          const percentUsed =
            effectiveLimit > 0
              ? Math.round((actualAmount / effectiveLimit) * 100)
              : 0;

          let suggestedAmount = 0;
          if (!budget && actualAmount > 0) {
            suggestedAmount = actualAmount;
          } else if (!budget && groupTarget > 0) {
            const mappedCount = groupActuals.size;
            if (mappedCount > 0) {
              const existingPlanned = [...groupActuals.keys()]
                .filter((k) => budgetByCategory.has(k))
                .reduce((sum, k) => sum + (budgetByCategory.get(k)?.plannedAmount ?? 0), 0);
              const unbudgetedCount = Math.max(1, [...groupActuals.keys()].filter((k) => !budgetByCategory.has(k)).length);
              const remainingBudget = Math.max(0, groupTarget - existingPlanned);
              suggestedAmount = Math.round(remainingBudget / unbudgetedCount);
            }
          }

          return {
            category: budgetCat,
            plaidLeaves: plaidLeavesByBudgetCat.get(budgetCat) ?? [],
            groupId: group._id!,
            plannedAmount,
            actualAmount,
            remaining,
            percentUsed,
            carryoverFromPrevious: 0,
            hasUnresolvedCarryover: false,
            suggestedAmount,
          };
        });
      }

      const groupPlanned = categories.reduce((sum, c) => sum + c.plannedAmount, 0);
      const groupActual = categories.reduce((sum, c) => sum + c.actualAmount, 0);
      const groupPercentUsed =
        groupTarget > 0
          ? Math.round((groupActual / groupTarget) * 100)
          : 0;

      return {
        groupId: group._id!,
        name: group.name,
        percentage: group.percentage,
        targetAmount: groupTarget,
        plannedAmount: groupPlanned,
        actualAmount: groupActual,
        allocatedAmount: groupPlanned,
        unallocatedAmount: Math.max(0, groupTarget - groupPlanned),
        percentUsed: groupPercentUsed,
        categories,
      };
    });

    const grandTarget = groupSummaries.reduce((sum, g) => sum + g.targetAmount, 0);
    const grandPlanned = groupSummaries.reduce((sum, g) => sum + g.plannedAmount, 0);
    const grandActual = groupSummaries.reduce((sum, g) => sum + g.actualAmount, 0);

    const summary: BudgetSummary = {
      month,
      groups: groupSummaries,
      totalTarget: grandTarget,
      totalPlanned: grandPlanned,
      totalActual: grandActual,
    };

    return Response.json(summary);
  } catch (error) {
    console.error("Error generating budget summary:", error);
    return Response.json(
      { error: "Failed to generate budget summary" },
      { status: 500 }
    );
  }
}
