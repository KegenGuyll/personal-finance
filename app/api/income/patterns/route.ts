import { connectToDatabase } from "@/src/lib/mongodb";
import type { IncomePattern } from "@/src/types/budget";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const patterns = await db
      .collection<IncomePattern>("income_patterns")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return Response.json({ patterns });
  } catch (error) {
    console.error("Error fetching income patterns:", error);
    return Response.json(
      { error: "Failed to fetch income patterns" },
      { status: 500 }
    );
  }
}
