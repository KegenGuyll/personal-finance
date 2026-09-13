// One-off normalization: `goal_contributions.goalId` was written as an ObjectId
// by scripts/migrate-goal-contributions.mjs, but as a string by the app's
// contribute route. Mongo compares BSON types strictly, so the ObjectId rows
// could not be deleted through the API.
//
// Readers now accept both forms (src/lib/goal-ids.ts), so this script is
// cleanup for consistency rather than a required step. It is idempotent.
//
// Usage: node scripts/normalize-goal-contribution-ids.mjs
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
const contributionsCol = db.collection("goal_contributions");

const before = await contributionsCol.countDocuments({
  goalId: { $type: "objectId" },
});

if (before === 0) {
  console.log("No ObjectId goalId values found; nothing to normalize.");
} else {
  const result = await contributionsCol.updateMany(
    { goalId: { $type: "objectId" } },
    [{ $set: { goalId: { $toString: "$goalId" } } }]
  );
  console.log(
    `Normalized ${result.modifiedCount} of ${before} contributions to string goalId`
  );
}

const remaining = await contributionsCol.countDocuments({
  goalId: { $type: "objectId" },
});
console.log(`Remaining ObjectId goalId values: ${remaining}`);

await client.close();
