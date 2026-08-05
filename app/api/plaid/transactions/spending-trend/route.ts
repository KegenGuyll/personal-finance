import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  buildSpendingTrendPipeline,
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

    const matchConditions = buildTransactionStatsMatch({
      accountIds,
      startDate,
      endDate,
      transactionType,
      category,
    });

    const pipeline = [
      { $match: { $and: matchConditions } },
      ...buildSpendingTrendPipeline(transactionType === "income"),
    ];

    const results = await db
      .collection("transactions")
      .aggregate(pipeline)
      .toArray();

    const points = results.map((r) => ({
      date: r._id as string,
      total: r.total as number,
    }));

    return Response.json({ points });
  } catch (error) {
    console.error("Error fetching spending trend:", error);
    return Response.json(
      { error: "Failed to fetch spending trend" },
      { status: 500 }
    );
  }
}
