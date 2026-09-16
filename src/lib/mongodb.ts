import { MongoClient, type Db } from "mongodb";

const DB_NAME = "personal-finance";

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

let cached: MongoConnection | null = null;
let indexesEnsured = false;

async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;
  await db.collection("transactions").createIndex(
    { account_id: 1, date: -1 },
    { name: "account_date_idx" }
  );
  await db.collection("transactions").createIndex(
    { transaction_id: 1 },
    { name: "transaction_id_idx", unique: true }
  );
  // Serves both goal-funded lookups (goalId: <id> / $in) and the
  // goalId: { $exists: false } exclusion used by every budget aggregate.
  // Deliberately not sparse: a sparse index omits documents missing the field,
  // so it could not serve the $exists: false queries.
  await db.collection("transactions").createIndex(
    { goalId: 1 },
    { name: "transactions_goal_idx" }
  );
  // Manually entered transactions carry `manual: true`; nothing else does, so a
  // sparse index serves the "manual transactions only" filter and the
  // awaiting-a-sync lookup without indexing the rest of the collection.
  //
  // There is deliberately no unique index on `manualEntryId`: linking a manual
  // entry to a still-pending transaction copies that id onto the pending row,
  // and when Plaid posts it the sync upserts the same id onto the posted row
  // before deleting the pending one — a unique index would reject that write
  // mid-sync. "A manual entry can only be linked once" is instead enforced
  // atomically by the confirm step in
  // app/api/transactions/[id]/link-manual/route.ts.
  await db.collection("transactions").createIndex(
    { manual: 1 },
    { name: "manual_entries_idx", sparse: true }
  );
  await db.collection("account_items").createIndex(
    { account_id: 1 },
    { name: "account_id_idx", unique: true }
  );
  await db.collection("categories").createIndex(
    { name: 1 },
    { name: "category_name_idx", unique: true }
  );
  await db.collection("budget_groups").createIndex(
    { sortOrder: 1 },
    { name: "budget_groups_sort_idx" }
  );
  await db.collection("budgets").createIndex(
    { month: 1, category: 1 },
    { name: "budget_month_category_idx", unique: true }
  );
  await db.collection("income_patterns").createIndex(
    { name: 1 },
    { name: "income_pattern_name_idx", unique: true }
  );
  await db.collection("goals").createIndex(
    { targetDate: 1 },
    { name: "goals_target_date_idx" }
  );
  await db.collection("goal_contributions").createIndex(
    { goalId: 1, date: 1 },
    { name: "goal_contributions_goal_date_idx" }
  );
  await db.collection("budget_settings").createIndex(
    { month: 1 },
    { name: "budget_settings_month_idx", unique: true }
  );
  await db.collection("category_group_mappings").createIndex(
    { plaidLeafCategory: 1 },
    { name: "category_group_mappings_plaid_idx", unique: true }
  );
  await db.collection("transaction_category_rules").createIndex(
    { account_id: 1, name: 1 },
    { name: "transaction_category_rules_account_name_idx", unique: true }
  );
  indexesEnsured = true;
}

export async function connectToDatabase(): Promise<MongoConnection> {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  if (cached) {
    return cached;
  }

  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
    maxIdleTimeMS: 60000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  await ensureIndexes(db);

  cached = { client, db };
  return cached;
}
