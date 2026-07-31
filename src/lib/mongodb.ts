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
  indexesEnsured = true;
}

export async function connectToDatabase(): Promise<MongoConnection> {
  if (cached) {
    return cached;
  }

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(DB_NAME);

  await ensureIndexes(db);

  cached = { client, db };
  return cached;
}
