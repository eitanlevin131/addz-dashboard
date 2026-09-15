import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const appPort = Number(process.env.E2E_APP_PORT || 3060);
const mockPort = Number(process.env.E2E_MOCK_PORT || 3061);
const baseURL = `http://127.0.0.1:${appPort}`;
const mockBaseURL = `http://127.0.0.1:${mockPort}`;

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
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        AUTH_URL: baseURL,
        NEXTAUTH_URL: baseURL,
        FLASHY_API_BASE_URL: mockBaseURL,
        OPENAI_API_BASE_URL: mockBaseURL,
        OPENAI_API_KEY: "e2e-openai-key",
        OPENAI_MODEL: "gpt-5-mini",
      },
    },
  ],
});
