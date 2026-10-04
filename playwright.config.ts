import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const appPort = Number(process.env.E2E_APP_PORT || 3060);
const mockPort = Number(process.env.E2E_MOCK_PORT || 3061);
const baseURL = `http://127.0.0.1:${appPort}`;
const mockBaseURL = `http://127.0.0.1:${mockPort}`;
const testDatabaseUrl = process.env.E2E_DATABASE_URL;

function databaseTarget(value: string) {
  const url = new URL(value);
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  return `${url.hostname.toLowerCase()}:${port}${database}`;
}

if (!testDatabaseUrl) {
  throw new Error("E2E_DATABASE_URL is required. E2E tests must never run against the application DATABASE_URL.");
}
if (
  process.env.DATABASE_URL
  && databaseTarget(testDatabaseUrl) === databaseTarget(process.env.DATABASE_URL)
) {
  throw new Error("E2E_DATABASE_URL must point to a database that is separate from DATABASE_URL.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-services.mjs",
      url: `${mockBaseURL}/health`,
      timeout: 30_000,
      reuseExistingServer: false,
      env: { E2E_MOCK_PORT: String(mockPort) },
    },
    {
      command: `npm run start -- --hostname 127.0.0.1 -p ${appPort}`,
      cwd: process.env.E2E_APP_CWD || process.cwd(),
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: testDatabaseUrl,
        AUTH_URL: baseURL,
        NEXTAUTH_URL: baseURL,
        FLASHY_API_BASE_URL: mockBaseURL,
        OPENAI_API_BASE_URL: mockBaseURL,
        OPENAI_API_KEY: "e2e-openai-key",
        OPENAI_MODEL: "gpt-5-mini",
        RESEND_API_BASE_URL: mockBaseURL,
        RESEND_API_KEY: "e2e-resend-key",
        EMAIL_FROM: "addz Growth Desk <login@example.test>",
        OWNER_EMAIL: "e2e-owner@example.test",
        WEBSITE_SCAN_E2E: "1",
        WEBSITE_SCAN_EMAIL_ENABLED: "true",
        E2E_DATABASE_URL: testDatabaseUrl,
        BLOB_READ_WRITE_TOKEN: "",
        AI_DOCUMENTS_READ_WRITE_TOKEN: "",
        SYNC_ALERT_EMAILS: "",
        CRON_SECRET: "e2e-disabled-cron",
      },
    },
  ],
});
