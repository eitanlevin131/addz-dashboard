import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
const isolated = JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8"));
const url = new URL(isolated.E2E_DATABASE_URL);
if (process.env.VERCEL || url.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || url.pathname !== "/addz_epic2_validation" || !process.version.startsWith("v22.")) throw Error("Unsafe validation environment");
const env = {
  ...process.env, ...isolated,
  PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:${process.env.PATH}`,
  DATABASE_URL: "postgresql://unused:unused@build.invalid/build_only",
  AUTH_SECRET: "epic3-synthetic-test-secret-not-production", OWNER_EMAIL: "e2e-owner@example.test",
  FLASHY_API_KEY_ENCRYPTION_SECRET: "epic3-synthetic-encryption-key", AUTH_DEV_BYPASS: "false",
  AUTH_PASSWORD_FALLBACK: "false", ADMIN_EMAILS: "", ADMIN_PASSWORD: "", ADMIN_LOGIN_CODE: "",
  E2E_APP_HOSTNAME: "localhost",
  AUTH_URL: "http://localhost:3060", NEXTAUTH_URL: "http://localhost:3060",
  FLASHY_API_BASE_URL: "http://127.0.0.1:3061", RESEND_API_BASE_URL: "http://127.0.0.1:3061", OPENAI_API_BASE_URL: "http://127.0.0.1:3061",
  OPENAI_API_KEY: "e2e-openai-key", RESEND_API_KEY: "e2e-resend-key",
  BLOB_READ_WRITE_TOKEN: "", AI_DOCUMENTS_READ_WRITE_TOKEN: "", SYNC_ALERT_EMAILS: "", CRON_SECRET: "epic3-disabled-cron",
};
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const mode = process.argv[2] || "full";
if (mode === "quality" || mode === "full") {
  run(["--test", ...fs.readdirSync("tests").filter(f => f.endsWith(".test.mjs")).map(f => `tests/${f}`)]);
  run(["node_modules/eslint/bin/eslint.js"]);
  run(["node_modules/typescript/bin/tsc", "--noEmit"]);
  run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
}
if (mode === "e2e" || mode === "full") {
  // Only synthetic OTP/rate state on the exact allowlisted DB is reset.
  const db = neon(isolated.E2E_DATABASE_URL);
  await db.query("delete from login_codes"); await db.query("delete from questionnaire_rate_limits");
  run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)]);
}
