import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { CATEGORY_STATS_PIPELINE } from "@/src/lib/stats-pipeline";
import { EXCLUDE_TRANSFERS_MATCH } from "@/src/lib/budget-pipeline";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const { db } = await connectToDatabase();

    const url = request.nextUrl;
    const startDate = url.searchParams.get("startDate") ?? "";
    const transactionType = url.searchParams.get("transactionType") ?? "";

    const matchConditions: Record<string, unknown>[] = [
      { account_id: accountId },
    ];

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

    if (startDate) {
      matchConditions.push({ date: { $gte: startDate } });
    }

    const pipeline = [
      { $match: { $and: matchConditions } },
      ...CATEGORY_STATS_PIPELINE,
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
