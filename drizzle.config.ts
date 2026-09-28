import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
