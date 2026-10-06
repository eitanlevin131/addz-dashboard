import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
const target = new URL(process.env.E2E_DATABASE_URL!);
if (process.env.VERCEL || target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Kickoff E2E requires synthetic isolated storage");
const db = neon(target.href);
const staff = "kickoff-" + randomUUID(), securityStaff = "kickoff-security-" + randomUUID(), customer = "kickoff-client-" + randomUUID();
const email = staff + "@example.test", securityEmail = securityStaff + "@example.test", customerEmail = customer + "@example.test";
const clients: string[] = [];
async function login(page: Page, address: string) {
  await page.goto("/"); await page.getByLabel("אימייל").fill(address);
  await page.getByRole("button", { name: "שלחו לי קוד כניסה", exact: true }).click();
  await expect(page.getByLabel("קוד כניסה")).toBeVisible();
  const result = await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3061}/test/resend-latest?to=${encodeURIComponent(address)}`).then(r => r.json());
  await page.getByLabel("קוד כניסה").fill(String(result.data.text).match(/\b\d{6}\b/)![0]);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/auth/session")).json()).user?.email).toBe(address);
}
async function seed(page: Page) {
  const response = await page.request.post("/api/clients", { data: { name: "[TEST] אפיון תבלינים", packageCode: "email_5", monthlyRetainerAmount: 3210, oneTimeAmount: 999 } });
  expect(response.status()).toBe(201); const client = (await response.json()).data; clients.push(client.id);
  const source = { authority: "website_observed", scanId: randomUUID(), findingId: randomUUID(), sourceId: randomUUID(), url: "https://example.test/shipping", pageType: "shipping", evidence: "נקודת איסוף חינם מעל 150 ₪; משלוח לבית חינם מעל 300 ₪", locator: "main", confidence: "high", reviewDisposition: "normal", category: "operations", key: "shipping_text", value: { text: "משלוח" } };
  const items = [
    { id: "shipping", section: "known", label: "משלוחים", action: "confirm", required: false, suggestion: source.evidence, source },
    { id: "audience", section: "audience", label: "קהל אפשרי", action: "confirm", required: false, suggestion: "ייתכן שבשלנים ביתיים", source: { ...source, authority: "website_inferred", key: "audience_likely" } },
    { id: "tone", section: "brand", label: "שפת המותג", action: "confirm", required: false, suggestion: "השערה על הטון", source: { ...source, authority: "website_inferred", key: "tone" } },
    { id: "priorities", section: "priorities", label: "מוצרים לקידום", action: "ask", required: true },
    { id: "red_lines", section: "rules", label: "גבולות שפה", action: "ask", required: true },
    { id: "calendar", section: "services", label: "תכנון דיוורים", action: "ask", required: false },
  ];
  const answer = (state: string, text = "") => ({ state, text, priority: "normal", links: [], updatedAt: "2026-10-06T12:00:00Z" });
  const snapshot = { version: "questionnaire-v1", clientName: client.name, website: "https://example.test", scanId: source.scanId, items, kickoffTopics: ["מה המיצוב?"], services: ["newsletter"], warnings: [] };
  const answers = { shipping: answer("corrected", "לבית חינם מעל 350 ₪"), audience: answer("rejected", "רוב הלקוחות שפים"), priorities: answer("answered", "מארזים ומתנות"), red_lines: answer("answered", "בלי הבטחות רפואיות"), tone: answer("kickoff"), calendar: answer("unknown") };
  await db`insert into website_scans(id,client_id,website_url,version,configuration,state,status) values(${source.scanId},${client.id},'https://example.test','website-v3','{}','{}','completed')`;
  await db`insert into website_scan_sources(id,scan_id,url,canonical_url,url_hash,page_type,status,text) values(${source.sourceId},${source.scanId},${source.url},${source.url},${source.sourceId},'shipping','completed',${source.evidence})`;
  await db`insert into website_findings(id,scan_id,source_id,category,key,value,evidence,source_type,observation_status,confidence,finding_hash) values(${source.findingId},${source.scanId},${source.sourceId},'operations','shipping_text',${JSON.stringify(source.value)},${source.evidence},'html','observed','high',${source.findingId})`;
  await db.query("insert into client_questionnaires(client_id,snapshot,selected_ids,answers,status,submitted_at) values($1,$2,$3,$4,'submitted',now())", [client.id, JSON.stringify(snapshot), JSON.stringify(items.map(i => i.id)), JSON.stringify(answers)]);
  return client;
}
test.beforeAll(async () => { await db`insert into users(id,email,role,status) values(${staff},${email},'admin','active'),(${securityStaff},${securityEmail},'admin','active'),(${customer},${customerEmail},'client','active')`; });
test.afterAll(async () => {
  for (const id of clients) { await db`delete from audit_logs where client_id=${id}`; await db`delete from clients where id=${id}`; }
  await db`delete from audit_logs where actor_user_id in (${staff},${securityStaff},${customer})`;
  await db`delete from users where id in (${staff},${securityStaff},${customer})`;
});
test("Pre-Kickoff to meeting, provenance, decisions, new information, summary/reopen and RTL mobile", async ({ page }) => {
  test.setTimeout(180000);
  await login(page, email); const client = await seed(page), route = `/api/clients/${client.id}/kickoff`;
  const original = await db`select snapshot,answers from client_questionnaires where client_id=${client.id}`;
  const originalWebsite = await db`select value,evidence,observation_status from website_findings where scan_id=(select snapshot->>'scanId' from client_questionnaires where client_id=${client.id})::uuid`;
  await page.goto(`/?view=client-workspace&clientId=${client.id}&tab=kickoff`);
  await expect(page.getByRole("heading", { name: "פגישת אפיון", exact: true })).toBeVisible();
  fs.mkdirSync("output/playwright/epic4", { recursive: true });
  await page.screenshot({ path: "output/playwright/epic4/empty-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "הכן פגישת אפיון", exact: true }).click();
  await expect(page.getByRole("heading", { name: "משלוחים", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "מידע שכבר אושר", exact: true }).click();
  await expect(page.getByText("מארזים ומתנות", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("בלי הבטחות רפואיות", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "סדר יום והחלטות", exact: true }).click();
  await page.getByLabel("תוצאת הדיון").selectOption("corrected");
  await page.getByLabel("המידע או ההחלטה").fill("משלוח לבית חינם מעל 350 ₪; לנקודת איסוף מעל 150 ₪");
  await page.getByLabel("הערה להחלטה").fill("הלקוח אישר בפגישה");
  await page.getByRole("button", { name: "שמור החלטה", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ההחלטה נשמרה");
  await page.locator('aside[aria-label="סדר יום"]').getByRole("button", { name: "קהל אפשרי", exact: true }).click();
  await page.getByLabel("תוצאת הדיון").selectOption("decision");
  await page.getByLabel("המידע או ההחלטה").fill("קהל ראשי: שפים מקצועיים; אין אישור לקהל הביתי");
  await page.getByRole("button", { name: "שמור החלטה", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ההחלטה נשמרה");
  await page.locator('aside[aria-label="סדר יום"]').getByRole("button", { name: "שפת המותג", exact: true }).click();
  await page.getByLabel("תוצאת הדיון").selectOption("follow_up");
  await page.getByLabel("הערה להחלטה").fill("לקבל דוגמאות לטון מהלקוח");
  await page.getByRole("button", { name: "שמור החלטה", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ההחלטה נשמרה");
  await page.getByText("הוסף נושא מהפגישה", { exact: true }).click();
  await page.getByLabel("נושא חדש", { exact: true }).fill("מניעים לרכישה");
  await page.getByLabel("תחום נושא חדש").selectOption("motivations");
  await page.getByRole("button", { name: "הוסף נושא", exact: true }).click();
  await expect(page.getByRole("heading", { name: "מניעים לרכישה", exact: true })).toBeVisible();
  await page.getByLabel("תוצאת הדיון").selectOption("new_information");
  await page.getByLabel("המידע או ההחלטה").fill("מתנות לאירוח בסופי שבוע");
  await page.getByRole("button", { name: "שמור החלטה", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ההחלטה נשמרה");
  await page.screenshot({ path: "output/playwright/epic4/meeting-desktop.png", fullPage: true });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "סכם פגישה", exact: true }).click();
  await expect(page.getByRole("tab", { name: "אפיון מובנה", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("kickoff-summary-motivations").locator("summary").first().click();
  await expect(page.getByText("מתנות לאירוח בסופי שבוע", { exact: true })).toBeVisible();
  await expect(page.getByText("לקבל דוגמאות לטון מהלקוח", { exact: true })).toBeVisible();
  await expect(page.getByText("אפיון פנימי לעבודה.", { exact: false })).toContainText("אינו Brand Brain מאושר");
  await page.screenshot({ path: "output/playwright/epic4/summary-desktop.png", fullPage: true });
  const final = (await (await page.request.get(route)).json()).data;
  expect(final.status).toBe("completed"); expect(final.summary.resolved).toHaveLength(5);
  expect(final.summary.unresolved).toHaveLength(2); expect(final.summary.followUps).toHaveLength(1);
  expect(final.snapshot.topics.find((t: { id: string }) => t.id === "audience").question.source.authority).toBe("website_inferred");
  expect(await db`select snapshot,answers from client_questionnaires where client_id=${client.id}`).toEqual(original);
  expect(await db`select value,evidence,observation_status from website_findings where scan_id=(select snapshot->>'scanId' from client_questionnaires where client_id=${client.id})::uuid`).toEqual(originalWebsite);
  expect((await page.request.patch(route, { data: { action: "decision", revision: final.revision, topicId: "shipping", outcome: "decision", value: "bad" } })).status()).toBe(409);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "output/playwright/epic4/summary-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "פתח פגישה מחדש", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(route)).json()).data.status).toBe("in_progress");
  await page.getByRole("tab", { name: "סדר יום והחלטות", exact: true }).click();
  await page.screenshot({ path: "output/playwright/epic4/meeting-mobile.png", fullPage: true });
  expect((await db`select count(*)::int as count from audit_logs where client_id=${client.id} and action like 'kickoff.%'`)[0].count).toBe(8);
});
test("staff-only boundaries, CAS concurrency, snapshot isolation, body/origin limits and inert text", async ({ page, browser }) => {
  test.setTimeout(150000);
  await login(page, securityEmail); const client = await seed(page), route = `/api/clients/${client.id}/kickoff`;
  expect((await page.request.post(route)).status()).toBe(201);
  expect((await page.request.post(route)).status()).toBe(409);
  let data = (await (await page.request.get(route)).json()).data;
  const writes = await Promise.all(["first", "second"].map(value => page.request.patch(route, { data: { action: "decision", revision: data.revision, topicId: "shipping", outcome: "decision", value } })));
  expect(writes.map(r => r.status()).sort()).toEqual([200, 409]);
  data = (await (await page.request.get(route)).json()).data;
  expect(Object.keys(data.decisions)).toEqual(["shipping"]);
  expect((await db`select count(*)::int as count from audit_logs where client_id=${client.id} and action='kickoff.decision_saved'`)[0].count).toBe(1);
  for (const extra of [{ topicId: "foreign", outcome: "confirmed" }, { topicId: "shipping", outcome: "decision", value: "x", snapshot: "fake" }]) expect((await page.request.patch(route, { data: { action: "decision", revision: data.revision, ...extra } })).status()).toBe(400);
  expect((await page.request.patch(route, { headers: { origin: "https://attacker.test" }, data: { action: "complete", revision: data.revision } })).status()).toBe(403);
  expect((await page.request.patch(route, { data: { value: "x".repeat(70000) } })).status()).toBe(413);
  await db`update client_questionnaires set answers='{}',revision=revision+1 where client_id=${client.id}`;
  expect((await (await page.request.get(route)).json()).data.snapshot).toEqual(data.snapshot);
  const script = "<script>window.kickoffPwned=true</script>";
  expect((await page.request.patch(route, { data: { action: "decision", revision: data.revision, topicId: "shipping", outcome: "decision", value: script } })).status()).toBe(200);
  await page.goto(`/?view=client-workspace&clientId=${client.id}&tab=kickoff`);
  await expect(page.getByRole("heading", { name: "פגישת אפיון", exact: true })).toBeVisible();
  expect(await page.evaluate(() => "kickoffPwned" in window)).toBe(false);
  const visitor = await browser.newContext();
  for (const method of ["get", "post", "patch"] as const) expect((await visitor.request[method](route)).status()).toBe(401);
  await visitor.close();
  await db`insert into client_users(client_id,user_id) values(${client.id},${customer})`;
  const customerPage = await browser.newPage(); await login(customerPage, customerEmail);
  for (const method of ["get", "post", "patch"] as const) expect((await customerPage.request[method](route)).status()).toBe(403);
  await customerPage.goto(`/?view=client-workspace&clientId=${client.id}&tab=kickoff`);
  await expect(customerPage.getByRole("heading", { name: "פגישת אפיון", exact: true })).not.toBeVisible();
  await customerPage.close();
});
