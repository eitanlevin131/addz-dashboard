import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { encryptSecret } from "../src/lib/crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the E2E suite.");
const mockBaseURL = `http://127.0.0.1:${Number(process.env.E2E_MOCK_PORT || 3061)}`;

const db = neon(databaseUrl);
const suffix = randomUUID().slice(0, 8);
const userId = `e2e-admin-${suffix}`;
const email = `e2e-admin-${suffix}@example.test`;
const ownerUserId = `e2e-owner-${suffix}`;
const ownerEmail = "e2e-owner@example.test";
const clientUserId = `e2e-client-${suffix}`;
const clientEmail = `e2e-client-${suffix}@example.test`;
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
  await db`delete from audit_logs where actor_user_id in (${userId}, ${ownerUserId}, ${clientUserId}) or entity_id in (${primaryAccountId}, ${secondaryAccountId}, ${userId}, ${ownerUserId}, ${clientUserId})`;
  await db`delete from clients where id in (${primaryClientId}, ${secondaryClientId})`;
  await db`delete from users where id in (${userId}, ${ownerUserId}, ${clientUserId}) or email in (${email}, ${ownerEmail}, ${clientEmail})`;
}

async function loginWithCode(page: import("@playwright/test").Page, targetEmail: string) {
  await page.goto("/");
  await page.getByLabel("אימייל").fill(targetEmail);
  await page.getByRole("button", { name: "שלחו לי קוד כניסה", exact: true }).click();
  await expect(page.getByLabel("קוד כניסה")).toBeVisible();
  const deliveredEmail = await fetch(`${mockBaseURL}/test/resend-latest?to=${encodeURIComponent(targetEmail)}`).then((response) => response.json());
  const deliveredCode = String(deliveredEmail.data?.text ?? "").match(/\b\d{6}\b/)?.[0];
  expect(deliveredCode).toMatch(/^\d{6}$/);
  if (!deliveredCode) throw new Error(`Resend mock did not capture a login code for ${targetEmail}.`);
  await page.getByLabel("קוד כניסה").fill(deliveredCode);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
}

test.describe("agency dashboard critical journey", () => {
  test.beforeAll(async () => {
    await cleanup();
    await db`insert into users (id, name, email, role, status, must_change_password)
      values
        (${userId}, ${"E2E Agency Manager"}, ${email}, ${"admin"}, ${"active"}, false),
        (${ownerUserId}, ${"E2E Owner"}, ${ownerEmail}, ${"owner"}, ${"active"}, false),
        (${clientUserId}, ${"E2E Client"}, ${clientEmail}, ${"client"}, ${"active"}, false)`;
    await db`insert into clients (id, name, owner, industry, visible_modules)
      values
        (${primaryClientId}, ${primaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]}),
        (${secondaryClientId}, ${secondaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]})`;
    await db`insert into flashy_accounts
      (id, client_id, flashy_account_id, name, website, currency, timezone, encrypted_api_key, usd_ils_rate, sms_credit_price_usd, monthly_subscription_cost_usd, agency_retainer_cost_ils, active)
      values
        (${primaryAccountId}, ${primaryClientId}, 990001, ${primaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-primary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true),
        (${secondaryAccountId}, ${secondaryClientId}, 990002, ${secondaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-secondary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true)`;
    await db`insert into client_users (client_id, user_id) values (${primaryClientId}, ${clientUserId})`;
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
    await page.getByRole("button", { name: "שלחו לי קוד כניסה", exact: true }).click();
    await expect(page.getByLabel("קוד כניסה")).toBeVisible();

    const deliveredEmail = await fetch(`${mockBaseURL}/test/resend-latest?to=${encodeURIComponent(email)}`).then((response) => response.json());
    expect(deliveredEmail.count).toBe(1);
    const deliveredCode = String(deliveredEmail.data.text).match(/\b\d{6}\b/)?.[0];
    expect(deliveredCode).toMatch(/^\d{6}$/);
    if (!deliveredCode) throw new Error("Resend mock did not capture a login code.");
    const [storedCode] = await db`select code_hash, status, provider_message_id from login_codes where user_id = ${userId} order by requested_at desc limit 1`;
    expect(storedCode.status).toBe("sent");
    expect(storedCode.provider_message_id).toBe("e2e-email-1");
    expect(storedCode.code_hash).not.toContain(deliveredCode);

    await page.getByLabel("קוד כניסה").fill(deliveredCode);
    await page.getByRole("button", { name: "כניסה", exact: true }).click();
    await expect(page.getByRole("heading", { name: "סקירת סוכנות" })).toBeVisible();
    const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name.endsWith("session-token"));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie!.expires).toBeGreaterThan(Date.now() / 1000 + 70 * 60 * 60);
    expect(sessionCookie!.expires).toBeLessThan(Date.now() / 1000 + 74 * 60 * 60);
    const [consumedCode] = await db`select status, consumed_at from login_codes where user_id = ${userId} order by requested_at desc limit 1`;
    expect(consumedCode.status).toBe("consumed");
    expect(consumedCode.consumed_at).toBeTruthy();

    const requestUnknownLoginCode = async (targetEmail: string) => page.evaluate(async (value) => {
      const response = await fetch("/api/access-code/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      return { status: response.status, payload: await response.json() };
    }, targetEmail);
    const unknownCodeRequest = await requestUnknownLoginCode(`unknown-${suffix}@example.test`);
    expect(unknownCodeRequest.status).toBe(202);
    expect(unknownCodeRequest.payload.message).toContain("אם כתובת המייל מורשית");

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
    await expect(navigation.getByRole("button", { name: "ניהול", exact: true })).toHaveCount(0);
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
    await expect(page.getByText("הכנסה ממוצעת לרכישה", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "הכנסות לאורך התקופה", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "פירוק הכנסות", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "הקמפיינים המובילים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "האוטומציות המובילות", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "השעות החזקות", exact: true })).toBeVisible();
    const revenueBreakdownView = page.getByRole("group", { name: "סוג תצוגת פירוק הכנסות" });
    await revenueBreakdownView.getByRole("button", { name: "טבעת", exact: true }).click();
    await expect(revenueBreakdownView.getByRole("button", { name: "טבעת", exact: true })).toHaveAttribute("aria-pressed", "true");
    const topCampaignFilter = page.getByRole("group", { name: "סינון קמפיינים מובילים" });
    await topCampaignFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(topCampaignFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");
    await topCampaignFilter.getByRole("button", { name: "הכל", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("הכנסה מיוחסת לפעילות", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });
    const revenueChartFilter = page.getByRole("group", { name: "ערוץ בגרף ההכנסות" });
    await revenueChartFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(revenueChartFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");
    await navigation.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(page.getByText("הכנסות פעילות SMS", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "פעילות SMS לאורך התקופה", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "יעילות פעילות SMS", exact: true })).toBeVisible();
    const smsTrendMetric = page.getByRole("group", { name: "מדד בגרף פעילות SMS" });
    await smsTrendMetric.getByRole("button", { name: "רכישות", exact: true }).click();
    await expect(smsTrendMetric.getByRole("button", { name: "רכישות", exact: true })).toHaveAttribute("aria-pressed", "true");
    const smsActivityFilter = page.getByRole("group", { name: "סינון פעילות SMS" });
    await smsActivityFilter.getByRole("button", { name: "קמפיינים", exact: true }).click();
    await expect(smsActivityFilter.getByRole("button", { name: "קמפיינים", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "איפוס סינון ומיון", exact: true }).click();
    await expect(smsActivityFilter.getByRole("button", { name: "הכל", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });
    await navigation.getByRole("button", { name: "אוטומציות", exact: true }).click();
    await expect(page.getByText("הכנסות אוטומציות", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "פעילות אוטומציות לאורך התקופה", exact: true })).toBeVisible();
    const automationMetric = page.getByRole("group", { name: "מדד בגרף אוטומציות" });
    await automationMetric.getByRole("button", { name: "נכנסו והשלימו", exact: true }).click();
    await expect(automationMetric.getByRole("button", { name: "נכנסו והשלימו", exact: true })).toHaveAttribute("aria-pressed", "true");
    const automationFilter = page.getByRole("group", { name: "סינון אוטומציות" });
    await automationFilter.getByRole("button", { name: "אימייל", exact: true }).click();
    await expect(automationFilter.getByRole("button", { name: "אימייל", exact: true })).toHaveAttribute("aria-pressed", "true");
    const automationRow = page.getByRole("button", { name: /E2E welcome automation/ }).first();
    await expect(automationRow).toBeVisible();
    await automationRow.click();
    await expect(page.getByRole("heading", { name: "E2E welcome automation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "מסלול האוטומציה", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "סגירת פירוט אוטומציה", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });
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

  test("owner controls access and a client sees only assigned data", async ({ page, browser }) => {
    await loginWithCode(page, ownerEmail);
    await expect(page.getByRole("heading", { name: "סקירת סוכנות" })).toBeVisible();
    const ownerNavigation = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(ownerNavigation.getByRole("button", { name: "ניהול", exact: true })).toBeVisible();

    const invalidRole = await page.evaluate(async (targetUserId) => {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, role: "owner" }),
      });
      return response.status;
    }, userId);
    expect(invalidRole).toBe(400);

    const managerToClient = await page.evaluate(async ({ targetUserId, targetClientId }) => {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, role: "client", clientId: targetClientId }),
      });
      return response.status;
    }, { targetUserId: userId, targetClientId: primaryClientId });
    expect(managerToClient).toBe(200);
    const [downgradedManager] = await db`select role, session_version from users where id = ${userId}`;
    expect(downgradedManager.role).toBe("client");
    expect(Number(downgradedManager.session_version)).toBeGreaterThan(0);

    const managerRestored = await page.evaluate(async (targetUserId) => {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, role: "admin" }),
      });
      return response.status;
    }, userId);
    expect(managerRestored).toBe(200);
    const managerLinks = await db`select id from client_users where user_id = ${userId}`;
    expect(managerLinks).toHaveLength(0);

    const clientContext = await browser.newContext({ locale: "he-IL", timezoneId: "Asia/Jerusalem" });
    const clientPage = await clientContext.newPage();
    await loginWithCode(clientPage, clientEmail);
    await expect(clientPage.getByRole("heading", { name: primaryAccountName, exact: true })).toBeVisible();
    const visibleClientIds = await clientPage.evaluate(async () => {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      const payload = await response.json();
      return payload.data.clients.map((client: { id: string }) => client.id);
    });
    expect(visibleClientIds).toEqual([primaryClientId]);
    const clientNavigation = clientPage.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(clientNavigation.getByRole("button", { name: "סוכנות", exact: true })).toHaveCount(0);
    await expect(clientNavigation.getByRole("button", { name: "הגדרות", exact: true })).toHaveCount(0);
    await expect(clientNavigation.getByRole("button", { name: "ניהול", exact: true })).toHaveCount(0);

    const revokeStatus = await page.evaluate(async (targetUserId) => {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, action: "revoke_sessions" }),
      });
      return response.status;
    }, clientUserId);
    expect(revokeStatus).toBe(200);
    const revokedResponse = await clientPage.evaluate(async () => {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      return response.status;
    });
    expect(revokedResponse).toBe(401);
    await clientContext.close();
  });
});
