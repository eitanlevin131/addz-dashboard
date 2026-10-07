import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { encryptSecret } from "../src/lib/crypto";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required for the E2E suite.");
if (process.env.DATABASE_URL) {
  const testUrl = new URL(databaseUrl);
  const appUrl = new URL(process.env.DATABASE_URL);
  const target = (url: URL) => `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname).replace(/\/+$/, "")}`;
  if (target(testUrl) === target(appUrl)) {
    throw new Error("E2E_DATABASE_URL must be isolated from DATABASE_URL.");
  }
}
const mockBaseURL = `http://127.0.0.1:${Number(process.env.E2E_MOCK_PORT || 3061)}`;

const db = neon(databaseUrl);
const suffix = randomUUID().slice(0, 8);
const userId = `e2e-admin-${suffix}`;
const email = `e2e-admin-${suffix}@example.test`;
const summaryUserId = `e2e-summary-${suffix}`;
const summaryEmail = `e2e-summary-${suffix}@example.test`;
const summaryClientUserId = `e2e-summary-client-${suffix}`;
const summaryClientEmail = `e2e-summary-client-${suffix}@example.test`;
const ownerUserId = `e2e-owner-${suffix}`;
const ownerEmail = "e2e-owner@example.test";
const clientUserId = `e2e-client-${suffix}`;
const clientEmail = `e2e-client-${suffix}@example.test`;
const primaryClientId = randomUUID();
const secondaryClientId = randomUUID();
const inactiveClientId = randomUUID();
const primaryAccountId = randomUUID();
const secondaryAccountId = randomUUID();
const inactiveAccountId = randomUUID();
const planId = randomUUID();
const primaryClientName = `E2E Alpha ${suffix}`;
const secondaryClientName = `E2E Beta ${suffix}`;
const inactiveClientName = `E2E Inactive ${suffix}`;
const primaryAccountName = "E2E Alpha Account";
const secondaryAccountName = "E2E Beta Account";
const foundationClientIds: string[] = [];
const foundationUserId = `e2e-foundation-${suffix}`;
const foundationEmail = `e2e-foundation-${suffix}@example.test`;
const foundationEmptyUserId = `e2e-foundation-empty-${suffix}`;
const foundationEmptyEmail = `e2e-foundation-empty-${suffix}@example.test`;
const foundationCustomerUserId = `e2e-foundation-customer-${suffix}`;
const foundationCustomerEmail = `e2e-foundation-customer-${suffix}@example.test`;

function dateOffset(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function currentMonth() {
  return dateOffset(0).slice(0, 7);
}

async function cleanup() {
  await db`delete from audit_logs where actor_user_id in (${foundationUserId}, ${foundationEmptyUserId}, ${foundationCustomerUserId})`;
  for (const id of foundationClientIds) {
    await db`delete from audit_logs where client_id = ${id} or entity_id = ${id}`;
    await db`delete from clients where id = ${id}`;
  }
  await db`delete from audit_logs where actor_user_id in (${userId}, ${summaryUserId}, ${summaryClientUserId}, ${ownerUserId}, ${clientUserId}) or entity_id in (${primaryAccountId}, ${secondaryAccountId}, ${inactiveAccountId}, ${userId}, ${summaryUserId}, ${summaryClientUserId}, ${ownerUserId}, ${clientUserId})`;
  await db`delete from clients where id in (${primaryClientId}, ${secondaryClientId}, ${inactiveClientId})`;
  await db`delete from users where id in (${userId}, ${summaryUserId}, ${summaryClientUserId}, ${ownerUserId}, ${clientUserId}) or email in (${email}, ${summaryEmail}, ${summaryClientEmail}, ${ownerEmail}, ${clientEmail})`;
  await db`delete from users where id in (${foundationUserId}, ${foundationEmptyUserId}, ${foundationCustomerUserId})`;
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

async function openNavigationGroup(
  navigation: import("@playwright/test").Locator,
  group: "ביצועים" | "עבודה" | "ניהול",
) {
  const trigger = navigation.getByRole("button", { name: `קטגוריית ${group}`, exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}

test.describe("agency dashboard critical journey", () => {
  test.beforeAll(async () => {
    await cleanup();
    await db`insert into users (id, name, email, role, status, must_change_password)
      values
        (${userId}, ${"E2E Agency Manager"}, ${email}, ${"admin"}, ${"active"}, false),
        (${summaryUserId}, ${"E2E Summary Manager"}, ${summaryEmail}, ${"admin"}, ${"active"}, false),
        (${summaryClientUserId}, ${"E2E Summary Client"}, ${summaryClientEmail}, ${"client"}, ${"active"}, false),
        (${ownerUserId}, ${"E2E Owner"}, ${ownerEmail}, ${"owner"}, ${"active"}, false),
        (${clientUserId}, ${"E2E Client"}, ${clientEmail}, ${"client"}, ${"active"}, false)`;
    await db`insert into users (id, name, email, role, status) values (${foundationUserId}, ${"E2E Foundation Manager"}, ${foundationEmail}, ${"admin"}, ${"active"}), (${foundationEmptyUserId}, ${"E2E Empty Manager"}, ${foundationEmptyEmail}, ${"admin"}, ${"active"})`;
    await db`insert into users (id, name, email, role, status) values (${foundationCustomerUserId}, ${"E2E Foundation Customer"}, ${foundationCustomerEmail}, ${"client"}, ${"active"})`;
    await db`insert into clients (id, name, owner, industry, visible_modules)
      values
        (${primaryClientId}, ${primaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]}),
        (${secondaryClientId}, ${secondaryClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]}),
        (${inactiveClientId}, ${inactiveClientName}, ${"E2E"}, ${"QA"}, ${["reports", "planner", "ai"]})`;
    await db`insert into flashy_accounts
      (id, client_id, flashy_account_id, name, website, currency, timezone, encrypted_api_key, usd_ils_rate, sms_credit_price_usd, monthly_subscription_cost_usd, agency_retainer_cost_ils, active)
      values
        (${primaryAccountId}, ${primaryClientId}, 990001, ${primaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-primary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true),
        (${secondaryAccountId}, ${secondaryClientId}, 990002, ${secondaryAccountName}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-secondary")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, true),
        (${inactiveAccountId}, ${inactiveClientId}, 990003, ${"E2E Inactive Account"}, ${"https://example.test"}, ${"ILS"}, ${"Asia/Jerusalem"}, ${encryptSecret("e2e-flashy-inactive")}, ${"3.7"}, ${"0.01"}, ${"100"}, ${"1500"}, false)`;
    await db`insert into client_users (client_id, user_id) values (${primaryClientId}, ${clientUserId}), (${primaryClientId}, ${summaryClientUserId}), (${primaryClientId}, ${foundationCustomerUserId})`;
    const plannedDate = new Date();
    plannedDate.setUTCDate(plannedDate.getUTCDate() - 2);
    await db`insert into newsletter_plans
      (id, client_id, flashy_account_id, planned_date, planned_time, channel, kind, status, title, owner, notes)
      values (${planId}, ${primaryClientId}, ${primaryAccountId}, ${plannedDate.toISOString().slice(0, 10)}, ${"11:00"}, ${"email"}, ${"campaign"}, ${"planned"}, ${"E2E launch campaign"}, ${"QA"}, ${"E2E planned send"})`;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("Epic 1 client workspace, structured services, contacts, activity and Flashy linking", async ({
    page,
  }) => {
    await loginWithCode(page, foundationEmail);
    await expect(
      page.getByRole("heading", { name: "סקירת סוכנות" }),
    ).toBeVisible();
    await page.goto("/?view=clients");
    await expect(
      page.getByRole("heading", { name: "לקוחות", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "לקוח חדש", exact: true }).click();
    const name = `E2E Foundation ${suffix}`;
    await page.getByLabel("שם העסק", { exact: true }).fill(name);
    await page.getByLabel("אתר", { exact: true }).fill("https://example.test");
    await page
      .getByLabel("סוג התקשרות", { exact: true })
      .selectOption("automation_setup");
    await expect(
      page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }),
    ).toHaveValue("5000.00");
    await page
      .getByLabel("חבילה", { exact: true })
      .selectOption("automation_setup_6");
    await expect(
      page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }),
    ).toHaveValue("9000.00");
    await page
      .getByLabel("סוג התקשרות", { exact: true })
      .selectOption("whatsapp");
    await expect(
      page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }),
    ).toHaveValue("2000.00");
    await expect(page.getByLabel(/WhatsApp addon/)).toHaveCount(0);
    await page
      .getByLabel("סוג התקשרות", { exact: true })
      .selectOption("email_management");
    await page.getByLabel("חבילה", { exact: true }).selectOption("email_5");
    await expect(page.getByLabel("חבילה", { exact: true }).locator("option:checked")).toHaveText("5 קמפיינים בחודש");
    await expect(page.getByLabel("שדרוג ל-6 אוטומציות + פופאפ")).toHaveCount(0);
    await expect(
      page.getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true }),
    ).toHaveValue("3500.00");
    const customPrice = page.getByLabel("מחיר מותאם / מחיר היסטורי", { exact: true });
    await expect(customPrice).not.toBeChecked();
    await customPrice.check();
    await page.getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true }).fill("2200.00");
    await page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }).fill("750.00");
    await page.getByLabel("חבילה", { exact: true }).selectOption("email_8");
    await expect(page.getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true })).toHaveValue("2200.00");
    await expect(page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true })).toHaveValue("750.00");
    await expect(page.getByRole("region", { name: "סיכום התקשרות", exact: true })).toContainText("מחיר מותאם ללקוח");
    await customPrice.uncheck();
    await expect(page.getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true })).toHaveValue("5000.00");
    await expect(page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true })).toHaveValue("0.00");
    await page.getByLabel("חבילה", { exact: true }).selectOption("email_5");
    await page
      .getByLabel("התחייבות ראשונית", { exact: true })
      .selectOption("3");
    await expect(page.getByText("כולל הקמת 3 אוטומציות + פופאפ ללא עלות הקמה", { exact: true })).toBeVisible();
    await expect(page.getByText("+₪3,000", { exact: true })).toBeVisible();
    await page.getByLabel("שדרוג ל-6 אוטומציות + פופאפ").check();
    await page.getByLabel(/WhatsApp addon/).check();
    await expect(
      page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }),
    ).toHaveValue("4000.00");
    await page
      .getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true })
      .fill("2500.50");
    await page
      .getByLabel("סכום חד פעמי בפועל (₪)", { exact: true })
      .fill("3500.00");
    const commercialSummary = page.getByRole("region", { name: "סיכום התקשרות", exact: true });
    await expect(commercialSummary.getByRole("heading", { name: "5 קמפיינים בחודש", exact: true })).toBeVisible();
    await expect(commercialSummary).toContainText("2,500.5");
    await expect(commercialSummary).toContainText("3,500");
    await expect(commercialSummary).toContainText("6 אוטומציות + פופאפ");
    await expect(commercialSummary).toContainText("כלול כתוספת");
    await commercialSummary.screenshot({ path: "output/playwright/epic1-commercial-summary-desktop.png", animations: "disabled" });
    await page
      .getByRole("button", { name: "הוסף איש קשר", exact: true })
      .click();
    await page.getByLabel("שם איש קשר", { exact: true }).fill("לקוח ראשי");
    await page
      .getByLabel("אימייל", { exact: true })
      .fill(`contact-${suffix}@example.test`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("button", { name: "צור לקוח", exact: true })).toBeInViewport();
    await page.screenshot({
      path: "output/playwright/epic1-new-client-desktop.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await commercialSummary.screenshot({ path: "output/playwright/epic1-commercial-summary-mobile.png", animations: "disabled" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("button", { name: "צור לקוח", exact: true })).toBeInViewport();
    await page.screenshot({
      path: "output/playwright/epic1-new-client-mobile.png",
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/clients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "צור לקוח", exact: true }).click();
    const created = await (await createdResponse).json();
    expect(created.success).toBe(true);
    const id = created.data.id;
    foundationClientIds.push(id);
    await expect(page.getByRole("dialog", { name: "להתחיל סריקת אתר?" })).toBeVisible();
    expect(created.data.initialWebsiteScanId).toBeNull();
    await page.getByRole("button", { name: "לא עכשיו", exact: true }).click();
    expect(created.data.monthlyRetainerAmount).toBe("2500.50");
    expect(created.data.ownerUserId).toBe(foundationUserId);
    expect(created.data.includedServices).toEqual([
      { code: "newsletter" },
      { code: "automations" },
      { code: "whatsapp" },
    ]);
    expect(created.data.oneTimeAmount).toBe("3500.00");
    expect(created.data.commercialScope.campaignLimit).toBe(5);
    expect(created.data.onboardingStage).toBe("client_created");
    const [contactUser] =
      await db`select count(*)::integer as count from users where email = ${`contact-${suffix}@example.test`}`;
    expect(contactUser.count).toBe(0);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "עריכת פרטים", exact: true })
      .click();
    await expect(customPrice).toBeChecked();
    await page.getByLabel("חבילה", { exact: true }).selectOption("email_8");
    await expect(page.getByLabel("חבילה", { exact: true }).locator("option:checked")).toHaveText("8 קמפיינים בחודש");
    await expect(page.getByText("+₪2,000", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("ריטיינר חודשי בפועל (₪)", { exact: true }),
    ).toHaveValue("2500.50");
    await expect(
      page.getByLabel("סכום חד פעמי בפועל (₪)", { exact: true }),
    ).toHaveValue("3500.00");
    await page
      .getByRole("button", { name: "שמור שינויים", exact: true })
      .click();
    await expect(
      page.getByText("Email Marketing · 8 קמפיינים", { exact: true }),
    ).toBeVisible();
    const updated = await (await page.request.get(`/api/clients/${id}`)).json();
    expect(updated.data.monthlyRetainerAmount).toBe("2500.50");
    expect(updated.data.includedServices).toEqual(
      created.data.includedServices,
    );
    expect(updated.data.packageCode).toBe("email_8");
    expect(updated.data.commercialScope.campaignLimit).toBe(8);
    expect(updated.data.commercialScope.automationSetupTier).toBe(6);
    expect(updated.data.oneTimeAmount).toBe("3500.00");
    await page.getByRole("tab", { name: "אנשי קשר", exact: true }).click();
    await page
      .getByRole("button", { name: "הוסף איש קשר", exact: true })
      .click();
    await page.getByLabel("שם איש קשר", { exact: true }).fill("מנהלת מותג");
    await page.getByLabel("איש קשר ראשי", { exact: true }).check();
    await page
      .getByRole("button", { name: "שמור איש קשר", exact: true })
      .click();
    await expect(
      page.getByText("איש הקשר נשמר.", { exact: true }),
    ).toBeVisible();
    const [primaryCount] =
      await db`select count(*)::integer as count from client_contacts where client_id = ${id} and is_primary = true`;
    expect(primaryCount.count).toBe(1);
    const [newPrimary] =
      await db`select name from client_contacts where client_id = ${id} and is_primary = true`;
    expect(newPrimary.name).toBe("מנהלת מותג");
    const contactsResponse = await page.request.get(
      `/api/clients/${id}/contacts`,
    );
    expect((await contactsResponse.json()).data).toHaveLength(2);
    const mismatch = await page.request.patch(
      `/api/clients/${secondaryClientId}/contacts/${created.data.contacts[0].id}`,
      { data: { name: "wrong", isPrimary: true } },
    );
    expect(mismatch.status()).toBe(404);
    const deniedProvision = await page.request.post("/api/live-client", {
      data: {
        clientId: id,
        apiKey: "e2e-flashy-foundation",
        clientEmail: `forbidden-${suffix}@example.test`,
      },
    });
    expect(deniedProvision.status()).toBe(403);
    const parallel = await Promise.all(
      [1, 2].map((index) =>
        page.request.post(`/api/clients/${id}/contacts`, {
          data: { name: `Concurrent ${index}`, isPrimary: true },
        }),
      ),
    );
    expect(parallel.map((response) => response.status())).toEqual([201, 201]);
    const [concurrentPrimary] =
      await db`select count(*)::integer as count from client_contacts where client_id = ${id} and is_primary = true`;
    expect(concurrentPrimary.count).toBe(1);
    await page.getByRole("tab", { name: "פעילות", exact: true }).click();
    await expect(
      page.getByText("לקוח נוצר", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByText("איש קשר ראשי הוחלף", { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: "output/playwright/epic1-activity-desktop.png",
      fullPage: true,
    });
    await page.getByRole("tab", { name: "סקירה", exact: true }).click();
    await page.getByRole("button", { name: "חבר Flashy", exact: true }).click();
    await page
      .getByLabel("API key", { exact: true })
      .fill("e2e-flashy-foundation");
    await page.getByRole("button", { name: "חבר חשבון", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "פתח דוחות", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    const [linked] =
      await db`select count(*)::integer as count from flashy_accounts where client_id = ${id}`;
    expect(linked.count).toBe(1);
    const duplicate = await page.request.post("/api/live-client", {
      data: { clientId: id, apiKey: "e2e-flashy-foundation" },
    });
    expect(duplicate.status()).toBe(409);
    await page.screenshot({
      path: "output/playwright/epic1-workspace-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "output/playwright/epic1-workspace-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "פתח דוחות", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "E2E Foundation Account",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/?view=clients");
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({
      path: "output/playwright/epic1-clients-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/playwright/epic1-clients-mobile.png",
      fullPage: true,
      animations: "disabled",
    });

    const concurrentClient = await (
      await page.request.post("/api/clients", {
        data: { name: `E2E Concurrent ${suffix}` },
      })
    ).json();
    expect(concurrentClient.success).toBe(true);
    foundationClientIds.push(concurrentClient.data.id);
    const concurrentConnections = await Promise.all(
      [1, 2].map(() =>
        page.request.post("/api/live-client", {
          data: {
            clientId: concurrentClient.data.id,
            apiKey: "e2e-flashy-concurrent",
          },
        }),
      ),
    );
    expect(
      concurrentConnections.map((response) => response.status()).sort(),
    ).toEqual([201, 409]);
    const [concurrentAccounts] =
      await db`select count(*)::integer as count from flashy_accounts where flashy_account_id = 990005`;
    expect(concurrentAccounts.count).toBe(1);

    const rollbackId = randomUUID();
    await expect(
      db.transaction([
        db`insert into clients (id, name) values (${rollbackId}, ${"E2E rollback"})`,
        db`insert into audit_logs (actor_user_id, client_id, action, entity_type) values (${"missing-actor"}, ${rollbackId}, ${"client.created"}, ${"client"})`,
      ]),
    ).rejects.toThrow();
    const [rollback] =
      await db`select count(*)::integer as count from clients where id = ${rollbackId}`;
    expect(rollback.count).toBe(0);

    for (const [packageCode, monthlyAmount, oneTimeAmount] of [
      ["email_5", "3500.00", "0.00"],
      ["email_8", "5000.00", "0.00"],
      ["automation_setup_3", "0.00", "5000.00"],
      ["automation_setup_6", "0.00", "9000.00"],
      ["whatsapp_standalone", "0.00", "2000.00"],
    ]) {
      const response = await page.request.post("/api/clients", {
        data: { name: `E2E Package ${packageCode} ${suffix}`, packageCode },
      });
      expect(response.status()).toBe(201);
      const payload = await response.json();
      foundationClientIds.push(payload.data.id);
      expect(payload.data.monthlyRetainerAmount).toBe(monthlyAmount);
      expect(payload.data.oneTimeAmount).toBe(oneTimeAmount);
      const badScope = await page.request.patch(
        `/api/clients/${payload.data.id}`,
        { data: { includedServices: [{ code: "sms" }] } },
      );
      expect(badScope.status()).toBe(400);
    }
    const legacyBefore = await (
      await page.request.get(`/api/clients/${primaryClientId}`)
    ).json();
    expect(legacyBefore.data.packageCode).toBe(null);
    await page.request.patch(`/api/clients/${primaryClientId}`, {
      data: { internalNotes: "E2E legacy preserved" },
    });
    const legacyAfter = await (
      await page.request.get(`/api/clients/${primaryClientId}`)
    ).json();
    expect(legacyAfter.data.packageCode).toBe(null);
    expect(legacyAfter.data.includedServices).toEqual(
      legacyBefore.data.includedServices,
    );
  });

  test("Epic 1 staff shell supports no report accounts and client access is denied", async ({
    page,
    browser,
  }) => {
    await loginWithCode(page, foundationEmptyEmail);
    await expect(
      page.getByRole("heading", { name: "סקירת סוכנות" }),
    ).toBeVisible();
    await page.route("**/api/dashboard-data", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.data.clients = [];
      payload.data.accounts = [];
      payload.data.emailReports = [];
      payload.data.smsReports = [];
      payload.data.automationReports = [];
      payload.data.newsletterPlans = [];
      await route.fulfill({ response, json: payload });
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "לקוחות", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "לקוח חדש", exact: true }),
    ).toBeVisible();
    const isolated = await browser.newContext();
    const customer = await isolated.newPage();
    try {
      await loginWithCode(customer, foundationCustomerEmail);
      await expect(
        customer.getByRole("heading", { name: primaryAccountName }),
      ).toBeVisible();
      for (const path of [
        "/api/clients",
        `/api/clients/${primaryClientId}`,
        `/api/clients/${primaryClientId}/activity`,
        `/api/clients/${primaryClientId}/contacts`,
        "/api/clients/options",
      ])
        expect((await customer.request.get(path)).status()).toBe(403);
      expect(
        (
          await customer.request.post("/api/clients", {
            data: { name: "forbidden" },
          })
        ).status(),
      ).toBe(403);
      const reports = await (
        await customer.request.get("/api/dashboard-data")
      ).json();
      expect(
        reports.data.clients.every((client: Record<string, unknown>) =>
          [
            "monthlyRetainerAmount",
            "oneTimeAmount",
            "commercialScope",
            "packageCode",
            "internalNotes",
          ].every((field) => !(field in client)),
        ),
      ).toBe(true);
      await customer.goto(
        "/?view=client-workspace&clientId=" + primaryClientId,
      );
      await expect(
        customer.getByRole("heading", { name: primaryAccountName }),
      ).toBeVisible();
      await expect(
        customer.getByRole("button", { name: "עריכת פרטים", exact: true }),
      ).toHaveCount(0);
    } finally {
      await isolated.close();
    }
  });

  test("login, client selection, range, sync, reports, planner and grounded AI", async ({ page }) => {
    await page.goto("/");
    const protectedEndpoints = await page.evaluate(async () => {
      const [accounts, sync, recommendations] = await Promise.all([
        fetch("/api/flashy/accounts"),
        fetch("/api/flashy/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        fetch("/api/ai/recommendations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      ]);
      return [accounts.status, sync.status, recommendations.status];
    });
    expect(protectedEndpoints).toEqual([401, 401, 401]);

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
    expect(storedCode.provider_message_id).toBe(deliveredEmail.data.id);
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
    await expect(clientSelector.locator("option").filter({ hasText: inactiveClientName })).toHaveCount(0);
    await clientSelector.selectOption(secondaryClientId);
    await expect(page.getByRole("heading", { name: secondaryAccountName, exact: true })).toBeVisible();
    await clientSelector.selectOption(primaryClientId);
    await expect(page.getByRole("heading", { name: primaryAccountName, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "7 ימים", exact: true }).click();
    await expect(page.getByRole("button", { name: "7 ימים", exact: true })).toHaveClass(/bg-\[#111318\]/);
    await page.getByRole("button", { name: "30 ימים", exact: true }).click();
    await expect(page.getByRole("button", { name: "30 ימים", exact: true })).toHaveClass(/bg-\[#111318\]/);

    const navigation = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(navigation.getByRole("button", { name: "קטגוריית ביצועים", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("button", { name: "קטגוריית עבודה", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("button", { name: "קטגוריית ניהול", exact: true })).toHaveAttribute("aria-expanded", "false");
    await openNavigationGroup(navigation, "ניהול");
    await expect(navigation.getByRole("button", { name: "משתמשים", exact: true })).toBeVisible();
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

    await navigation.getByRole("button", { name: "סגירת חודש", exact: true }).click();
    await expect(page.getByRole("heading", { name: "סגירת חודש", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: primaryClientName, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: secondaryClientName, exact: true })).toBeVisible();
    await expect(page.getByText(inactiveClientName, { exact: true })).toHaveCount(0);
    const primaryCloseRow = page.locator("article").filter({ has: page.getByRole("heading", { name: primaryClientName, exact: true }) });
    await primaryCloseRow.getByRole("button", { name: "צור טיוטה", exact: true }).click();
    await expect(page.getByText(`הטיוטה של ${primaryClientName} נוצרה. אפשר לפתוח אותה ולהשלים את הנתונים החסרים.`, { exact: true })).toBeVisible();
    await expect(primaryCloseRow.getByText("טיוטה", { exact: true })).toBeVisible();
    await page.getByRole("group", { name: "סינון חשבונות" }).getByRole("button", { name: "מוכן", exact: true }).click();
    await expect(page.getByText("אין חשבונות בסינון הזה.", { exact: true })).toBeVisible();
    await page.getByRole("group", { name: "סינון חשבונות" }).getByRole("button", { name: "דורש טיפול", exact: true }).click();
    await expect(page.getByRole("heading", { name: primaryClientName, exact: true })).toBeVisible();
    await page.getByRole("group", { name: "סינון חשבונות" }).getByRole("button", { name: "הכל", exact: true }).click();
    await primaryCloseRow.getByRole("button", { name: "פתח טיוטה", exact: true }).click();
    await expect(page.getByText("יצירת סיכום חודשי", { exact: true })).toBeVisible();
    await openNavigationGroup(navigation, "ניהול");
    await navigation.getByRole("button", { name: "סגירת חודש", exact: true }).click();
    await page.getByRole("group", { name: "תצוגת מרכז תפעול" }).getByRole("button", { name: "איכות נתונים", exact: true }).click();
    await expect(page.getByText("Snapshot", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNavigationTrigger = page.getByRole("button", { name: "פתיחת תפריט", exact: true });
    await mobileNavigationTrigger.click();
    const mobileNavigation = page.getByRole("navigation", { name: "ניווט ראשי במובייל" });
    await expect(mobileNavigation.getByRole("heading", { name: "ביצועים", exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole("heading", { name: "עבודה", exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole("heading", { name: "ניהול", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(mobileNavigation).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });

    await openNavigationGroup(navigation, "ביצועים");
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
    await expect(page.getByText("הסרות", { exact: true }).first()).toBeVisible();
    const smsTrendMetric = page.getByRole("group", { name: "מדד בגרף פעילות SMS" });
    await smsTrendMetric.getByRole("button", { name: "הסרות", exact: true }).click();
    await expect(smsTrendMetric.getByRole("button", { name: "הסרות", exact: true })).toHaveAttribute("aria-pressed", "true");
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
    const automationFilter = page.getByRole("group", { name: "סינון לפי סוג אוטומציה" });
    await automationFilter.getByRole("button", { name: "אימייל בלבד", exact: true }).click();
    await expect(automationFilter.getByRole("button", { name: "אימייל בלבד", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/כל 1 האוטומציות עם פעילות בטווח/)).toBeVisible();
    await expect(page.getByRole("button", { name: /כל האוטומציות/ })).toHaveCount(0);
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
    await expect(page.getByText("הכנסות מקמפיינים", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "הכנסות מקמפיינים לאורך התקופה", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "חלוקת הכנסות בין הערוצים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "קמפייני אימייל מובילים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "קמפייני SMS מובילים", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "תזמון שעובד", exact: true })).toBeVisible();
    await expect(page.getByText("12 הסרות מתוך 3,100 נמענים", { exact: true })).toBeVisible();
    const campaignTrendFilter = page.getByRole("group", { name: "ערוץ בגרף ההכנסות" });
    await campaignTrendFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(campaignTrendFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");
    const campaignTimingFilter = page.getByRole("group", { name: "ערוץ בניתוח תזמון" });
    await campaignTimingFilter.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(campaignTimingFilter.getByRole("button", { name: "SMS", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });

    await openNavigationGroup(navigation, "עבודה");
    await navigation.getByRole("button", { name: "גאנט דיוורים", exact: true }).click();
    await expect(page.getByRole("heading", { name: "גאנט דיוורים", exact: true })).toBeVisible();
    const plannedCampaign = page.getByRole("button", { name: "פתח בריף: E2E launch campaign", exact: true });
    await expect(plannedCampaign).toContainText("נשלח");
    await expect(plannedCampaign).not.toContainText("E2E planned send");
    await expect(plannedCampaign).toHaveClass(/bg-\[#dfe9ff\]/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(plannedCampaign).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });

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

    await page.getByRole("button", { name: "רעיונות", exact: true }).click();
    await expect(page.getByRole("heading", { name: "בנק רעיונות", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "רעיון חדש", exact: true }).click();
    await page.getByLabel("שם הרעיון", { exact: true }).fill("E2E idea bank concept");
    await page.getByLabel("בריף", { exact: true }).fill("רעיון שנשמר לפני בחירת תאריך.");
    await page.getByRole("button", { name: "שמור בבנק", exact: true }).click();
    const ideaCard = page.locator("article").filter({ hasText: "E2E idea bank concept" });
    await expect(ideaCard).toBeVisible();
    await ideaCard.getByRole("button", { name: "העתק לגאנט", exact: true }).click();
    await expect(page.getByText("הרעיון הועתק כבריף ללא תאריך. אפשר להשלים ולשבץ אותו ביומן.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "סגירה", exact: true }).click();

    await page.getByRole("button", { name: "טבלה", exact: true }).click();
    await page.getByRole("button", { name: "E2E launch campaign", exact: true }).click();
    const actualResults = page.locator("section").filter({ hasText: "תוצאות בפועל" }).last();
    await expect(actualResults.getByText("תוצאות בפועל", { exact: true })).toBeVisible();
    await expect(actualResults).toContainText("8,400");
    await page.getByLabel("מטרת הקמפיין", { exact: true }).selectOption("launch");
    await page.getByLabel("מה למדנו", { exact: true }).fill("הצעה ישירה לקהל חוזר עבדה טוב יותר.");
    await page.getByPlaceholder("שם הקישור", { exact: true }).fill("E2E creative brief");
    await page.getByPlaceholder("https://...", { exact: true }).fill("https://example.com/creative-brief");
    await page.getByRole("button", { name: "הוסף קישור", exact: true }).click();
    await expect(page.getByText("יישמר כקישור", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "שמור שינויים", exact: true }).click();
    await expect(page.getByText("למידה שמורה", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "E2E launch campaign", exact: true }).click();
    await expect(page.getByLabel("מטרת הקמפיין", { exact: true })).toHaveValue("launch");
    await expect(page.getByLabel("מה למדנו", { exact: true })).toHaveValue("הצעה ישירה לקהל חוזר עבדה טוב יותר.");
    await expect(page.getByText("example.com", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "פתח E2E creative brief", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "סגירה", exact: true }).click();

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

  test("monthly summary requires complete inputs, publishes, shares and sends", async ({ page, browser }) => {
    await loginWithCode(page, summaryEmail);
    await expect(page.getByRole("heading", { name: "סקירת סוכנות" })).toBeVisible();
    const clientSelector = page.locator("#client-select");
    await clientSelector.selectOption(primaryClientId);
    await expect(page.getByRole("heading", { name: primaryAccountName, exact: true })).toBeVisible();
    const summarySyncStatus = await page.evaluate(async (accountId) => {
      const response = await fetch("/api/flashy/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      return response.status;
    }, primaryAccountId);
    expect(summarySyncStatus).toBe(200);
    const storedCampaigns = await db`select sent_at from email_campaign_reports where flashy_account_id = ${primaryAccountId}`;
    expect(storedCampaigns.length).toBeGreaterThan(0);

    const navigation = page.getByRole("navigation", { name: "ניווט ראשי" });
    await openNavigationGroup(navigation, "עבודה");
    await navigation.getByRole("button", { name: "סיכומים", exact: true }).click();
    await expect(page.getByText("יצירת סיכום חודשי", { exact: true })).toBeVisible();
    await page.getByLabel("חודש", { exact: true }).fill(currentMonth());
    await page.getByRole("button", { name: "הפק סיכום", exact: true }).click();
    await expect(page.getByText("הסיכום נוצר כטיוטה. אפשר לבדוק, לערוך ולאשר אותו.", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "בדיקות לפני אישור" })).toContainText("1/3 הושלמו");
    await expect(page.getByRole("button", { name: "אשר ופרסם ללקוח", exact: true })).toBeDisabled();

    const summaryId = await page.evaluate(async (accountId) => {
      const response = await fetch(`/api/monthly-summaries?accountId=${encodeURIComponent(accountId)}`);
      const payload = await response.json();
      return payload.data[0].id as string;
    }, primaryAccountId);
    const clientContext = await browser.newContext({ locale: "he-IL", timezoneId: "Asia/Jerusalem" });
    const clientPage = await clientContext.newPage();
    await loginWithCode(clientPage, summaryClientEmail);
    await expect(clientPage.getByRole("heading", { name: primaryAccountName, exact: true })).toBeVisible();
    const draftStatus = await clientPage.evaluate(async (id) => (await fetch(`/api/monthly-summaries/${id}`)).status, summaryId);
    expect(draftStatus).toBe(403);

    await page.getByLabel("מחזור האתר", { exact: true }).fill("50000");
    await page.getByLabel("נרשמי Popup", { exact: true }).fill("250");
    await page.getByLabel(/המרת Popup/).fill("5");
    await page.getByRole("button", { name: "הפק סיכום", exact: true }).click();
    await expect(page.getByRole("region", { name: "בדיקות לפני אישור" })).toContainText("3/3 הושלמו");
    const eligibleCampaigns = [
      { date: dateOffset(-2), unsubscribed: 4, recipients: 1200 },
      { date: dateOffset(-5), unsubscribed: 3, recipients: 900 },
      { date: dateOffset(-1), unsubscribed: 5, recipients: 1000 },
    ].filter(campaign => campaign.date.startsWith(currentMonth()));
    const expectedUnsubscribed = eligibleCampaigns.reduce((total, campaign) => total + campaign.unsubscribed, 0);
    const expectedRecipients = eligibleCampaigns.reduce((total, campaign) => total + campaign.recipients, 0);
    await expect(page.getByText(`${expectedUnsubscribed} הסרות מתוך ${new Intl.NumberFormat("he-IL").format(expectedRecipients)} נמענים`, { exact: true })).toBeVisible();
    const approve = page.getByRole("button", { name: "אשר ופרסם ללקוח", exact: true });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByText("הסיכום אושר וזמין עכשיו ללקוח.", { exact: true })).toBeVisible();

    const approvedStatus = await clientPage.evaluate(async (id) => (await fetch(`/api/monthly-summaries/${id}`)).status, summaryId);
    expect(approvedStatus).toBe(200);
    await clientPage.setViewportSize({ width: 390, height: 844 });
    await clientPage.goto(`/summaries/${summaryId}`);
    await expect(clientPage.getByText("הכנסה שיוחסה לפעילות Flashy", { exact: true })).toBeVisible();
    await expect(clientPage.getByText("בריאות הרשימה", { exact: true })).toBeVisible();
    expect(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
    await expect(page.locator('textarea[rows="22"]')).toHaveValue(new RegExp(`^\\*לצפייה בסיכום המלא והאינטראקטיבי:\\*\\n[^\\n]+/summaries/${summaryId}\\n`));
    await page.getByRole("button", { name: "מייל", exact: true }).click();
    await page.getByLabel(/^נמענים/).fill(summaryClientEmail);
    await page.getByRole("button", { name: "שלח סיכום במייל", exact: true }).click();
    await expect(page.getByText("הסיכום נשלח בהצלחה ל־1 כתובות.", { exact: true })).toBeVisible();
    const [sentSummaryRecord] = await db`select status, period_start::text as period_start, sent_at from monthly_summaries where id = ${summaryId}`;
    expect(sentSummaryRecord.status).toBe("sent");
    expect(String(sentSummaryRecord.period_start)).toBe(`${currentMonth()}-01`);
    expect(sentSummaryRecord.sent_at).toBeTruthy();
    const delivered = await fetch(`${mockBaseURL}/test/resend-latest?to=${encodeURIComponent(summaryClientEmail)}`).then((response) => response.json());
    expect(delivered.data.subject).toContain("סיכום");
    expect(delivered.data.text).toContain(`/summaries/${summaryId}`);

    await openNavigationGroup(navigation, "ניהול");
    await navigation.getByRole("button", { name: "סגירת חודש", exact: true }).click();
    await page.getByLabel("חודש", { exact: true }).fill(currentMonth());
    const closeRow = await page.evaluate(async ({ month, accountId }) => {
      const response = await fetch(`/api/monthly-close?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      return payload.data.rows.find((row: { accountId: string }) => row.accountId === accountId);
    }, { month: currentMonth(), accountId: primaryAccountId });
    expect(closeRow.summary.id).toBe(summaryId);
    expect(closeRow.summary.status).toBe("sent");
    expect(closeRow.summary.latestDelivery.recipients).toContain(summaryClientEmail);
    await page.getByRole("group", { name: "סינון חשבונות" }).getByRole("button", { name: "נשלח", exact: true }).click();
    const sentCloseRow = page.locator("article").filter({ has: page.getByRole("heading", { name: primaryClientName, exact: true }) });
    await expect(sentCloseRow.getByText("נשלח", { exact: true })).toBeVisible();
    await expect(sentCloseRow).toContainText(summaryClientEmail);
    await clientContext.close();
  });

  test("owner controls access and a client sees only assigned data", async ({ page, browser }) => {
    await loginWithCode(page, ownerEmail);
    await expect(page.getByRole("heading", { name: "סקירת סוכנות" })).toBeVisible();
    const ownerNavigation = page.getByRole("navigation", { name: "ניווט ראשי" });
    await openNavigationGroup(ownerNavigation, "ניהול");
    await expect(ownerNavigation.getByRole("button", { name: "משתמשים", exact: true })).toBeVisible();

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
    await expect(clientNavigation.getByRole("button", { name: "סגירת חודש", exact: true })).toHaveCount(0);
    await expect(clientNavigation.getByRole("button", { name: "הגדרות", exact: true })).toHaveCount(0);
    await expect(clientNavigation.getByRole("button", { name: "משתמשים", exact: true })).toHaveCount(0);
    const monthlyCloseStatus = await clientPage.evaluate(async () => (await fetch("/api/monthly-close")).status);
    expect(monthlyCloseStatus).toBe(403);

    await clientPage.setViewportSize({ width: 390, height: 844 });
    await clientPage.getByRole("button", { name: "פתיחת תפריט", exact: true }).click();
    const clientMobileNavigation = clientPage.getByRole("navigation", { name: "ניווט ראשי במובייל" });
    await expect(clientMobileNavigation.getByRole("heading", { name: "ביצועים", exact: true })).toBeVisible();
    await expect(clientMobileNavigation.getByRole("heading", { name: "עבודה", exact: true })).toBeVisible();
    await expect(clientMobileNavigation.getByRole("heading", { name: "ניהול", exact: true })).toHaveCount(0);
    await expect(clientMobileNavigation.getByRole("button", { name: "סוכנות", exact: true })).toHaveCount(0);
    expect(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

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
