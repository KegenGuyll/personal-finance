import { connectToDatabase } from "@/src/lib/mongodb";
import { DEFAULT_BUDGET_GROUPS, DEFAULT_CATEGORY_MAPPING } from "@/src/utils/budget-defaults";

export async function POST() {
  try {
    const { db } = await connectToDatabase();

    const existingGroups = await db.collection("budget_groups").countDocuments();
    if (existingGroups > 0) {
      return Response.json(
        { message: "Budget groups already seeded" },
        { status: 200 }
      );
    }

    const leafCategories = await db
      .collection("transactions")
      .aggregate([
        {
          $group: {
            _id: {
              $cond: {
                if: { $isArray: "$category" },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$category" }, 0] },
                    then: { $arrayElemAt: ["$category", -1] },
                    else: "Uncategorized",
                  },
                },
                else: "Uncategorized",
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const categoryNames = leafCategories.map((c) => c._id as string);

    const needsCategories: string[] = [];
    const savingsCategories: string[] = [];
    const wantsCategories: string[] = [];
    const unmapped: string[] = [];

    for (const name of categoryNames) {
      const group = DEFAULT_CATEGORY_MAPPING[name];
      if (group === "Needs") needsCategories.push(name);
      else if (group === "Savings") savingsCategories.push(name);
      else if (group === "Wants") wantsCategories.push(name);
      else unmapped.push(name);
    }

    const allMappings = Object.entries(DEFAULT_CATEGORY_MAPPING).map(([category, groupName]) => ({
      plaidLeafCategory: category,
      budgetCategory: category,
      groupName,
    }));

    for (const name of unmapped) {
      allMappings.push({ plaidLeafCategory: name, budgetCategory: name, groupName: "Wants" });
    }

    const groups = [
      {
        name: DEFAULT_BUDGET_GROUPS[0].name,
        percentage: DEFAULT_BUDGET_GROUPS[0].percentage,
        categories: needsCategories,
        sortOrder: DEFAULT_BUDGET_GROUPS[0].sortOrder,
        createdAt: new Date(),
      },
      {
        name: DEFAULT_BUDGET_GROUPS[1].name,
        percentage: DEFAULT_BUDGET_GROUPS[1].percentage,
        categories: savingsCategories,
        sortOrder: DEFAULT_BUDGET_GROUPS[1].sortOrder,
        createdAt: new Date(),
      },
      {
        name: DEFAULT_BUDGET_GROUPS[2].name,
        percentage: DEFAULT_BUDGET_GROUPS[2].percentage,
        categories: wantsCategories,
        sortOrder: DEFAULT_BUDGET_GROUPS[2].sortOrder,
        createdAt: new Date(),
      },
    ];

    await db.collection("budget_groups").insertMany(groups);

    const mappingOps = allMappings.map((m) => ({
      updateOne: {
        filter: { plaidLeafCategory: m.plaidLeafCategory },
        update: { $set: { plaidLeafCategory: m.plaidLeafCategory, budgetCategory: m.budgetCategory, groupName: m.groupName } },
        upsert: true,
      },
    }));

    if (mappingOps.length > 0) {
      await db.collection("category_group_mappings").bulkWrite(mappingOps);
    }

    return Response.json({
      message: "Budget groups seeded successfully",
      groups: groups.map((g) => ({
        name: g.name,
        percentage: g.percentage,
        categoryCount: g.categories.length,
      })),
      unmappedCategories: unmapped,
      mappingsSeeded: allMappings.length,
    });
  } catch (error) {
    console.error("Error seeding budget groups:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: `Failed to seed budget groups: ${message}` },
      { status: 500 }
    );
  }
}
