// One-off normalization: `transactions.goalId` is written as a string by every
// app route, but an ObjectId can reach the collection from outside them (a
// manual edit, or a restore of data written before that convention). Mongo
// compares BSON types strictly, so such a row was invisible to the goals
// spending lookups.
//
// Readers now accept both forms (src/lib/goal-ids.ts), so this script is
// cleanup for consistency rather than a required step. It is idempotent.
//
// Usage: node scripts/normalize-transaction-goal-ids.mjs
import { readFileSync } from "fs";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(path.join(root, ".env.local"), "utf8");
const uri = env.match(/^MONGODB_URI="?([^"\s]+)"?/m)?.[1];
if (!uri) {
  console.error("MONGODB_URI not found in .env.local");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db("personal-finance");
const transactionsCol = db.collection("transactions");

const before = await transactionsCol.countDocuments({
  goalId: { $type: "objectId" },
});

if (before === 0) {
  console.log("No ObjectId goalId values found; nothing to normalize.");
} else {
  const result = await transactionsCol.updateMany(
    { goalId: { $type: "objectId" } },
    [{ $set: { goalId: { $toString: "$goalId" } } }]
  );
  console.log(
    `Normalized ${result.modifiedCount} of ${before} transactions to string goalId`
  );
}

const remaining = await transactionsCol.countDocuments({
  goalId: { $type: "objectId" },
});
console.log(`Remaining ObjectId goalId values: ${remaining}`);

await client.close();
