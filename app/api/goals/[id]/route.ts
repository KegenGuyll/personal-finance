import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import type { Goal } from "@/src/types/budget";
import { ObjectId } from "mongodb";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    const body: {
      name?: string;
      targetAmount?: number;
      targetDate?: string;
      linkedAccountId?: string;
    } = await request.json();

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.targetAmount !== undefined) update.targetAmount = body.targetAmount;
    if (body.targetDate !== undefined) update.targetDate = body.targetDate;
    if (body.linkedAccountId !== undefined) update.linkedAccountId = body.linkedAccountId;

    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    const updated = await db.collection<Goal>("goals").findOne({
      _id: new ObjectId(id),
    } as Record<string, unknown>);

    return Response.json({ goal: updated });
  } catch (error) {
    console.error("Error updating goal:", error);
    return Response.json(
      { error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) },
      { $set: { deletedAt: new Date(), updatedAt: new Date() } }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting goal:", error);
    return Response.json(
      { error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { db } = await connectToDatabase();
    const body: { linkedAccountId: string } = await request.json();

    if (!body.linkedAccountId) {
      return Response.json(
        { error: "linkedAccountId is required" },
        { status: 400 }
      );
    }

    await db.collection("goals").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          linkedAccountId: body.linkedAccountId,
          updatedAt: new Date(),
        },
      }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error linking goal account:", error);
    return Response.json(
      { error: "Failed to link account" },
      { status: 500 }
    );
  }
}
