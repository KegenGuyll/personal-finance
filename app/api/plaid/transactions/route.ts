import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = request.nextUrl;

    const accountIdsParam = url.searchParams.get("accountIds") ?? "";
    const query = url.searchParams.get("q") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const startDate = url.searchParams.get("startDate") ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
    const offset = Number(url.searchParams.get("offset")) || 0;

    const accountIds = accountIdsParam.split(",").filter(Boolean);

    const filter: Record<string, unknown> = {};

    if (accountIds.length > 0) {
      filter.account_id = { $in: accountIds };
    }

    if (startDate) {
      filter.date = { ...((filter.date as Record<string, unknown>) ?? {}), $gte: startDate };
    }

    const conditions: Record<string, unknown>[] = [];

    if (query.trim()) {
      const escaped = escapeRegex(query.toLowerCase());
      conditions.push({
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { merchant_name: { $regex: escaped, $options: "i" } },
          { category: { $regex: escaped, $options: "i" } },
        ],
      });
    }

    if (category) {
      conditions.push({ category });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [total, transactions] = await Promise.all([
      db.collection("transactions").countDocuments(filter),
      db
        .collection("transactions")
        .find(filter)
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);

    const nextOffset = offset + transactions.length;
    const hasNext = nextOffset < total;

    return Response.json({ transactions, hasNext, nextOffset });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return Response.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
