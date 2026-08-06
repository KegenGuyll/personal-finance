import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildCategoryStatsPipeline,
  buildTransactionStatsMatch,
} from "@/src/lib/stats-pipeline";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = request.nextUrl;

    const accountIdsParam = url.searchParams.get("accountIds") ?? "";
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const transactionType = url.searchParams.get("transactionType") ?? "";
    const accountIds = accountIdsParam.split(",").filter(Boolean);

    const matchConditions = buildTransactionStatsMatch({
      accountIds,
      startDate,
      endDate,
      transactionType,
    });

    const pipeline = [
      { $match: { $and: matchConditions } },
      ...buildCategoryStatsPipeline(transactionType === "income"),
    ];

    const results = await db
      .collection("transactions")
      .aggregate(pipeline)
      .toArray();

    const categories = results.map((r) => ({
      category: r._id as string,
      total: r.total as number,
      count: r.count as number,
    }));

    const grandTotal = categories.reduce((sum, c) => sum + c.total, 0);

    return Response.json({ categories, grandTotal });
  } catch (error) {
    console.error("Error fetching category stats:", error);
    return Response.json(
      { error: "Failed to fetch category stats" },
      { status: 500 }
    );
  }
}
