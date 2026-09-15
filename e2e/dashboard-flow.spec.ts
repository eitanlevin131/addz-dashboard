import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { encryptSecret } from "../src/lib/crypto";
import { hashPassword } from "../src/lib/auth/password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the E2E suite.");

const db = neon(databaseUrl);
const suffix = randomUUID().slice(0, 8);
const userId = `e2e-admin-${suffix}`;
const email = `e2e-admin-${suffix}@example.test`;
const password = `E2E-${randomUUID()}!`;
const primaryClientId = randomUUID();
const secondaryClientId = randomUUID();
const primaryAccountId = randomUUID();
const secondaryAccountId = randomUUID();
const planId = randomUUID();
const primaryClientName = `E2E Alpha ${suffix}`;
const secondaryClientName = `E2E Beta ${suffix}`;
const primaryAccountName = "E2E Alpha Account";
const secondaryAccountName = "E2E Beta Account";

function dateOffset(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function cleanup() {
  await db`delete from audit_logs where actor_user_id = ${userId} or entity_id in (${primaryAccountId}, ${secondaryAccountId})`;
  await db`delete from clients where id in (${primaryClientId}, ${secondaryClientId})`;
  await db`delete from users where id = ${userId}`;
}

test.describe("agency dashboard critical journey", () => {
  test.beforeAll(async () => {
    await cleanup();
    const passwordHash = await hashPassword(password);
    await db`insert into users (id, name, email, password_hash, role, status, must_change_password)
      values (${userId}, ${"E2E Agency Admin"}, ${email}, ${passwordHash}, ${"admin"}, ${"active"}, false)`;
    await db`insert into clients (id, name, owner, industry, visible_modules)
      values
        (${primaryClientId}, ${primaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]}),
        (${secondaryClientId}, ${secondaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]})`;
    await db`insert into flashy_accounts
      (id, client_id, flashy_account_id, name, website, currency, timezone, encrypted_api_key, usd_ils_rate, sms_credit_price_usd, monthly_subscription_cost_usd, agency_retainer_cost_ils, active)
      values
        (${primaryAccountId}, ${primaryClientId}, 990001, ${primaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-primary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true),
        (${secondaryAccountId}, ${secondaryClientId}, 990002, ${secondaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-secondary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true)`;
    const plannedDate = new Date();
    plannedDate.setUTCDate(plannedDate.getUTCDate() - 2);
    await db`insert into newsletter_plans
      (id, client_id, flashy_account_id, planned_date, planned_time, channel, kind, status, title, owner, notes)
      values (${planId}, ${primaryClientId}, ${primaryAccountId}, ${plannedDate.toISOString().slice(0, 10)}, ${"11:00"}, ${"email"}, ${"campaign"}, ${"planned"}, ${"E2E launch campaign"}, ${"QA"}, ${"E2E planned send"})`;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("login, client selection, range, sync, reports, planner and grounded AI", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "כניסה", exact: true }).click();
    await expect(page.getByRole("heading", { name: "סקירת סוכנות" })).toBeVisible();

    const clientSelector = page.locator("#client-select");
    await clientSelector.selectOption(secondaryClientId);
    await expect(page.getByRole("heading", { name: secondaryAccountName, exact: true })).toBeVisible();
    await clientSelector.selectOption(primaryClientId);
    await expect(page.getByRole("heading", { name: primaryAccountName, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "7 ימים", exact: true }).click();
    await expect(page.getByRole("button", { name: "7 ימים", exact: true })).toHaveClass(/bg-\[#111318\]/);
    await page.getByRole("button", { name: "30 ימים", exact: true }).click();
    await expect(page.getByRole("button", { name: "30 ימים", exact: true })).toHaveClass(/bg-\[#111318\]/);

    const navigation = page.getByRole("navigation", { name: "ניווט ראשי" });
    await navigation.getByRole("button", { name: "הגדרות", exact: true }).click();
    const syncResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/flashy/sync") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "סנכרן עכשיו", exact: true }).click();
    const syncResponse = await syncResponsePromise;
    expect(syncResponse.ok()).toBeTruthy();
    const syncPayload = await syncResponse.json();
    expect(syncPayload.imported).toEqual({ emailCampaigns: 2, smsCampaigns: 1, automations: 1 });
    await expect(page.getByText(/סונכרן: 2 אימייל, 1 SMS, 1 רשומות אוטומציה/)).toBeVisible();

    await navigation.getByRole("button", { name: "כללי", exact: true }).click();
    await expect(page.getByText("הכנסה מיוחסת לפעילות", { exact: true })).toBeVisible();
    const revenueChartFilter = page.getByRole("group", { name: "ערוץ בגרף ההכנסות" });
    await revenueChartFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(revenueChartFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");
    await navigation.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(page.getByText("הכנסות פעילות SMS", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "מסלול קמפיין SMS", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "אוטומציות", exact: true }).click();
    await expect(page.getByText("הכנסות אוטומציות", { exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "קמפיינים", exact: true }).click();
    await expect(page.getByText("הכנסות קמפיינים", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "תמהיל הכנסות קמפיינים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "מסע מקמפיין לרכישה", exact: true })).toBeVisible();
    const campaignFunnelFilter = page.getByRole("group", { name: "ערוץ במשפך הקמפיינים" });
    await campaignFunnelFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(campaignFunnelFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");

    await navigation.getByRole("button", { name: "גאנט דיוורים", exact: true }).click();
    await expect(page.getByRole("heading", { name: "גאנט דיוורים", exact: true })).toBeVisible();
    const plannedCampaign = page.locator("article").filter({ hasText: "E2E launch campaign" });
    await expect(plannedCampaign).toContainText("נשלח");

    await page.getByRole("button", { name: "טבלה", exact: true }).click();
    await expect(page.getByText("E2E launch campaign", { exact: true })).toBeVisible();
    await page.getByLabel("מתאריך", { exact: true }).fill(dateOffset(0));
    await page.getByLabel("עד תאריך", { exact: true }).fill(dateOffset(0));
    await expect(page.getByText("E2E launch campaign", { exact: true })).toBeHidden();
    await page.getByLabel("מתאריך", { exact: true }).fill(dateOffset(-10));
    await expect(page.getByText("E2E launch campaign", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "כל התאריכים", exact: true }).click();
    await expect(page.getByLabel("מתאריך", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("עד תאריך", { exact: true })).toHaveValue("");

    await page.getByRole("button", { name: "שאל את ה־AI", exact: true }).click();
    await page.getByPlaceholder("שאל שאלה על הנתונים...").fill("מה הנתון המרכזי בטווח?");
    const aiResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/ai/chat") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "שלח", exact: true }).click();
    const aiResponse = await aiResponsePromise;
    expect(aiResponse.ok()).toBeTruthy();
    await expect(page.getByText("בדיקת E2E הושלמה: הנתונים, החישוב והמקור זמינים.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "נתונים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "מקורות", exact: true })).toBeVisible();
  });
});
