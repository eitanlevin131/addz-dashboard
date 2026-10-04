import assert from "node:assert/strict";
import test from "node:test";
import { notificationClaimable, notificationRecipient, websiteScanEmail, websiteScanLink, websiteScanEmailEnabled } from "../src/lib/website-intelligence/notification-core.ts";

test("only the active requesting team user qualifies, never a client or suspended user", () => {
  for (const role of ["owner", "admin", "agency"]) assert.equal(notificationRecipient({ role, status: "active", email: "team@example.test" }), "team@example.test");
  for (const role of ["client", "unknown"]) assert.equal(notificationRecipient({ role, status: "active", email: "client@example.test" }), null);
  assert.equal(notificationRecipient({ role: "admin", status: "suspended", email: "team@example.test" }), null);
  assert.equal(notificationRecipient(undefined), null);
  assert.equal(notificationRecipient({ role: "admin", status: "active", email: "invalid" }), null);
});
test("Preview is hard-disabled even with a live key; real mail requires explicit opt-in", () => {
  const env = { WEBSITE_SCAN_EMAIL_ENABLED: "true", RESEND_API_KEY: "synthetic", EMAIL_FROM: "test@example.test" };
  assert.equal(websiteScanEmailEnabled({ ...env, VERCEL_ENV: "preview" }), false);
  assert.equal(websiteScanEmailEnabled({ ...env, VERCEL_ENV: "production" }), true);
  assert.equal(websiteScanEmailEnabled({ ...env, WEBSITE_SCAN_EMAIL_ENABLED: undefined }), false);
  assert.equal(websiteScanEmailEnabled({ ...env, RESEND_API_KEY: "" }), false);
});
test("persisted notification lease, retry deadline and 23-hour idempotency budget", () => {
  const now = Date.now(), completed = new Date(now - 1000);
  assert.equal(notificationClaimable({ status: "pending", attempts: 0 }, completed, now), true);
  assert.equal(notificationClaimable({ status: "sending", attempts: 1, leaseUntil: now + 1000 }, completed, now), false);
  assert.equal(notificationClaimable({ status: "sending", attempts: 1, leaseUntil: now - 1 }, completed, now), true);
  assert.equal(notificationClaimable({ status: "failed", attempts: 1, retryAt: now + 1000 }, completed, now), false);
  for (const status of ["sent", "disabled", "skipped"]) assert.equal(notificationClaimable({ status, attempts: 1 }, completed, now), false);
  assert.equal(notificationClaimable({ status: "failed", attempts: 3 }, completed, now), false);
  assert.equal(notificationClaimable({ status: "failed", attempts: 1 }, new Date(now - 24 * 3600000), now), false);
  assert.equal(notificationClaimable(undefined, completed, now), false);
});
test("notification deep link targets the internal workspace and the original scan", () => {
  const link = new URL(websiteScanLink("https://preview.example.test/old?secret=discard#old", "client-id", "scan-id"));
  assert.equal(link.pathname, "/"); assert.equal(link.searchParams.get("tab"), "website");
  assert.equal(link.searchParams.get("scanId"), "scan-id"); assert.equal(link.searchParams.has("secret"), false);
  for (const origin of ["javascript:alert(1)", "http://example.test", "https://user:password@example.test"]) assert.throws(() => websiteScanLink(origin, "client", "scan"));
});
test("only terminal outcomes create mail, HTML is escaped and failures contain a safe summary", () => {
  for (const status of ["completed", "completed_with_warnings", "failed"]) {
    const email = websiteScanEmail('<script>bad</script>\r\nClient', status, "https://app.example.test/?tab=website&scanId=1");
    assert.ok(email.text.includes("https://app.example.test/")); assert.ok(!email.html.includes("<script>"));
    assert.ok(!email.subject.includes("\n")); assert.ok(!email.html.includes("DATABASE_URL"));
  }
  for (const status of ["pending", "running", "processing", "cancelled"]) assert.throws(() => websiteScanEmail("Client", status, "https://app.example.test"));
});
