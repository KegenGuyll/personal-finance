// One-off migration: move embedded goal contributions into the
// goal_contributions collection and backfill goal fields.
// Usage: node scripts/migrate-goal-contributions.mjs
import { readFileSync } from "fs";
import { MongoClient, ObjectId } from "mongodb";
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
const goalsCol = db.collection("goals");
const contributionsCol = db.collection("goal_contributions");

const goals = await goalsCol.find({}).toArray();
let moved = 0;
let backfilled = 0;

for (const goal of goals) {
  const embedded = goal.contributions ?? [];
  const contributionIds = [];

  for (const c of embedded) {
    const result = await contributionsCol.insertOne({
      goalId: goal._id,
      amount: c.amount,
      date: c.date,
      source: c.source ?? "manual",
      transactionId: c.transactionId,
      createdAt: new Date(),
    });
    contributionIds.push(result.insertedId);
    moved++;
  }

  const update = { updatedAt: new Date() };
  if (contributionIds.length > 0) {
    update.contributionIds = contributionIds;
    update.currentAmount = embedded.reduce((s, c) => s + c.amount, 0);
    delete update.updatedAt;
  }
  if (goal.startDate === undefined) {
    update.startDate = new Date(goal.createdAt).toISOString().split("T")[0];
    backfilled++;
  }
  if (Object.keys(update).length > 0) {
    await goalsCol.updateOne(
      { _id: goal._id },
      { $set: update, $unset: { contributions: "" } }
    );
  }
}

console.log(`Migrated ${moved} contributions across ${goals.length} goals`);
console.log(`Backfilled startDate on ${backfilled} goals`);
await client.close();
