import { EXCLUDE_TRANSFERS_MATCH, EXCLUDE_GOAL_TRANSACTIONS_MATCH } from "./budget-pipeline";

export function buildCategoryStatsPipeline(useAbsoluteValue: boolean) {
  return [
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
          $sum: useAbsoluteValue ? { $abs: "$amount" } : "$amount",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $match: { _id: { $nin: ["Credit Card", "Credit", "Debit", "Saving Transfers"] } } },
  ];
}

export function buildNameStatsPipeline(useAbsoluteValue: boolean) {
  return [
    {
      $group: {
        _id: { $ifNull: ["$name", "Unknown"] },
        total: {
          $sum: useAbsoluteValue ? { $abs: "$amount" } : "$amount",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ];
}

export type TrendGranularity = "daily" | "monthly";

export function buildSpendingTrendPipeline(
  useAbsoluteValue: boolean,
  granularity: TrendGranularity = "daily"
) {
  // Dates are stored as YYYY-MM-DD strings, so a 7-char prefix is the month key
  // ("YYYY-MM") — and lexicographic sort keeps months ordered.
  const groupKey =
    granularity === "monthly"
      ? { $substrCP: [{ $ifNull: ["$date", ""] }, 0, 7] }
      : "$date";
  return [
    {
      $group: {
        _id: groupKey,
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
    matchConditions.push({
      $or: [
        { transaction_type: { $ne: "income" } },
        { transaction_type: { $exists: false } },
      ],
    });
    matchConditions.push(EXCLUDE_GOAL_TRANSACTIONS_MATCH);
    if (!category) {
      matchConditions.push(EXCLUDE_TRANSFERS_MATCH);
    }
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
