import { NextRequest } from "next/server";
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

    const contribution: GoalContribution = {
      amount: body.amount,
      date: body.date,
      source: body.source ?? "manual",
      transactionId: body.transactionId,
    };

    const goal = await db.collection<Goal>("goals").findOne({
      _id: new ObjectId(id),
    } as Record<string, unknown>);

    if (!goal) {
      return Response.json(
        { error: "Goal not found" },
        { status: 404 }
      );
    }

    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) } as Record<string, unknown>,
      {
        $push: { contributions: contribution },
        $inc: { currentAmount: body.amount },
        $set: { updatedAt: new Date() },
      } as Record<string, unknown>
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error contributing to goal:", error);
    return Response.json(
      { error: "Failed to contribute to goal" },
      { status: 500 }
    );
  }
}
