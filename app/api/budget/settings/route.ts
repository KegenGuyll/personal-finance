import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getMonthKey } from "@/src/lib/month-utils";

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

    const settings = await db
      .collection("budget_settings")
      .findOne({ month });

    return Response.json({
      expectedIncome: settings?.expectedIncome ?? 0,
    });
  } catch (error) {
    console.error("Error fetching budget settings:", error);
    return Response.json(
      { error: "Failed to fetch budget settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      month: string;
      expectedIncome: number;
      applyToFuture?: boolean;
    } = await request.json();

    if (!body.month || body.expectedIncome === undefined) {
      return Response.json(
        { error: "month and expectedIncome are required" },
        { status: 400 }
      );
    }

    const months = body.applyToFuture
      ? [body.month, ...Array.from({ length: 12 }, (_, i) => getMonthKey(body.month, i + 1))]
      : [body.month];

    const ops = months.map((m) => ({
      updateOne: {
        filter: { month: m },
        update: { $set: { month: m, expectedIncome: body.expectedIncome } },
        upsert: true,
      },
    }));

    await db.collection("budget_settings").bulkWrite(ops);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating budget settings:", error);
    return Response.json(
      { error: "Failed to update budget settings" },
      { status: 500 }
    );
  }
}
