import { NextRequest } from "next/server";
import { connectToDatabase } from "@/src/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const categories = await db
      .collection("categories")
      .find({})
      .sort({ name: 1 })
      .toArray();

    return Response.json({
      categories: categories.map((c) => c.name as string),
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return Response.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { name }: { name: string } = await request.json();

    if (!name || typeof name !== "string") {
      return Response.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    await db.collection("categories").updateOne(
      { name },
      { $set: { name, createdAt: new Date() } },
      { upsert: true }
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error creating category:", error);
    return Response.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
