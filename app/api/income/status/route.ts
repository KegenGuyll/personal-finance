import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");

    if (!month) {
      return Response.json(
        { error: "month query parameter is required (YYYY-MM)" },
        { status: 400 }
      );
    }

    const incomeCount = await db.collection("transactions").countDocuments({
      transaction_type: "income",
      date: { $regex: `^${month}` },
    });

    return Response.json({ hasIncome: incomeCount > 0, count: incomeCount });
  } catch (error) {
    console.error("Error checking income status:", error);
    return Response.json(
      { error: "Failed to check income status" },
      { status: 500 }
    );
  }
}
