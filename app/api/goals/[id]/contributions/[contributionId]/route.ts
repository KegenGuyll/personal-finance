import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import type { GoalContribution } from "@/src/types/budget";
import { ObjectId } from "mongodb";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id, contributionId } = await params;

  try {
    if (!ObjectId.isValid(contributionId)) {
      return Response.json(
        { error: "Invalid contribution id" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const contribution = (await db
      .collection("goal_contributions")
      .findOne({
        _id: new ObjectId(contributionId),
        goalId: id,
      })) as GoalContribution | null;

    if (!contribution) {
      return Response.json(
        { error: "Contribution not found" },
        { status: 404 }
      );
    }

    await db.collection("goal_contributions").deleteOne({
      _id: new ObjectId(contributionId),
    });

    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) } as Record<string, unknown>,
      {
        $pull: { contributionIds: new ObjectId(contributionId) },
        $inc: { currentAmount: -contribution.amount },
        $set: { updatedAt: new Date() },
      } as Record<string, unknown>
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting contribution:", error);
    return Response.json(
      { error: "Failed to delete contribution" },
      { status: 500 }
    );
  }
}
