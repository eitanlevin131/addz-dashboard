import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hashPassword, validatePassword } from "../src/lib/auth/password.ts";

const run = promisify(execFile);
const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) throw new Error("OWNER_EMAIL and DATABASE_URL are required.");
if (process.platform !== "darwin") throw new Error("This setup dialog requires macOS.");
const db = neon(process.env.DATABASE_URL);
const existing = await db`SELECT password_hash IS NOT NULL AS configured FROM users WHERE email = ${email}`;
if (existing[0]?.configured) throw new Error("Owner already has a password. Use the authenticated password reset flow.");

async function prompt(message) {
  const { stdout } = await run("osascript", ["-e", `text returned of (display dialog ${JSON.stringify(message)} default answer "" with hidden answer with title "ADDZ - Owner setup" buttons {"Cancel", "Save"} default button "Save" cancel button "Cancel")`]);
  return stdout.replace(/\r?\n$/, "");
}

try {
  const password = await prompt(`Choose a password for ${email} (10-128 characters).`);
  const invalid = validatePassword(password);
  if (invalid) throw new Error("Password must contain 10-128 characters. Run setup again.");
  const confirmation = await prompt("Enter the same password again to confirm.");
  if (password !== confirmation) throw new Error("Passwords do not match. Nothing was saved.");
  const hash = await hashPassword(password);
  const result = await db`INSERT INTO users (id, email, name, role, password_hash)
    VALUES (${randomUUID()}, ${email}, 'Agency Admin', 'admin', ${hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin',
      session_version = users.session_version + 1, login_attempts = 0, login_window_start = NULL
    WHERE users.password_hash IS NULL
    RETURNING email`;
  if (!result.length) throw new Error("Password was already configured. Nothing was changed.");
  console.log(`Owner account ready: ${email}. Password stored as a salted hash.`);
} catch (error) {
  // Never print child-process errors: dialog output may contain sensitive input.
  if (error && typeof error === "object" && "stderr" in error) {
    console.error("Password dialog canceled or unavailable. Nothing was saved.");
  } else {
    console.error(error instanceof Error ? error.message : "Setup failed.");
  }
  process.exitCode = 1;
}
