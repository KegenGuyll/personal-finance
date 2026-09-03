import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getCarryForwardPreview } from "@/src/lib/budget-carry-forward";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const category = url.searchParams.get("category");
    const plannedAmountParam = url.searchParams.get("plannedAmount");

    if (!month || !category || plannedAmountParam === null) {
      return Response.json(
        { error: "month, category, and plannedAmount are required" },
        { status: 400 }
      );
    }

    const plannedAmount = Number(plannedAmountParam);
    if (
      !MONTH_REGEX.test(month) ||
      !category ||
      !Number.isFinite(plannedAmount) ||
      plannedAmount < 0
    ) {
      return Response.json({ error: "invalid parameters" }, { status: 400 });
    }

    const preview = await getCarryForwardPreview(db, {
      month,
      category,
      plannedAmount,
    });

    return Response.json(preview);
  } catch (error) {
    console.error("Error fetching carry-forward preview:", error);
    return Response.json(
      { error: "Failed to fetch carry-forward preview" },
      { status: 500 }
    );
  }
}
