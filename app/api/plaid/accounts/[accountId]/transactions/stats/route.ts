import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const { db } = await connectToDatabase();

    const url = request.nextUrl;
    const startDate = url.searchParams.get("startDate") ?? "";

    const matchStage: Record<string, unknown> = { account_id: accountId };
    if (startDate) {
      matchStage.date = { $gte: startDate };
    }

    const pipeline = [
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
          total: { $sum: { $abs: "$amount" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $match: { _id: { $ne: "Credit Card" } } },
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
