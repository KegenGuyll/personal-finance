import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildNameStatsPipeline,
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
    const category = url.searchParams.get("category") ?? "";
    const accountIds = accountIdsParam.split(",").filter(Boolean);

    if (!category) {
      return Response.json({ names: [], grandTotal: 0 });
    }

    const matchConditions = buildTransactionStatsMatch({
      accountIds,
      startDate,
      endDate,
      transactionType,
      category,
    });

    const pipeline = [
      { $match: { $and: matchConditions } },
      ...buildNameStatsPipeline(transactionType === "income"),
    ];

    const results = await db
      .collection("transactions")
      .aggregate(pipeline)
      .toArray();

    const names = results.map((r) => ({
      name: r._id as string,
      total: r.total as number,
      count: r.count as number,
    }));

    const grandTotal = names.reduce((sum, n) => sum + n.total, 0);

    return Response.json({ names, grandTotal });
  } catch (error) {
    console.error("Error fetching category name stats:", error);
    return Response.json(
      { error: "Failed to fetch category name stats" },
      { status: 500 }
    );
  }
}
