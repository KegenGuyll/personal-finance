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

export async function connectToDatabase(): Promise<MongoConnection> {
  if (cached) {
    return cached;
  }

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(DB_NAME);

  cached = { client, db };
  return cached;
}
