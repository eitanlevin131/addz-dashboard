import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = neon(process.env.DATABASE_URL);
await db`ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_window_start timestamptz`;
console.log("Password authentication columns are ready. Existing users and reports were preserved.");
