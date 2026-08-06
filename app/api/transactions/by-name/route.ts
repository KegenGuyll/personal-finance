import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const accountIdsParam = url.searchParams.get("accountIds") ?? "";

    if (!name) {
      return Response.json(
        { error: "name query parameter is required" },
        { status: 400 }
      );
    }

    const filter: Record<string, unknown> = { name };
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.date = dateFilter;
    }
    const accountIds = accountIdsParam.split(",").filter(Boolean);
    if (accountIds.length > 0) {
      filter.account_id = { $in: accountIds };
    }

    const transactions = await db
      .collection("transactions")
      .find(filter)
      .sort({ date: -1 })
      .toArray();

    return Response.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions by name:", error);
    return Response.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
