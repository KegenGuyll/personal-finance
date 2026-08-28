import { NextRequest } from "next/server";
import type { Document } from "mongodb";
import { connectToDatabase } from "@/src/lib/mongodb";
import type { Goal, GoalContribution } from "@/src/types/budget";
import { ObjectId } from "mongodb";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    const body: {
      amount: number;
      date: string;
      source?: "manual" | "transfer";
      transactionId?: string;
    } = await request.json();

    if (!body.amount || !body.date) {
      return Response.json(
        { error: "amount and date are required" },
        { status: 400 }
      );
    }

    if (body.amount <= 0) {
      return Response.json(
        { error: "amount must be positive" },
        { status: 400 }
      );
    }

    const goal = await db.collection<Goal>("goals").findOne({
      _id: new ObjectId(id),
    } as Record<string, unknown>);

    if (!goal) {
      return Response.json(
        { error: "Goal not found" },
        { status: 404 }
      );
    }

    const contribution: GoalContribution = {
      goalId: id,
      amount: body.amount,
      date: body.date,
      source: body.source ?? "manual",
      transactionId: body.transactionId,
      createdAt: new Date(),
    };

    const result = await db
      .collection("goal_contributions")
      .insertOne(contribution as unknown as Document);

    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) } as Record<string, unknown>,
      {
        $push: { contributionIds: result.insertedId },
        $inc: { currentAmount: body.amount },
        $set: { updatedAt: new Date() },
      } as Record<string, unknown>
    );

    return Response.json({ success: true, contributionId: String(result.insertedId) });
  } catch (error) {
    console.error("Error contributing to goal:", error);
    return Response.json(
      { error: "Failed to contribute to goal" },
      { status: 500 }
    );
  }
}
