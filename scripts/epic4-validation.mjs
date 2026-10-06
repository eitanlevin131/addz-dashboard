import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const config = JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8"));
const url = new URL(config.E2E_DATABASE_URL);
if (process.env.VERCEL || !process.version.startsWith("v22.") || url.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || url.pathname !== "/addz_epic2_validation") throw Error("Unsafe Epic 4 validation target");
const env = {
  ...process.env, ...config, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
  DATABASE_URL: "postgresql://unused:unused@build.invalid/build_only", AUTH_SECRET: "epic4-synthetic-secret",
  AUTH_DEV_BYPASS: "false", AUTH_PASSWORD_FALLBACK: "false", OWNER_EMAIL: "e2e-owner@example.test",
  ADMIN_EMAILS: "", ADMIN_PASSWORD: "", ADMIN_LOGIN_CODE: "", FLASHY_API_KEY_ENCRYPTION_SECRET: "epic4-synthetic-key",
  E2E_APP_HOSTNAME: "localhost", AUTH_URL: "http://localhost:3060", NEXTAUTH_URL: "http://localhost:3060",
  FLASHY_API_BASE_URL: "http://127.0.0.1:3061", RESEND_API_BASE_URL: "http://127.0.0.1:3061", OPENAI_API_BASE_URL: "http://127.0.0.1:3061",
  OPENAI_API_KEY: "e2e-openai-key", RESEND_API_KEY: "e2e-resend-key", BLOB_READ_WRITE_TOKEN: "", AI_DOCUMENTS_READ_WRITE_TOKEN: "",
  SYNC_ALERT_EMAILS: "", CRON_SECRET: "epic4-disabled-cron",
};
const commands = {
  unit: ["--test", ...fs.readdirSync("tests").filter(f => f.endsWith(".test.mjs")).map(f => `tests/${f}`)],
  lint: ["node_modules/eslint/bin/eslint.js"],
  types: ["node_modules/typescript/bin/tsc", "--noEmit"],
  build: ["node_modules/next/dist/bin/next", "build", "--webpack", "--debug"],
  e2e: ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)],
};
const step = process.argv[2] || "full";
for (const name of step === "full" ? Object.keys(commands) : step === "quality" ? ["unit", "lint", "types", "build"] : [step]) {
  if (!commands[name]) throw Error("Unknown validation step");
  if (name === "e2e") {
    const db = neon(url.href);
    await db.query("delete from login_codes"); await db.query("delete from questionnaire_rate_limits");
  }
  console.log(`Epic 4 isolated ${name}: Node ${process.version}`);
  const result = spawnSync(process.execPath, commands[name], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
