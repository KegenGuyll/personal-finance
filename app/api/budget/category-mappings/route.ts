import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import type { CategoryMapping } from "@/src/types/budget";
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? "";

    const mappings = await db
      .collection<CategoryMapping>("category_group_mappings")
      .find({})
      .sort({ budgetCategory: 1 })
      .toArray();

    const matchStage: Record<string, unknown> = {};
    if (month) {
      matchStage.date = { $regex: `^${month}` };
    }

    const unmappedLeaves = await db
      .collection("transactions")
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $arrayElemAt: ["$category", -1] },
            count: { $sum: 1 },
          },
        },
        {
          $match: {
            _id: { $ne: null },
          },
        },
      ])
      .toArray();

    const mappedLeaves = new Set(mappings.map((m) => m.plaidLeafCategory));
    const unmapped = unmappedLeaves
      .filter((u) => !mappedLeaves.has(u._id as string))
      .map((u) => ({ leaf: u._id as string, count: u.count as number }));

    return Response.json({ mappings, unmapped });
  } catch (error) {
    console.error("Error fetching category mappings:", error);
    return Response.json(
      { error: "Failed to fetch category mappings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      mappings: {
        _id?: string;
        plaidLeafCategory: string;
        budgetCategory: string;
        groupName: string;
      }[];
    } = await request.json();

    if (!body.mappings || !Array.isArray(body.mappings)) {
      return Response.json(
        { error: "mappings array is required" },
        { status: 400 }
      );
    }

    const ops = body.mappings.map((m) => {
      const doc: Record<string, unknown> = {
        plaidLeafCategory: m.plaidLeafCategory,
        budgetCategory: m.budgetCategory,
        groupName: m.groupName,
      };

      return {
        updateOne: {
          filter: { plaidLeafCategory: m.plaidLeafCategory },
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    if (ops.length > 0) {
      await db.collection("category_group_mappings").bulkWrite(ops);
    }

    const updated = await db
      .collection<CategoryMapping>("category_group_mappings")
      .find({})
      .sort({ budgetCategory: 1 })
      .toArray();

    return Response.json({ mappings: updated });
  } catch (error) {
    console.error("Error updating category mappings:", error);
    return Response.json(
      { error: "Failed to update category mappings" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const url = new URL(request.url);
    const plaidLeafCategory = url.searchParams.get("plaidLeafCategory");

    if (!plaidLeafCategory) {
      return Response.json(
        { error: "plaidLeafCategory query parameter is required" },
        { status: 400 }
      );
    }

    await db.collection("category_group_mappings").deleteOne({
      plaidLeafCategory,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting category mapping:", error);
    return Response.json(
      { error: "Failed to delete category mapping" },
      { status: 500 }
    );
  }
}
