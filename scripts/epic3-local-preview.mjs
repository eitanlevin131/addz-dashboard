import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const target = new URL(JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8")).E2E_DATABASE_URL);
if (process.env.VERCEL || !process.version.startsWith("v22.") || target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Unsafe local Epic 3 preview target");
const appPort = Number(process.argv[2] || 3080), mockPort = appPort + 1;
if (!Number.isSafeInteger(appPort) || appPort < 1024 || appPort > 65534) throw Error("Invalid local preview port");
for (const port of [appPort, mockPort]) await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
const base = `http://localhost:${appPort}`, mock = `http://127.0.0.1:${mockPort}`;
const env = {
  ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
  DATABASE_URL: target.href, E2E_DATABASE_URL: target.href,
  AUTH_URL: base, NEXTAUTH_URL: base, AUTH_SECRET: "epic3-isolated-local-preview",
  AUTH_DEV_BYPASS: "true", AUTH_PASSWORD_FALLBACK: "false", OWNER_EMAIL: "e2e-owner@example.test",
  ADMIN_EMAILS: "", ADMIN_PASSWORD: "", ADMIN_LOGIN_CODE: "",
  FLASHY_API_KEY_ENCRYPTION_SECRET: "epic3-synthetic-encryption-key",
  FLASHY_API_BASE_URL: mock, RESEND_API_BASE_URL: mock, OPENAI_API_BASE_URL: mock,
  OPENAI_API_KEY: "e2e-openai-key", RESEND_API_KEY: "e2e-resend-key",
  EMAIL_FROM: "ADDZ Test <login@example.test>", SYNC_ALERT_EMAILS: "",
  BLOB_READ_WRITE_TOKEN: "", AI_DOCUMENTS_READ_WRITE_TOKEN: "", CRON_SECRET: "epic3-disabled-cron",
  WEBSITE_SCAN_E2E: "1", WEBSITE_SCAN_EMAIL_ENABLED: "false", E2E_MOCK_PORT: String(mockPort),
};
const root = process.cwd(), output = path.join(root, `.tmp/epic3/local-preview${appPort === 3080 ? "" : `-${appPort}`}`), snapshot = path.join(output, "app");
fs.mkdirSync(snapshot, { recursive: true });
// A separate source snapshot cannot load the repository's Production .env.local.
for (const name of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "next-env.d.ts"])
  fs.cpSync(path.join(root, name), path.join(snapshot, name), { recursive: true });
if (!fs.existsSync(path.join(snapshot, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(snapshot, "node_modules"), "dir");
function launch(args, name, cwd = root) {
  const log = fs.openSync(path.join(output, `${name}.log`), "a");
  const child = spawn(process.execPath, args, { env, cwd, detached: true, stdio: ["ignore", log, log] });
  child.unref(); fs.closeSync(log); return child.pid;
}
const pids = {
  mock: launch(["e2e/mock-services.mjs"], "mock"),
  app: launch([path.join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "-p", String(appPort)], "app", snapshot),
};
fs.writeFileSync(path.join(output, "pids.json"), JSON.stringify(pids));
console.log(JSON.stringify({ url: base, isolated: true, providers: "mocked", ...pids }));
