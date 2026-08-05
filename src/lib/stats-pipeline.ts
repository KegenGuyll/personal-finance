import { EXCLUDE_TRANSFERS_MATCH } from "./budget-pipeline";

export const CATEGORY_STATS_PIPELINE = [
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
      total: { $sum: "$amount" },
      count: { $sum: 1 },
    },
  },
  { $sort: { total: -1 } },
  { $match: { _id: { $nin: ["Credit Card", "Credit", "Debit", "Saving Transfers"] } } },
];

export const NAME_STATS_PIPELINE = [
  {
    $group: {
      _id: { $ifNull: ["$name", "Unknown"] },
      total: { $sum: "$amount" },
      count: { $sum: 1 },
    },
  },
  { $sort: { total: -1 } },
];

export function buildSpendingTrendPipeline(useAbsoluteValue: boolean) {
  return [
    {
      $group: {
        _id: "$date",
        total: {
          $sum: useAbsoluteValue ? { $abs: "$amount" } : "$amount",
        },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

export function buildTransactionStatsMatch({
  accountIds,
  startDate,
  endDate,
  transactionType,
  category,
}: {
  accountIds?: string[];
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  category?: string;
}): Record<string, unknown>[] {
  const matchConditions: Record<string, unknown>[] = [];

  if (transactionType === "income") {
    matchConditions.push({ transaction_type: "income" });
  } else {
    matchConditions.push(
      {
        $or: [
          { transaction_type: { $ne: "income" } },
          { transaction_type: { $exists: false } },
        ],
      },
      EXCLUDE_TRANSFERS_MATCH,
    );
  }

  if (accountIds && accountIds.length > 0) {
    matchConditions.push({ account_id: { $in: accountIds } });
  }

  if (category) {
    const categories = category.split(",").filter(Boolean);
    if (categories.length > 1) {
      matchConditions.push({
        $or: categories.map((c) => ({ category: c })),
      });
    } else {
      matchConditions.push({ category });
    }
  }

  if (startDate) {
    matchConditions.push({ date: { $gte: startDate } });
  }
  if (endDate) {
    matchConditions.push({ date: { $lte: endDate } });
  }

  return matchConditions;
}
