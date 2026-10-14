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
      name?: unknown;
      targetAmount?: unknown;
      targetDate?: unknown;
      linkedAccountId?: unknown;
    } = await request.json();

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return Response.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      update.name = body.name.trim();
    }
    if (body.targetAmount !== undefined) {
      if (
        typeof body.targetAmount !== "number" ||
        !Number.isFinite(body.targetAmount) ||
        body.targetAmount <= 0
      ) {
        return Response.json({ error: "targetAmount must be a positive number" }, { status: 400 });
      }
      update.targetAmount = body.targetAmount;
    }
    if (body.targetDate !== undefined) {
      if (typeof body.targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)) {
        return Response.json({ error: "targetDate must be a YYYY-MM-DD string" }, { status: 400 });
      }
      update.targetDate = body.targetDate;
    }
    if (body.linkedAccountId !== undefined) {
      update.linkedAccountId = body.linkedAccountId;
    }

    const result = await db.collection("goals").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return Response.json({ error: "Goal not found" }, { status: 404 });
    }

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
