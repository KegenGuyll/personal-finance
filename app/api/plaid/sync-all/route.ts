import { plaidClient } from "@/src/lib/plaid";
import { CountryCode } from "plaid";
import { type Db } from "mongodb";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  syncItemTransactions,
  type PlaidItemDoc,
} from "@/src/lib/plaid-sync";

export const dynamic = "force-dynamic";

async function resolveItemLabel(db: Db, item: PlaidItemDoc): Promise<string> {
  if (item.institutionName) return item.institutionName;

  try {
    const accountsResponse = await plaidClient.accountsGet({
      access_token: item.accessToken,
    });
    const institutionId = accountsResponse.data.item?.institution_id;

    if (institutionId) {
      const institutionsResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      const name = institutionsResponse.data.institution.name;
      await db.collection("plaid_items").updateOne(
        { itemId: item.itemId },
        { $set: { institutionName: name, institutionId } }
      );
      return name;
    }
  } catch (error) {
    console.error(
      `Error resolving institution for item ${item.itemId}:`,
      error
    );
  }

  return `Item ${item.itemId.slice(0, 8)}`;
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        const { db } = await connectToDatabase();

        const items = (await db
          .collection("plaid_items")
          .find({})
          .toArray()) as unknown as PlaidItemDoc[];

        send({ type: "init", total: items.length });

        let synced = 0;
        let skipped = 0;
        let errors = 0;

        for (const item of items) {
          const label = await resolveItemLabel(db, item);
          send({ type: "start", itemId: item.itemId, label });

          try {
            const status = await syncItemTransactions(db, item, (progress) => {
              send({
                type: "progress",
                itemId: progress.itemId,
                label,
                added: progress.added,
                modified: progress.modified,
                removed: progress.removed,
              });
            });
            send({ type: "item", itemId: item.itemId, label, status });
            if (status === "synced") {
              synced++;
            } else {
              skipped++;
            }
          } catch (error) {
            console.error(`Error syncing item ${item.itemId}:`, error);
            send({ type: "item", itemId: item.itemId, label, status: "error" });
            errors++;
          }
        }

        send({ type: "summary", synced, skipped, errors });
      } catch (error) {
        console.error("Error syncing all transactions:", error);
        send({ type: "error", message: "Failed to sync transactions" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
