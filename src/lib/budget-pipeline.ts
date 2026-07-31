import { type Db } from "mongodb";
import type { BudgetGroup, CategoryMapping } from "@/src/types/budget";

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

const EXCLUDED_LEAF_CATEGORIES = ["Credit Card", "Credit", "Debit", "Saving Transfers"];

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
          _id: {
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
          },
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

export async function getMappings(db: Db): Promise<CategoryMapping[]> {
  return db
    .collection<CategoryMapping>("category_group_mappings")
    .find({})
    .toArray();
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
