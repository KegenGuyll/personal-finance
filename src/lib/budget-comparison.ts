import { type Db } from "mongodb";
import type {
  Budget,
  BudgetComparison,
  CategoryMonthlyPoint,
  ComparisonCategory,
  ComparisonGroup,
} from "@/src/types/budget";
import {
  DEFAULT_CATEGORY_SORT_ORDER,
  SAVINGS_GROUP_NAME,
  ensureMonthInitialized,
  getBudgetCategoryRegistry,
  getBudgetGroups,
  getCategoryActualsByMonth,
  getMappings,
  remapActuals,
} from "@/src/lib/budget-pipeline";

type LeafActual = { total: number; count: number };

function getGroupMonthlyActuals(
  months: string[],
  groupName: string,
  mappings: Awaited<ReturnType<typeof getMappings>>,
  expenseByMonth: Map<string, Map<string, LeafActual>>,
  savingsByMonth: Map<string, Map<string, LeafActual>>
): Map<string, Map<string, LeafActual>> {
  const isSavings = groupName === SAVINGS_GROUP_NAME;
  const byMonth = new Map<string, Map<string, LeafActual>>();

  for (const month of months) {
    const leafActuals = isSavings
      ? savingsByMonth.get(month) ?? new Map<string, LeafActual>()
      : expenseByMonth.get(month) ?? new Map<string, LeafActual>();
    const { actualsByGroup } = remapActuals(leafActuals, mappings);
    byMonth.set(month, actualsByGroup.get(groupName) ?? new Map<string, LeafActual>());
  }

  return byMonth;
}

export async function buildBudgetComparison(
  db: Db,
  months: string[]
): Promise<BudgetComparison> {
  for (const month of months) {
    await ensureMonthInitialized(db, month);
  }

  const [groups, mappings, registry, budgets, expenseByMonth, savingsByMonth] =
    await Promise.all([
      getBudgetGroups(db),
      getMappings(db),
      getBudgetCategoryRegistry(db),
      db.collection<Budget>("budgets").find({ month: { $in: months } }).toArray(),
      getCategoryActualsByMonth(db, months, false),
      getCategoryActualsByMonth(db, months, false, true, true),
    ]);

  const budgetByMonthCategory = new Map<string, Budget>();
  for (const b of budgets) {
    budgetByMonthCategory.set(`${b.month}|${b.category}`, b);
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

  const groupSummaries: ComparisonGroup[] = [];
  for (const group of groups) {
    const groupActualsByMonth = getGroupMonthlyActuals(
      months,
      group.name,
      mappings,
      expenseByMonth,
      savingsByMonth
    );

    const categorySet = new Set<string>();
    for (const month of months) {
      for (const key of groupActualsByMonth.get(month)?.keys() ?? []) {
        categorySet.add(key);
      }
    }
    for (const b of budgets) {
      if (String(b.groupId) === String(group._id)) {
        categorySet.add(b.category);
      }
    }

    const sortedKeys = [...categorySet].sort((a, b) => {
      const aOrder = registry.get(a)?.sortOrder ?? DEFAULT_CATEGORY_SORT_ORDER;
      const bOrder = registry.get(b)?.sortOrder ?? DEFAULT_CATEGORY_SORT_ORDER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    });

    const categories: ComparisonCategory[] = sortedKeys
      .map((category) => {
        const monthly: CategoryMonthlyPoint[] = months.map((month) => {
          const budgetDoc = budgetByMonthCategory.get(`${month}|${category}`);
          const planned = budgetDoc?.plannedAmount ?? 0;
          const actual = groupActualsByMonth.get(month)?.get(category)?.total ?? 0;
          const remaining = planned - actual;
          const percentUsed = planned > 0 ? Math.round((actual / planned) * 100) : 0;

          return { month, planned, actual, remaining, percentUsed };
        });

        return {
          category,
          plaidLeaves: plaidLeavesByBudgetCat.get(category) ?? [],
          groupId: String(group._id),
          groupName: group.name,
          monthly,
        };
      })
      .filter((c) => c.monthly.some((m) => m.planned > 0));

    groupSummaries.push({
      groupId: String(group._id),
      name: group.name,
      percentage: group.percentage,
      categories,
    });
  }

  return { months: [...months], groups: groupSummaries };
}
