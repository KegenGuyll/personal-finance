import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";
import { getMappings } from "@/src/lib/budget-pipeline";
import type { BudgetGroup } from "@/src/types/budget";

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const [groups, mappings] = await Promise.all([
      db
        .collection<BudgetGroup>("budget_groups")
        .find({})
        .sort({ sortOrder: 1 })
        .toArray(),
      getMappings(db),
    ]);

    const categoriesByGroup = new Map<string, Set<string>>();
    for (const m of mappings) {
      if (!categoriesByGroup.has(m.groupName)) {
        categoriesByGroup.set(m.groupName, new Set());
      }
      categoriesByGroup.get(m.groupName)!.add(m.budgetCategory);
    }

    const groupsWithCategories = groups.map((g) => ({
      ...g,
      categories: [...(categoriesByGroup.get(g.name) ?? [])],
    }));

    return Response.json({ groups: groupsWithCategories });
  } catch (error) {
    console.error("Error fetching budget groups:", error);
    return Response.json(
      { error: "Failed to fetch budget groups" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body: {
      groups: { _id: string; name?: string; percentage?: number }[];
    } = await request.json();

    if (!body.groups || !Array.isArray(body.groups)) {
      return Response.json(
        { error: "Groups array is required" },
        { status: 400 }
      );
    }

    const { ObjectId } = await import("mongodb");

    const operations = body.groups.map((g) => {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (g.name !== undefined) update.name = g.name;
      if (g.percentage !== undefined) update.percentage = g.percentage;

      return {
        updateOne: {
          filter: { _id: new ObjectId(g._id) },
          update: { $set: update },
        },
      };
    });

    if (operations.length > 0) {
      await db.collection("budget_groups").bulkWrite(operations);
    }

    const [groups, mappings] = await Promise.all([
      db
        .collection<BudgetGroup>("budget_groups")
        .find({})
        .sort({ sortOrder: 1 })
        .toArray(),
      getMappings(db),
    ]);

    const categoriesByGroup = new Map<string, Set<string>>();
    for (const m of mappings) {
      if (!categoriesByGroup.has(m.groupName)) {
        categoriesByGroup.set(m.groupName, new Set());
      }
      categoriesByGroup.get(m.groupName)!.add(m.budgetCategory);
    }

    const groupsWithCategories = groups.map((g) => ({
      ...g,
      categories: [...(categoriesByGroup.get(g.name) ?? [])],
    }));

    return Response.json({ groups: groupsWithCategories });
  } catch (error) {
    console.error("Error updating budget groups:", error);
    return Response.json(
      { error: "Failed to update budget groups" },
      { status: 500 }
    );
  }
}
