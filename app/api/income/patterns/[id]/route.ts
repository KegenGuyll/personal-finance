import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { ObjectId } from "mongodb";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    await db.collection("income_patterns").deleteOne({ _id: new ObjectId(id) });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting income pattern:", error);
    return Response.json(
      { error: "Failed to delete income pattern" },
      { status: 500 }
    );
  }
}
