import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "personal-finance";

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not set");
}

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
  await db.collection("budget_settings").createIndex(
    { month: 1 },
    { name: "budget_settings_month_idx", unique: true }
  );
  await db.collection("category_group_mappings").createIndex(
    { plaidLeafCategory: 1 },
    { name: "category_group_mappings_plaid_idx", unique: true }
  );
  indexesEnsured = true;
}

export async function connectToDatabase(): Promise<MongoConnection> {
  if (cached) {
    return cached;
  }

  const client = new MongoClient(MONGODB_URI!, {
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
