import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
const target = new URL(process.env.E2E_DATABASE_URL!);
if (target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Epic 2 tests require their synthetic isolated DB");
const db = neon(target.toString());
const staff = "website-" + randomUUID();
const secondStaff = "website-resume-" + randomUUID();
const customer = "website-client-" + randomUUID();
const email = staff + "@example.test";
const customerEmail = customer + "@example.test";
const clientIds: string[] = [];
async function login(page: Page, address: string) {
  await page.goto("/"); await page.getByLabel("אימייל").fill(address);
  await page.getByRole("button", { name: "שלחו לי קוד כניסה", exact: true }).click();
  await expect(page.getByLabel("קוד כניסה")).toBeVisible();
  const response = await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3061}/test/resend-latest?to=${encodeURIComponent(address)}`).then(r => r.json());
  await page.getByLabel("קוד כניסה").fill(String(response.data.text).match(/\b\d{6}\b/)![0]);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/auth/session")).json()).user?.email).toBe(address);
}
async function settle(page: Page, clientId: string, scanId: string) {
  let result;
  for (let step = 0; step < 120; step++) {
    result = (await (await page.request.get(`/api/clients/${clientId}/website-scans/${scanId}`)).json()).data;
    if (["completed", "completed_with_warnings", "failed", "cancelled"].includes(result.scan.status)) return result;
    await page.request.post(`/api/clients/${clientId}/website-scans/${scanId}/advance`);
    await page.waitForTimeout(700);
  }
  throw Error("Scan did not complete: " + JSON.stringify(result?.scan.state));
}
test.beforeAll(async () => {
  await db`insert into users(id,email,role,status) values (${staff},${email},'admin','active'),(${customer},${customerEmail},'client','active'),(${secondStaff},${secondStaff + "@example.test"},'admin','active')`;
});
test.afterAll(async () => {
  for (const id of clientIds) {
    await db`update website_scans set status='cancelled',lease_token=null,lease_until=null where client_id=${id} and status in ('pending','running','processing')`;
    await db`delete from audit_logs where client_id=${id}`;
    await db`delete from clients where id=${id}`;
  }
  await db`delete from audit_logs where actor_user_id in (${staff},${customer},${secondStaff})`;
  await db`delete from users where id in (${staff},${customer},${secondStaff})`;
});
test("automatic onboarding, persisted resume, evidence, review, re-scan history, cancellation and staff-only RTL workspace", async ({ page, browser }) => {
  test.setTimeout(180000);
  await login(page, email);
  const created = await page.request.post("/api/clients", { data: { name: "[TEST] Website Intelligence", website: "https://website-fixture.example.com/", ownerUserId: staff } });
  expect(created.status()).toBe(201);
  const client = (await created.json()).data; clientIds.push(client.id);
  expect(client.initialWebsiteScanId).toBeTruthy();
  const scanId = client.initialWebsiteScanId;
  await expect.poll(async () => (await db`select state->>'stage' as stage from website_scans where id=${scanId}`)[0].stage).not.toBe("bootstrap");
  fs.mkdirSync("output/playwright/epic2", { recursive: true });
  await page.goto(`/?view=client-workspace&clientId=${client.id}`);
  await page.getByRole("tab", { name: "סריקת אתר", exact: true }).click();
  await expect(page.getByRole("button", { name: "המשך סריקה", exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/epic2/website-paused.png" });
  const resumed = await settle(page, client.id, scanId);
  expect(resumed.scan.status, JSON.stringify(resumed.scan.state.warnings)).toBe("completed"); expect(resumed.sources.length).toBe(4);
  expect(resumed.runs.some((run: { task: string; status: string }) => run.task.startsWith("research_review_") && run.status === "completed")).toBe(true);
  expect(resumed.runs.filter((run: { task: string }) => run.task.endsWith("_evidence_review")).length).toBe(4);
  expect(resumed.runs.every((run: { status: string }) => run.status === "completed")).toBe(true);
  await expect.poll(async () => (await db`select state->'notification'->>'status' as status from website_scans where id=${scanId}`)[0].status).toBe("sent");
  const received = await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3061}/test/resend-latest?to=${encodeURIComponent(email)}`).then(r => r.json());
  expect(received.data.to).toEqual([email]);
  expect(received.data.subject).toContain("סריקת אתר הושלמה");
  expect(received.data.text).toContain(`scanId=${scanId}`);
  for (let n = 0; n < 3; n++) await page.request.post(`/api/clients/${client.id}/website-scans/${scanId}/advance`);
  await page.waitForTimeout(700);
  expect((await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3061}/test/resend-latest?to=${encodeURIComponent(email)}`).then(r => r.json())).count).toBe(received.count);
  expect(resumed.findings.some((finding: { observationStatus: string }) => finding.observationStatus === "inferred")).toBe(true);
  expect(resumed.findings.every((finding: { sourceId: string; evidence: string }) => resumed.sources.some((source: { id: string }) => source.id === finding.sourceId) && finding.evidence.length > 0)).toBe(true);
  const finding = resumed.findings[0];
  for (const disposition of ["needs_review", "ignored", "normal"]) {
    expect((await page.request.patch(`/api/clients/${client.id}/website-findings/${finding.id}`, { data: { reviewDisposition: disposition } })).status()).toBe(200);
    const [stored] = await db`select value,evidence,observation_status,confidence,review_disposition from website_findings where id=${finding.id}`;
    expect(stored.value).toEqual(finding.value); expect(stored.evidence).toEqual(finding.evidence); expect(stored.confidence).toEqual(finding.confidence); expect(stored.review_disposition).toBe(disposition);
  }
  expect((await page.request.patch(`/api/clients/${client.id}/website-findings/${finding.id}`, { data: { reviewDisposition: "normal", value: "changed" } })).status()).toBe(400);
  await page.goto(`/?view=client-workspace&clientId=${client.id}&tab=website&scanId=${scanId}`);
  await expect(page.getByRole("heading", { name: "מודיעין אתר" })).toBeVisible();
  await expect(page.getByText("קהל שמחפש מתנות שוקולד", { exact: true }).first()).toBeVisible();
  await page.getByText("מקור והוכחה", { exact: true }).first().click();
  await expect(page.locator("blockquote").first()).toBeVisible();
  fs.mkdirSync("output/playwright/epic2", { recursive: true });
  await page.screenshot({ path: "output/playwright/epic2/website-desktop.png" });
  await page.screenshot({ path: "output/playwright/epic2/website-desktop-full.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('section[aria-label="סריקת אתר"]')).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "output/playwright/epic2/website-mobile.png" });
  await page.screenshot({ path: "output/playwright/epic2/website-mobile-full.png", fullPage: true });
  const rescanned = await page.request.post(`/api/clients/${client.id}/website-scans`);
  expect(rescanned.status()).toBe(201); const second = (await rescanned.json()).data;
  expect(second.previousScanId).toBe(scanId);
  expect((await page.request.post(`/api/clients/${client.id}/website-scans`)).status()).toBe(409);
  await page.request.post(`/api/clients/${client.id}/website-scans/${second.id}/cancel`);
  await page.waitForTimeout(1000);
  expect((await (await page.request.get(`/api/clients/${client.id}/website-scans/${second.id}`)).json()).data.scan.status).toBe("cancelled");
  expect((await (await page.request.get(`/api/clients/${client.id}/website-scans/${scanId}`)).json()).data.findings.length).toBe(resumed.findings.length);
  const lifecycle = await db`select action from audit_logs where client_id=${client.id}`;
  expect(lifecycle.some(row => row.action === "website_scan.completed")).toBe(true);
  await db`insert into client_users(client_id,user_id) values (${client.id},${customer})`;
  const customerPage = await browser.newPage();
  await login(customerPage, customerEmail);
  for (const endpoint of [`/api/clients/${client.id}/website-scans`, `/api/clients/${client.id}/website-scans/${scanId}`]) expect((await customerPage.request.get(endpoint)).status()).toBe(403);
  expect((await customerPage.request.post(`/api/clients/${client.id}/website-scans`)).status()).toBe(403);
  await customerPage.goto(`/?view=client-workspace&clientId=${client.id}`);
  await expect(customerPage.getByRole("heading", { name: "מודיעין אתר" })).not.toBeVisible();
  await customerPage.close();
});
test("persisted leases reject concurrent chunks and expired leases resume; sparse/challenge/partial/retry outcomes", async ({ page }) => {
  test.setTimeout(300000);
  await login(page, secondStaff + "@example.test");
  for (const scenario of ["retry", "sparse", "challenge", "partial"]) {
    const response = await page.request.post("/api/clients", { data: { name: "[TEST] Website " + scenario, website: "https://website-fixture.example.com/?scenario=" + scenario } });
    expect(response.status()).toBe(201); const client = (await response.json()).data; clientIds.push(client.id);
    const id = client.initialWebsiteScanId;
    await expect.poll(async () => (await db`select state->>'stage' as stage from website_scans where id=${id}`)[0].stage).not.toBe("bootstrap");
    if (scenario === "retry") {
      const lease = randomUUID();
      await db`update website_scans set lease_token=${lease},lease_until=now()+interval '60 seconds' where id=${id}`;
      const [before] = await db`select request_count,state from website_scans where id=${id}`;
      for (let n = 0; n < 5; n++) expect((await page.request.post(`/api/clients/${client.id}/website-scans/${id}/advance`)).status()).toBe(202);
      await page.waitForTimeout(700);
      const [after] = await db`select request_count,state,lease_token from website_scans where id=${id}`;
      expect(after.request_count).toBe(before.request_count); expect(after.state).toEqual(before.state); expect(after.lease_token).toBe(lease);
      await db`update website_scans set lease_until=now()-interval '1 second' where id=${id}`;
    }
    const result = await settle(page, client.id, id);
    await expect.poll(async () => (await db`select state->'notification'->>'status' as status from website_scans where id=${id}`)[0].status).toBe("sent");
    const terminalEmail = await fetch(`http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3061}/test/resend-latest?to=${encodeURIComponent(secondStaff + "@example.test")}`).then(r => r.json());
    expect(terminalEmail.data.text).toContain(`scanId=${id}`);
    expect(terminalEmail.data.to).toEqual([secondStaff + "@example.test"]);
    expect(result.sources.length).toBe(4);
    if (scenario === "sparse") { expect(result.scan.status).toBe("completed_with_warnings"); expect(result.runs.length).toBe(0); expect(result.scan.state.evidence.sufficient).toBe(false); }
    if (scenario === "challenge") { expect(result.scan.status).toBe("failed"); expect(result.runs.length).toBe(0); expect(result.findings.length).toBe(0); }
    if (scenario === "partial") { expect(result.scan.status).toBe("completed_with_warnings"); expect(result.sources.filter((source: { status: string }) => source.status === "completed").length).toBe(3); expect(result.findings.length).toBeGreaterThan(0); }
    if (scenario === "retry") { expect(result.scan.status, JSON.stringify(result.scan.state.warnings)).toBe("completed"); expect(result.sources.find((source: { pageType: string }) => source.pageType === "shipping").attempts).toBe(2); expect(result.runs.filter((run: { task: string }) => run.task.endsWith("_evidence_review")).length).toBe(4); }
    expect((await db`select count(*)::int as count from audit_logs where entity_id=${id} and action='website_scan.started'`)[0].count).toBe(1);
  }
});
