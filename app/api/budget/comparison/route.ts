import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { buildBudgetComparison } from "@/src/lib/budget-comparison";

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const MAX_MONTHS = 24;

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const monthsParam = url.searchParams.get("months");

    if (!monthsParam) {
      return Response.json(
        { error: "months query parameter is required (comma-separated YYYY-MM)" },
        { status: 400 }
      );
    }

    const rawMonths = monthsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const months = [...new Set(rawMonths)].sort();

    if (months.length < 2) {
      return Response.json(
        { error: "at least two months are required" },
        { status: 400 }
      );
    }

    if (months.length > MAX_MONTHS) {
      return Response.json(
        { error: `too many months (max ${MAX_MONTHS})` },
        { status: 400 }
      );
    }

    for (const month of months) {
      if (!MONTH_REGEX.test(month)) {
        return Response.json(
          { error: `invalid month format: ${month}` },
          { status: 400 }
        );
      }
    }

    const comparison = await buildBudgetComparison(db, months);
    return Response.json(comparison);
  } catch (error) {
    console.error("Error generating budget comparison:", error);
    return Response.json(
      { error: "Failed to generate budget comparison" },
      { status: 500 }
    );
  }
}
