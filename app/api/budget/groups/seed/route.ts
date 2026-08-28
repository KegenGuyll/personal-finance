import { connectToDatabase } from "@/src/lib/mongodb";
import { DEFAULT_CATEGORY_SORT_ORDER, LEAF_CATEGORY_EXPRESSION } from "@/src/lib/budget-pipeline";
import { DEFAULT_BUDGET_GROUPS, DEFAULT_CATEGORY_MAPPING } from "@/src/utils/budget-defaults";
import type { Db } from "mongodb";

async function backfillBudgetCategories(
  db: Db,
  allMappings: { budgetCategory: string }[]
) {
  const existingNames = await db
    .collection("budget_categories")
    .distinct("name");

  const missing = [
    ...new Set(allMappings.map((m) => m.budgetCategory)),
  ].filter((name) => !existingNames.includes(name));

  if (missing.length > 0) {
    await db.collection("budget_categories").bulkWrite(
      missing.map((name) => ({
        updateOne: {
          filter: { name },
          update: {
            $set: { name, isBudgeted: true, sortOrder: DEFAULT_CATEGORY_SORT_ORDER },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      }))
    );
  }
}

export async function POST() {
  try {
    const { db } = await connectToDatabase();

    const leafCategories = await db
      .collection("transactions")
      .aggregate([
        {
          $group: {
            _id: LEAF_CATEGORY_EXPRESSION,
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
      const mapping = DEFAULT_CATEGORY_MAPPING[name];
      if (mapping?.group === "Needs") needsCategories.push(name);
      else if (mapping?.group === "Savings") savingsCategories.push(name);
      else if (mapping?.group === "Wants") wantsCategories.push(name);
      else unmapped.push(name);
    }

    const allMappings = Object.entries(DEFAULT_CATEGORY_MAPPING).map(([leaf, mapping]) => ({
      plaidLeafCategory: leaf,
      budgetCategory: mapping.budgetCategory,
      groupName: mapping.group,
    }));

    for (const name of unmapped) {
      allMappings.push({ plaidLeafCategory: name, budgetCategory: name, groupName: "Wants" });
    }

    const existingGroups = await db.collection("budget_groups").countDocuments();
    if (existingGroups > 0) {
      const existingLeaves = await db
        .collection("category_group_mappings")
        .distinct("plaidLeafCategory");

      const missing = allMappings.filter(
        (m) => !existingLeaves.includes(m.plaidLeafCategory)
      );

      if (missing.length > 0) {
        await db.collection("category_group_mappings").bulkWrite(
          missing.map((m) => ({
            updateOne: {
              filter: { plaidLeafCategory: m.plaidLeafCategory },
              update: { $set: m },
              upsert: true,
            },
          }))
        );
      }

      await backfillBudgetCategories(db, allMappings);

      return Response.json({
        message: "Budget groups already seeded",
        mappingsAdded: missing.length,
      });
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

    await backfillBudgetCategories(db, allMappings);

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
