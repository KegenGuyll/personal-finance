import { connectToDatabase } from "@/src/lib/mongodb";

export async function POST() {
  try {
    const { db } = await connectToDatabase();

    const transactions = await db
      .collection("transactions")
      .find(
        { category: { $exists: true, $ne: null, $not: { $size: 0 } } },
        { projection: { category: 1 } }
      )
      .toArray();

    const uniqueCategories = new Set<string>();

    for (const txn of transactions) {
      const categories = txn.category as string[];
      for (let i = 0; i < categories.length; i++) {
        uniqueCategories.add(categories.slice(0, i + 1).join(" > "));
      }
    }

    const bulkOps = [...uniqueCategories].map((name) => ({
      updateOne: {
        filter: { name },
        update: { $set: { name, createdAt: new Date() } },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await db.collection("categories").bulkWrite(bulkOps);
    }

    return Response.json({
      success: true,
      count: uniqueCategories.size,
    });
  } catch (error) {
    console.error("Error seeding categories:", error);
    return Response.json(
      { error: "Failed to seed categories" },
      { status: 500 }
    );
  }
}
