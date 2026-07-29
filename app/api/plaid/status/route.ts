import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const count = await db.collection("plaid_items").countDocuments();

    return Response.json({ isLinked: count > 0 });
  } catch (error) {
    console.error("Error checking plaid status:", error);
    return Response.json({ error: "Failed to check status" }, { status: 500 });
  }
}
