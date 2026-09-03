import { type Db } from "mongodb";
import type { BudgetGroup, Budget, BudgetCategory, CategoryMapping } from "@/src/types/budget";
import { getMonthKey, getPreviousMonth } from "@/src/lib/month-utils";

export const EXPENSE_TRANSACTIONS_FILTER = [
  {
    $or: [
      { transaction_type: { $ne: "income" } },
      { transaction_type: { $exists: false } },
    ],
  },
];

export const INCOME_TRANSACTIONS_FILTER = [
  { transaction_type: "income" },
];

export const SAVINGS_GROUP_NAME = "Savings";

const EXCLUDED_LEAF_CATEGORIES = ["Credit Card", "Credit", "Debit", "Saving Transfers"];

export const LEAF_CATEGORY_EXPRESSION = {
  $cond: {
    if: { $isArray: "$category" },
    then: {
      $cond: {
        if: { $gt: [{ $size: "$category" }, 0] },
        then: { $arrayElemAt: ["$category", -1] },
        else: "Uncategorized",
      },
    },
    else: "Uncategorized",
  },
};

export const EXCLUDE_TRANSFERS_MATCH = {
  $expr: {
    $not: {
      $in: [
        { $ifNull: [{ $arrayElemAt: ["$category", -1] }, ""] },
        EXCLUDED_LEAF_CATEGORIES,
      ],
    },
  },
};

export async function getBudgetGroups(db: Db): Promise<BudgetGroup[]> {
  return db
    .collection<BudgetGroup>("budget_groups")
    .find({})
    .sort({ sortOrder: 1 })
    .toArray();
}

export async function getCategoryActuals(
  db: Db,
  month: string,
  isIncome: boolean,
  useAbsoluteValue = false,
  includeTransfers = false
): Promise<Map<string, { total: number; count: number }>> {
  const filter = isIncome ? INCOME_TRANSACTIONS_FILTER : EXPENSE_TRANSACTIONS_FILTER;

  const matchStage: Record<string, unknown> = {
    $and: [
      { date: { $regex: `^${month}` } },
      filter[0],
    ],
  };

  if (!isIncome && !includeTransfers) {
    matchStage.$and = [...(matchStage.$and as Record<string, unknown>[]), EXCLUDE_TRANSFERS_MATCH];
  }

  const results = await db
    .collection("transactions")
    .aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: LEAF_CATEGORY_EXPRESSION,
          total: {
            $sum: isIncome || useAbsoluteValue ? { $abs: "$amount" } : "$amount",
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const map = new Map<string, { total: number; count: number }>();
  for (const r of results) {
    map.set(r._id as string, { total: r.total as number, count: r.count as number });
  }
  return map;
}

export async function getCategoryActualsByMonth(
  db: Db,
  months: string[],
  isIncome: boolean,
  useAbsoluteValue = false,
  includeTransfers = false
): Promise<Map<string, Map<string, { total: number; count: number }>>> {
  const filter = isIncome ? INCOME_TRANSACTIONS_FILTER : EXPENSE_TRANSACTIONS_FILTER;
  const monthRegex = `^(${months.join("|")})`;
  const matchStage: Record<string, unknown> = {
    $and: [
      { date: { $regex: monthRegex } },
      filter[0],
    ],
  };

  if (!isIncome && !includeTransfers) {
    matchStage.$and = [...(matchStage.$and as Record<string, unknown>[]), EXCLUDE_TRANSFERS_MATCH];
  }

  const results = await db
    .collection("transactions")
    .aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            month: { $substr: ["$date", 0, 7] },
            leaf: LEAF_CATEGORY_EXPRESSION,
          },
          total: {
            $sum: isIncome || useAbsoluteValue ? { $abs: "$amount" } : "$amount",
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byMonth = new Map<string, Map<string, { total: number; count: number }>>();
  for (const r of results) {
    const id = r._id as { month: string; leaf: string };
    if (!byMonth.has(id.month)) {
      byMonth.set(id.month, new Map());
    }
    byMonth.get(id.month)!.set(id.leaf, { total: r.total as number, count: r.count as number });
  }
  return byMonth;
}

export async function getMappings(db: Db): Promise<CategoryMapping[]> {
  return db
    .collection<CategoryMapping>("category_group_mappings")
    .find({})
    .toArray();
}

export const DEFAULT_CATEGORY_SORT_ORDER = 1000;

export interface BudgetCategoryRegistryEntry {
  isBudgeted: boolean;
  sortOrder: number;
}

export async function getBudgetCategoryRegistry(
  db: Db
): Promise<Map<string, BudgetCategoryRegistryEntry>> {
  const docs = await db
    .collection<BudgetCategory>("budget_categories")
    .find({})
    .toArray();
  return new Map(
    docs.map((d) => [
      d.name,
      {
        isBudgeted: d.isBudgeted,
        sortOrder: d.sortOrder ?? DEFAULT_CATEGORY_SORT_ORDER,
      },
    ])
  );
}

export function remapActuals(
  leafActuals: Map<string, { total: number; count: number }>,
  mappings: CategoryMapping[]
): {
  actualsByGroup: Map<string, Map<string, { total: number; count: number }>>;
  unmappedLeaves: string[];
} {
  const mappingByLeaf = new Map<string, CategoryMapping>();
  for (const m of mappings) {
    mappingByLeaf.set(m.plaidLeafCategory, m);
  }

  const actualsByGroup = new Map<string, Map<string, { total: number; count: number }>>();
  const unmappedLeaves: string[] = [];

  for (const [leaf, data] of leafActuals) {
    const mapping = mappingByLeaf.get(leaf);
    if (!mapping) {
      unmappedLeaves.push(leaf);
      continue;
    }

    const group = mapping.groupName;
    if (!actualsByGroup.has(group)) {
      actualsByGroup.set(group, new Map());
    }

    const budgetCat = mapping.budgetCategory;
    const groupMap = actualsByGroup.get(group)!;
    const existing = groupMap.get(budgetCat);
    if (existing) {
      existing.total += data.total;
      existing.count += data.count;
    } else {
      groupMap.set(budgetCat, { total: data.total, count: data.count });
    }
  }

  return { actualsByGroup, unmappedLeaves };
}

export async function ensureMonthInitialized(db: Db, month: string): Promise<void> {
  const prevMonth = getPreviousMonth(month);

  const [existingDocs, prevBudgets] = await Promise.all([
    db.collection<Budget>("budgets").find({ month }).toArray(),
    db.collection<Budget>("budgets").find({ month: prevMonth }).toArray(),
  ]);

  const existingCategories = new Set(existingDocs.map((b) => b.category));
  const missing = prevBudgets.filter((b) => !existingCategories.has(b.category));

  if (missing.length > 0) {
    const ops = missing.map((b) => ({
      updateOne: {
        filter: { month, category: b.category },
        update: {
          $set: {
            month,
            groupId: b.groupId,
            category: b.category,
            plannedAmount: b.plannedAmount,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    }));

    await db.collection("budgets").bulkWrite(ops);
  }

  const existingSettings = await db.collection("budget_settings").findOne({ month });
  if (!existingSettings) {
    const prevSettings = await db
      .collection("budget_settings")
      .findOne({ month: prevMonth });
    if (prevSettings) {
      await db.collection("budget_settings").updateOne(
        { month },
        {
          $set: { month, expectedIncome: prevSettings.expectedIncome ?? 0 },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
  }
}

export async function getCarryoverAmounts(
  db: Db,
  month: string,
  mappings: CategoryMapping[]
): Promise<Map<string, number>> {
  const groups = await getBudgetGroups(db);
  const savingsGroupIds = new Set(
    groups.filter((g) => g.name === SAVINGS_GROUP_NAME).map((g) => String(g._id))
  );

  const prevMonth = getPreviousMonth(month);
  const rangeStart = getMonthKey(month, -24);

  const allDocs = await db
    .collection<Budget>("budgets")
    .find({ month: { $gte: rangeStart, $lt: month } })
    .toArray();

  const docsByMonth = new Map<string, Map<string, Budget>>();
  for (const doc of allDocs) {
    if (!docsByMonth.has(doc.month)) {
      docsByMonth.set(doc.month, new Map());
    }
    docsByMonth.get(doc.month)!.set(doc.category, doc);
  }

  const prevDocs = docsByMonth.get(prevMonth);
  if (!prevDocs) return new Map();

  const chain = [...docsByMonth.keys()].sort();

  const actualsAgg = await db
    .collection("transactions")
    .aggregate([
      {
        $match: {
          $and: [
            { date: { $gte: `${rangeStart}-01`, $lt: `${month}-01` } },
            EXPENSE_TRANSACTIONS_FILTER[0],
            EXCLUDE_TRANSFERS_MATCH,
          ],
        },
      },
      {
        $group: {
          _id: {
            month: { $substr: ["$date", 0, 7] },
            leaf: LEAF_CATEGORY_EXPRESSION,
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const rawByMonth = new Map<string, Map<string, { total: number; count: number }>>();
  for (const r of actualsAgg) {
    const m = r._id.month as string;
    const leaf = r._id.leaf as string;
    if (!rawByMonth.has(m)) {
      rawByMonth.set(m, new Map());
    }
    rawByMonth.get(m)!.set(leaf, { total: r.total as number, count: r.count as number });
  }

  const actualsByMonth = new Map<string, Map<string, number>>();
  for (const m of chain) {
    const leafActuals = rawByMonth.get(m) ?? new Map();
    const { actualsByGroup } = remapActuals(leafActuals, mappings);
    const actuals = new Map<string, number>();
    for (const groupMap of actualsByGroup.values()) {
      for (const [category, data] of groupMap) {
        actuals.set(category, data.total);
      }
    }
    actualsByMonth.set(m, actuals);
  }

  const carryovers = new Map<string, number>();
  for (const [category, doc] of prevDocs) {
    if (savingsGroupIds.has(String(doc.groupId))) continue;

    let leftover = 0;
    for (const m of chain) {
      const planned = docsByMonth.get(m)?.get(category)?.plannedAmount ?? 0;
      const actual = actualsByMonth.get(m)?.get(category) ?? 0;
      leftover = Math.max(0, planned + leftover - actual);
    }

    if (leftover > 0) {
      carryovers.set(category, leftover);
    }
  }

  return carryovers;
}
