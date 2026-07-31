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
      total: { $sum: { $abs: "$amount" } },
      count: { $sum: 1 },
    },
  },
  { $sort: { total: -1 } },
  { $match: { _id: { $ne: "Credit Card" } } },
];
