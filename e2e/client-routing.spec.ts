import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";
import { encryptSecret } from "../src/lib/crypto";

const target = new URL(process.env.E2E_DATABASE_URL!);
if (process.env.VERCEL || target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Routing tests require isolated storage");
const db = neon(target.href), suffix = randomUUID().slice(0, 8);
const staff = `route-staff-${suffix}`, customer = `route-client-${suffix}`;
const email = `${staff}@example.test`, customerEmail = `${customer}@example.test`;
const ids: string[] = [], slug = `routing-${suffix}`;
async function login(page: Page, address: string, path = "/") {
  await page.goto(path);
  await page.getByLabel("אימייל").fill(address);
  await page.getByRole("button", { name: "שלחו לי קוד כניסה", exact: true }).click();
  await expect(page.getByLabel("קוד כניסה")).toBeVisible();
  const message = await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT}/test/resend-latest?to=${encodeURIComponent(address)}`).then(response => response.json());
  await page.getByLabel("קוד כניסה").fill(String(message.data.text).match(/\b\d{6}\b/)![0]);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/auth/session")).json()).user?.email).toBe(address);
}
test.beforeAll(async () => {
  await db`insert into users(id,email,role,status) values(${staff},${email},'admin','active'),(${customer},${customerEmail},'client','active')`;
});
test.afterAll(async () => {
  for (const id of ids) { await db`delete from audit_logs where client_id=${id}`; await db`delete from clients where id=${id}`; }
  await db`delete from audit_logs where actor_user_id in (${staff},${customer})`;
  await db`delete from users where id in (${staff},${customer})`;
});
test("named routes, UUID compatibility, refresh/history, alias stability and RTL mobile", async ({ page }) => {
  test.setTimeout(180000);
  await login(page, email);
  const created = await page.request.post("/api/clients", { data: { name: `[TEST] Routing ${suffix}`, urlSlug: slug, packageCode: "email_5", startWebsiteScan: false } });
  expect(created.status()).toBe(201);
  const client = (await created.json()).data; ids.push(client.id);
  expect((await page.request.post("/api/clients", { data: { name: "duplicate", urlSlug: slug } })).status()).toBe(409);
  expect((await page.request.patch(`/api/clients/${client.id}`, { data: { urlSlug: "renamed" } })).status()).toBe(400);
  const bare = await page.request.post("/api/clients", { data: { name: `[TEST] Alias race ${suffix}`, startWebsiteScan: false } });
  const bareClient = (await bare.json()).data; ids.push(bareClient.id);
  const aliases = [`first-${suffix}`, `second-${suffix}`];
  await Promise.all(aliases.map(urlSlug => page.request.patch(`/api/clients/${bareClient.id}`, { data: { urlSlug } })));
  const stored = (await (await page.request.get(`/api/clients/${bareClient.id}`)).json()).data;
  expect(aliases).toContain(stored.urlSlug);
  expect((await page.request.patch(`/api/clients/${bareClient.id}`, { data: { urlSlug: aliases.find(value => value !== stored.urlSlug) } })).status()).toBe(400);
  await page.goto(`/${slug}/contacts`);
  await expect(page.getByRole("tab", { name: "אנשי קשר", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "סריקת אתר", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/website$`));
  await expect(page.getByRole("tab", { name: "סריקת אתר", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "סריקת אתר", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "פעילות", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/activity$`));
  await page.goBack();
  await expect(page.getByRole("tab", { name: "סריקת אתר", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "פעילות", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(`/?view=client-workspace&clientId=${client.id}&tab=contacts`);
  await expect(page.getByRole("tab", { name: "אנשי קשר", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(`/${client.id}/questionnaire`);
  await expect(page.getByRole("tab", { name: "שאלון לקוח", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  fs.mkdirSync("output/playwright/routing", { recursive: true });
  await page.screenshot({ path: "output/playwright/routing/mobile.png", fullPage: true });
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "לקוחות", exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/workspace$`));
  const unknown = await page.goto(`/missing-${suffix}/gantt`);
  expect(unknown?.status()).toBe(404);
});
test("deep-link login returns to the same client/module; internal and foreign routes remain blocked", async ({ page, browser }) => {
  test.setTimeout(150000);
  const id = randomUUID(), foreign = randomUUID(), alias = `private-${suffix}`;
  ids.push(id, foreign);
  await db`insert into clients(id,name,url_slug,visible_modules) values(${id},'Routing authorized',${alias},array['reports','planner']),(${foreign},'Routing foreign',${`foreign-${suffix}`},array['reports','planner'])`;
  await db`insert into flashy_accounts(client_id,name,encrypted_api_key) values(${id},'Routing Account',${encryptSecret("mock-routing-key")})`;
  await db`insert into client_users(client_id,user_id) values(${id},${customer})`;
  await login(page, customerEmail, `/${alias}/gantt`);
  expect((await (await page.request.get("/api/dashboard-data")).json()).data.workspaceClients).toEqual([]);
  await expect(page).toHaveURL(new RegExp(`/${alias}/gantt$`));
  await expect(page.getByRole("heading", { name: "Routing Account", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Routing Account", exact: true })).toBeVisible();
  for (const path of [`/${alias}/website`, `/${alias}/contacts`, `/${alias}/questionnaire`, `/${alias}/kickoff`, `/${alias}/ai`, `/${foreign}/gantt`, `/foreign-${suffix}/gantt`]) {
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Routing Account", exact: true })).not.toBeVisible();
  }
  expect((await page.request.get(`/api/clients/${id}/website-scans`)).status()).toBe(403);
  expect((await page.request.get(`/api/clients/${id}/questionnaire`)).status()).toBe(403);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/clients/${id}/questionnaire`)).status()).toBe(401);
  await anonymous.close();
});
