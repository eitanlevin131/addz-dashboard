import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
const target = new URL(process.env.E2E_DATABASE_URL!);
if (process.env.VERCEL || target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Questionnaire E2E requires synthetic isolated storage");
const db = neon(target.href);
const staff = "questionnaire-" + randomUUID();
const securityStaff = "questionnaire-security-" + randomUUID();
const customer = "questionnaire-client-" + randomUUID();
const email = staff + "@example.test";
const securityEmail = securityStaff + "@example.test";
const customerEmail = customer + "@example.test";
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
async function create(page: Page, name: string, scope = false) {
  const response = await page.request.post("/api/clients", { data: { name, internalNotes: "PRIVATE INTERNAL NOTES", ...(scope ? { packageCode: "email_5", monthlyRetainerAmount: 3210, oneTimeAmount: 999 } : {}) } });
  expect(response.status()).toBe(201); const client = (await response.json()).data; clients.push(client.id); return client;
}
const publicHeaders = (token: string) => ({ authorization: `Bearer ${token}` });
test.beforeAll(async () => {
  await db`insert into users(id,email,role,status) values (${staff},${email},'admin','active'),(${securityStaff},${securityEmail},'admin','active'),(${customer},${customerEmail},'client','active')`;
});
test.afterAll(async () => {
  for (const id of clients) { await db`delete from audit_logs where client_id=${id}`; await db`delete from clients where id=${id}`; }
  await db`delete from audit_logs where actor_user_id in (${staff},${securityStaff},${customer})`;
  await db`delete from users where id in (${staff},${securityStaff},${customer})`;
});
test("personalized team review, secure public link, autosave/resume, corrections and Pre-Kickoff RTL mobile loop", async ({ page, browser }) => {
  test.setTimeout(180000);
  await login(page, email);
  const client = await create(page, "[TEST] תבלינים ושאלון", true);
  await page.request.patch(`/api/clients/${client.id}`, { data: { website: "https://questionnaire-fixture.example.com" } });
  const scan = randomUUID(), source = randomUUID(), shipping = randomUUID(), audience = randomUUID(), ignored = randomUUID(), unresolved = randomUUID(), product = randomUUID(), returns = randomUUID();
  await db`insert into website_scans(id,client_id,website_url,version,configuration,state,status) values(${scan},${client.id},'https://questionnaire-fixture.example.com','website-v3','{}','{}','completed')`;
  await db`insert into website_scan_sources(id,scan_id,url,canonical_url,url_hash,page_type,status,text) values(${source},${scan},'https://questionnaire-fixture.example.com/shipping','https://questionnaire-fixture.example.com/shipping',${source},'shipping','completed','משלוח לבית חינם מעל 300 ₪. בשלנים ביתיים מוצאים כאן תבלינים.')`;
  const fixture = [
    { id: shipping, category: "operations", key: "shipping_text", value: { text: "משלוח לבית חינם מעל 300 ₪" }, evidence: "משלוח לבית חינם מעל 300 ₪", status: "observed", review: "normal" },
    { id: audience, category: "audience", key: "likely_audience", value: { summary: "ייתכן שבשלנים ביתיים הם קהל רלוונטי" }, evidence: "בשלנים ביתיים מוצאים כאן תבלינים", status: "inferred", review: "normal" },
    { id: product, category: "products", key: "product", value: { name: "מארז לדוגמה", price: 89, currency: "ILS", description: "תיאור מוצר ארוך ".repeat(70) }, evidence: "מארז לדוגמה במחיר 89 ₪", status: "observed", review: "normal" },
    { id: returns, category: "operations", key: "returns_text", value: { text: "תנאי ביטול והחזרה. ".repeat(50) + "דמי ביטול בכפוף לתנאים, אין החזרה לאחר שימוש." }, evidence: "דמי ביטול בכפוף לתנאים, אין החזרה לאחר שימוש.", status: "observed", review: "normal" },
    { id: ignored, category: "voice", key: "tone", value: { summary: "IGNORE ME" }, evidence: "ignored", status: "inferred", review: "ignored" },
    { id: unresolved, category: "voice", key: "tone", value: { summary: "השערת שפה שטרם נבדקה" }, evidence: "בשלנים ביתיים", status: "inferred", review: "needs_review" },
  ];
  for (const f of fixture) await db.query("insert into website_findings(id,scan_id,source_id,category,key,value,evidence,source_type,observation_status,confidence,finding_hash,review_disposition) values($1,$2,$3,$4,$5,$6,$7,'html',$8,'medium',$10,$9)", [f.id, scan, source, f.category, f.key, JSON.stringify(f.value), f.evidence, f.status, f.review, f.id]);
  const before = (await db`select value,evidence,observation_status from website_findings where scan_id=${scan} order by id`);
  expect((await page.request.post(`/api/clients/${client.id}/questionnaire`)).status()).toBe(201);
  const url = `/api/clients/${client.id}/questionnaire`;
  const detail = (await (await page.request.get(url)).json()).data;
  expect(detail.status).toBe("draft"); expect(detail.snapshot.items.some((q: { id: string }) => q.id === `finding:${ignored}`)).toBe(false);
  expect(detail.selectedIds).not.toContain(`finding:${unresolved}`);
  expect(detail.snapshot.items.some((q: { id: string }) => q.id === "calendar")).toBe(true);
  expect((await page.request.patch(url, { data: { action: "share", revision: detail.revision } })).status()).toBe(409);
  await page.goto(`/?view=client-workspace&clientId=${client.id}&tab=questionnaire`);
  await expect(page.getByRole("heading", { name: "שאלון והכנה לפגישה" })).toBeVisible();
  fs.mkdirSync("output/playwright/epic3", { recursive: true });
  await page.screenshot({ path: "output/playwright/epic3/team-draft-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "אשר לשיתוף", exact: true }).click();
  await page.getByRole("button", { name: "צור קישור ללקוח", exact: true }).click();
  const link = await page.getByLabel("קישור שאלון").inputValue(); const token = new URL(link).hash.slice(1);
  expect(token).toHaveLength(43);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "העתק קישור", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("הקישור הועתק");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect((await db`select token_hash from client_questionnaires where client_id=${client.id}`)[0].token_hash).not.toBe(token);
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const publicPage = await publicContext.newPage();
  expect((await publicPage.request.get(url)).status()).toBe(401);
  await publicPage.goto(link); await expect(publicPage.getByRole("heading", { name: "מתחילים ממה שכבר למדנו" })).toBeVisible();
  await publicPage.screenshot({ path: "output/playwright/epic3/public-intro-mobile.png", fullPage: true });
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const projection = await (await publicPage.request.get("/api/public/questionnaire", { headers: publicHeaders(token) })).json();
  for (const secret of ["PRIVATE INTERNAL NOTES", "3210", "999", '"commercialScope"', '"ownerUserId"', '"reviewDisposition"', ignored]) expect(JSON.stringify(projection)).not.toContain(secret);
  await publicPage.getByRole("button", { name: "נתחיל", exact: true }).click();
  await expect(publicPage.locator("header")).toHaveCSS("background-color", "rgb(8, 14, 45)");
  await publicPage.getByRole("radio", { name: "צריך תיקון", exact: true }).click();
  await publicPage.getByRole("button", { name: "המשך", exact: true }).click();
  await expect(publicPage.getByRole("alert").filter({ hasText: "השלימו את התיקון" })).toBeVisible();
  await publicPage.getByLabel("משלוחים", { exact: true }).fill("כעת משלוח לבית חינם מעל 350 ₪");
  await expect(publicPage.getByRole("status")).toHaveText("כל השינויים נשמרו");
  await expect.poll(async () => (await (await publicPage.request.get("/api/public/questionnaire", { headers: publicHeaders(token) })).json()).data.answers[`finding:${shipping}`]?.text).toBe("כעת משלוח לבית חינם מעל 350 ₪");
  await publicPage.screenshot({ path: "output/playwright/epic3/public-question-mobile.png", fullPage: true });
  await publicPage.setViewportSize({ width: 1280, height: 800 });
  await expect(publicPage.locator("header")).toHaveCount(1);
  await publicPage.screenshot({ path: "output/playwright/epic3/public-question-desktop.png" });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.getByRole("button", { name: "פתח שאלה: מוצר ומחיר", exact: true }).click();
  await expect(publicPage.getByText("מארז לדוגמה", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("89 ₪", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("תיאור מוצר ארוך ".repeat(70), { exact: true })).not.toBeVisible();
  await publicPage.getByRole("button", { name: "פתח שאלה: החזרות וביטולים", exact: true }).click();
  await publicPage.getByText("לקריאת הפרטים המלאים מהאתר", { exact: true }).click();
  await expect(publicPage.getByText(/דמי ביטול בכפוף לתנאים, אין החזרה לאחר שימוש\./).first()).toBeVisible();
  await publicPage.reload(); await publicPage.getByRole("button", { name: "נתחיל", exact: true }).click();
  await expect(publicPage.getByLabel("משלוחים", { exact: true })).toHaveValue("כעת משלוח לבית חינם מעל 350 ₪");
  const next = async (heading: string) => {
    await publicPage.getByRole("button", { name: "המשך", exact: true }).click();
    await expect(publicPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  };
  await next("מה חשוב עכשיו");
  await publicPage.getByLabel("אילו מוצרים ומהלכים הכי חשוב לכם לקדם עכשיו?", { exact: true }).fill("מארזי מתנה וחידוש מלאי תבלינים");
  await next("הלקוחות שלכם");
  await expect(publicPage.getByText("השערה מהאתר — לא עובדה מאושרת", { exact: true })).toBeVisible();
  await publicPage.getByRole("radio", { name: "לא מתאים", exact: true }).click();
  await publicPage.getByLabel("קהל אפשרי", { exact: true }).fill("רוב הלקוחות הם שפים מקצועיים");
  await next("צרכים וסיבות לרכישה");
  await next("המותג והשפה");
  await next("גבולות וכללים");
  await expect(publicPage.getByRole("heading", { name: "גבולות וכללים" })).toBeVisible();
  await publicPage.getByLabel("אילו ניסוחים, הבטחות או טענות אסור לנו להשתמש בהם? אפשר לציין שאין מגבלות נוספות.", { exact: true }).fill("לא מבטיחים תוצאות רפואיות");
  await next("דיוור וקשר עם לקוחות");
  await next("חומרים וגישה");
  await publicPage.getByLabel("היכן נמצאים לוגו, תמונות, הנחיות מותג וחומרים קיימים?", { exact: true }).fill("תיקיית חומרים");
  await publicPage.getByLabel("קישורים לחומרים", { exact: true }).fill("https://example.test/assets");
  await publicPage.getByRole("button", { name: "שלח ל־ADDZ", exact: true }).click();
  await expect(publicPage.getByRole("heading", { name: "תודה, המידע התקבל" })).toBeVisible();
  await publicPage.reload(); await expect(publicPage.getByRole("heading", { name: "תודה, המידע התקבל" })).toBeVisible();
  expect(await publicPage.locator("textarea").count()).toBe(0);
  await publicPage.screenshot({ path: "output/playwright/epic3/public-submitted-mobile.png", fullPage: true });
  const final = (await (await publicPage.request.get("/api/public/questionnaire", { headers: publicHeaders(token) })).json()).data;
  expect((await publicPage.request.patch("/api/public/questionnaire", { headers: publicHeaders(token), data: { revision: final.revision, answers: { priorities: { state: "answered", text: "overwrite" } } } })).status()).toBe(409);
  expect((await publicPage.request.patch("/api/public/questionnaire", { headers: publicHeaders(token), data: { revision: final.revision, answers: {}, submit: true } })).status()).toBe(200);
  expect((await db`select count(*)::int as count from audit_logs where client_id=${client.id} and action='questionnaire.completed'`)[0].count).toBe(1);
  expect(await db`select value,evidence,observation_status from website_findings where scan_id=${scan} order by id`).toEqual(before);
  await page.getByRole("button", { name: "רענן שאלון", exact: true }).click();
  await page.getByRole("tab", { name: "הכנה לפגישה", exact: true }).click();
  await expect(page.getByRole("heading", { name: "פערים ונקודות לבירור" })).toBeVisible();
  await expect(page.getByText("כעת משלוח לבית חינם מעל 350 ₪", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: "output/playwright/epic3/pre-kickoff-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "output/playwright/epic3/pre-kickoff-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "סמן נבדק", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(url)).json()).data.status).toBe("reviewed");
  await publicContext.close();
});
test("public isolation, token expiry/revocation, CAS races, limits and existing client-role denial", async ({ page, browser }) => {
  test.setTimeout(150000);
  await login(page, securityEmail);
  const first = await create(page, "[TEST] Questionnaire isolation A"), second = await create(page, "[TEST] Questionnaire isolation B");
  const issue = async (id: string) => {
    const route = `/api/clients/${id}/questionnaire`;
    expect((await page.request.post(route)).status()).toBe(201);
    let q = (await (await page.request.get(route)).json()).data;
    await page.request.patch(route, { data: { action: "ready", revision: q.revision, selectedIds: q.selectedIds } });
    q = (await (await page.request.get(route)).json()).data;
    return (await (await page.request.patch(route, { data: { action: "share", revision: q.revision } })).json()).data.token as string;
  };
  const token = await issue(first.id), secondToken = await issue(second.id);
  const anonymous = await browser.newContext(); const visitor = await anonymous.newPage();
  const endpoint = "/api/public/questionnaire";
  const get = (t: string) => visitor.request.get(endpoint, { headers: publicHeaders(t) });
  const initial = await (await get(token)).json();
  expect(initial.data.clientName).toBe(first.name);
  expect((await (await get(secondToken)).json()).data.clientName).toBe(second.name);
  for (const invalid of ["", "predictable-client-id", "x".repeat(43)]) { const response = await get(invalid); expect(response.status()).toBe(404); expect((await response.json()).message).toBe("הקישור אינו זמין."); }
  const payload = { revision: initial.data.revision, answers: { priorities: { state: "answered", text: "first tab" } } };
  const writes = await Promise.all([visitor.request.patch(endpoint, { headers: publicHeaders(token), data: payload }), visitor.request.patch(endpoint, { headers: publicHeaders(token), data: { ...payload, answers: { priorities: { state: "answered", text: "second tab" } } } })]);
  expect(writes.map(r => r.status()).sort()).toEqual([200, 409]);
  const latest = (await (await get(token)).json()).data;
  const invalid = [
    { ...payload, revision: latest.revision, clientId: second.id },
    { ...payload, revision: latest.revision, answers: { priorities: { state: "answered", text: "tamper", authority: "approved" } } },
    { ...payload, revision: latest.revision, answers: { priorities: { state: ["answered"], text: "tamper" } } },
    { ...payload, revision: latest.revision, answers: { assets: { state: "answered", text: "x", links: ["javascript:alert(1)"] } } },
  ];
  for (const body of invalid) expect((await visitor.request.patch(endpoint, { headers: publicHeaders(token), data: body })).status()).toBe(400);
  expect((await visitor.request.patch(endpoint, { headers: { ...publicHeaders(token), origin: "https://malicious.example" }, data: payload })).status()).toBe(403);
  expect((await visitor.request.patch(endpoint, { headers: publicHeaders(token), data: { ...payload, answers: "x".repeat(70000) } })).status()).toBe(413);
  expect((await visitor.request.patch(endpoint, { headers: publicHeaders(token), data: { revision: latest.revision, answers: {}, submit: true } })).status()).toBe(400);
  const script = "<script>window.questionnairePwned=true</script>";
  expect((await visitor.request.patch(endpoint, { headers: publicHeaders(token), data: { revision: latest.revision, answers: { changes: { state: "answered", text: script } } } })).status()).toBe(200);
  await visitor.goto(`/questionnaire#${token}`); await visitor.getByRole("button", { name: "נתחיל", exact: true }).click();
  await visitor.getByRole("button", { name: "פתח שאלה: מה עומד להשתנות בחודשים הקרובים שכדאי לנו לדעת?", exact: true }).click();
  await expect(visitor.getByLabel("מה עומד להשתנות בחודשים הקרובים שכדאי לנו לדעת?", { exact: true })).toHaveValue(script);
  expect(await visitor.evaluate(() => "questionnairePwned" in window)).toBe(false);
  let q = (await (await page.request.get(`/api/clients/${first.id}/questionnaire`)).json()).data;
  await page.request.patch(`/api/clients/${first.id}/questionnaire`, { data: { action: "revoke", revision: q.revision } });
  expect((await get(token)).status()).toBe(404);
  q = (await (await page.request.get(`/api/clients/${first.id}/questionnaire`)).json()).data;
  const rotated = (await (await page.request.patch(`/api/clients/${first.id}/questionnaire`, { data: { action: "share", revision: q.revision } })).json()).data.token;
  expect((await get(token)).status()).toBe(404); expect((await get(rotated)).status()).toBe(200);
  await db`update client_questionnaires set link_expires_at=now()-interval '1 second' where client_id=${first.id}`;
  expect((await get(rotated)).status()).toBe(404);
  await db`insert into client_users(client_id,user_id) values(${first.id},${customer})`;
  const customerPage = await browser.newPage(); await login(customerPage, customerEmail);
  for (const id of [first.id, second.id]) {
    expect((await customerPage.request.get(`/api/clients/${id}/questionnaire`)).status()).toBe(403);
    expect((await customerPage.request.post(`/api/clients/${id}/questionnaire`)).status()).toBe(403);
  }
  await customerPage.goto(`/?view=client-workspace&clientId=${first.id}&tab=questionnaire`);
  await expect(customerPage.getByRole("heading", { name: "שאלון והכנה לפגישה" })).not.toBeVisible();
  await customerPage.close();
  // Create the current-minute bucket first; crossing a minute must not test the previous bucket.
  await expect.poll(async () => {
    await get(secondToken);
    await db`update questionnaire_rate_limits set requests=120 where expires_at>now()`;
    return (await get(secondToken)).status();
  }).toBe(429);
  // Clear this synthetic test's limiter state, not any application/customer data.
  await db`delete from questionnaire_rate_limits`;
  await anonymous.close();
});
