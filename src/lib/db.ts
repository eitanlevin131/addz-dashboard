import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let db: ReturnType<typeof drizzle> | null = null;

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Create a Neon Free database and add its pooled connection string.");
  }
  return databaseUrl;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!db) {
    db = drizzle(neon(getDatabaseUrl()));
  }

  return db;
}
