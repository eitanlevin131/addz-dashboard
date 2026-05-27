import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { missingAuthEnv } from "@/lib/auth/config";

export async function GET() {
  const missing = missingAuthEnv();
  const databaseConfigured = isDatabaseConfigured();

  return NextResponse.json({
    success: true,
    database: {
      provider: "Neon Postgres",
      configured: databaseConfigured,
      nextStep: databaseConfigured
        ? "Run npm run db:push if migrations were not applied yet."
        : "Create a Neon Free database and paste its pooled DATABASE_URL into .env.local.",
    },
    auth: {
      provider: "Auth.js",
      configured: missing.length === 0 || (missing.length === 1 && missing[0] === "DATABASE_URL"),
      missing,
      mode: databaseConfigured ? "magic-link" : "local-demo-fallback",
    },
    flashy: {
      liveCheckEndpoint: "/api/flashy/sync",
      persistenceEndpoint: "/api/live-client",
    },
  });
}
