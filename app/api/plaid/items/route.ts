import { connectToDatabase } from "@/src/lib/mongodb";
import {
  resolveInstitutionLabel,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const items = (await db
      .collection("plaid_items")
      .find({})
      .toArray()) as unknown as PlaidItemDoc[];

    const resolved = [];
    for (const item of items) {
      const label = await resolveInstitutionLabel(db, item);
      resolved.push({ itemId: item.itemId, label });
    }

    return Response.json({ items: resolved });
  } catch (error) {
    console.error("Error listing Plaid items:", error);
    return Response.json({ error: "Failed to list items" }, { status: 500 });
  }
}
