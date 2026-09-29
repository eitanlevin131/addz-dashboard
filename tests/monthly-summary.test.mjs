import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlySummary,
  buildMonthlyWhatsappText,
  monthlyPeriod,
  preservesMonthlyCopyNumbers,
  withMonthlySummaryShareLink,
  withoutMonthlySummaryShareLink,
} from "../src/lib/monthly-summary.ts";

const account = {
  id: "account-1",
  clientId: "client-1",
  flashyAccountId: 10,
  name: "Test account",
  website: "https://example.com",
  currency: "ILS",
  timezone: "Asia/Jerusalem",
  credits: 0,
  usdIlsRate: 3.7,
  smsCreditPriceUsd: 0.01,
  monthlySubscriptionCostUsd: 0,
  agencyRetainerCostIls: 0,
  active: true,
  lastSyncAt: "2026-09-01T10:00:00.000Z",
  syncStatus: "healthy",
};

const email = (overrides = {}) => ({
  id: crypto.randomUUID(), accountId: account.id, campaignId: 1, campaignName: "Email winner",
  subjectLine: "Subject", sentAt: "2026-08-05T07:00:00.000Z", totalRecipients: 1000,
  totalDelivered: 950, totalOpens: 400, uniqueClicks: 100, totalClicks: 120,
  purchases: 10, revenueGenerated: 1000, totalBounces: 0, unsubscribed: 0, spam: 0,
  ...overrides,
});

const sms = (overrides = {}) => ({
  id: crypto.randomUUID(), accountId: account.id, campaignId: 2, campaignName: "SMS winner",
  messageText: "Sale", sentAt: "2026-08-10T17:00:00.000Z", totalRecipients: 500,
  totalDelivered: 480, uniqueClicks: 50, totalClicks: 60, purchases: 5,
  revenueGenerated: 500, unsubscribed: 0, ...overrides,
});

const automation = (overrides = {}) => ({
  id: crypto.randomUUID(), accountId: account.id, automationId: 3, automationName: "Welcome",
  channel: "email", date: "2026-08-12", totalRecipients: 100, totalDelivered: 98,
  totalOpens: 60, totalClicks: 30, purchases: 3, revenueGenerated: 300, ...overrides,
});

test("monthly period returns the exact calendar bounds", () => {
  assert.deepEqual(monthlyPeriod("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(monthlyPeriod("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("monthly summary separates channels, groups automations and compares prior month", () => {
  const snapshot = buildMonthlySummary({
    clientId: "client-1",
    account,
    month: "2026-08",
    manual: { siteRevenue: 3600, popupSignups: 200, popupConversionRate: 0.05, note: "" },
    emails: [email({ unsubscribed: 10 }), email({ campaignId: 10, sentAt: "2026-07-12T08:00:00.000Z", revenueGenerated: 400, purchases: 4, unsubscribed: 2 })],
    sms: [sms({ unsubscribed: 5 })],
    automations: [
      automation(),
      automation({ id: crypto.randomUUID(), date: "2026-08-13", revenueGenerated: 200, purchases: 2, totalClicks: 20 }),
      automation({ id: crypto.randomUUID(), automationId: 4, date: "2026-07-08", revenueGenerated: 100, purchases: 1 }),
    ],
    generatedAt: new Date("2026-09-01T12:00:00.000Z"),
  });

  assert.equal(snapshot.emailCampaigns.revenue, 1000);
  assert.equal(snapshot.smsCampaigns.revenue, 500);
  assert.equal(snapshot.automations.revenue, 500);
  assert.equal(snapshot.automations.reportCount, 1);
  assert.equal(snapshot.totals.attributedRevenue, 2000);
  assert.equal(snapshot.totals.campaignRevenue, 1500);
  assert.equal(snapshot.totals.attributedShare, 2000 / 3600);
  assert.equal(snapshot.leaders.automations[0].name, "Welcome");
  assert.equal(snapshot.leaders.automations[0].revenue, 500);
  assert.equal(snapshot.previousMonth?.attributedRevenue, 500);
  assert.equal(snapshot.previousMonth?.revenueChange, 3);
  assert.equal(snapshot.listHealth?.total.unsubscribed, 15);
  assert.equal(snapshot.listHealth?.total.unsubscribeRate, 15 / 1500);
  assert.equal(snapshot.listHealth?.previousMonthRate, 2 / 1000);
  assert.deepEqual(snapshot.completeness.missing, []);
  assert.equal(snapshot.completeness.ready, true);
});

test("WhatsApp copy uses only available facts and can include the protected link", () => {
  const snapshot = buildMonthlySummary({
    clientId: "client-1", account, month: "2026-08",
    manual: { siteRevenue: null, popupSignups: null, popupConversionRate: null, note: "" },
    emails: [email()], sms: [], automations: [], generatedAt: new Date("2026-09-01T12:00:00.000Z"),
  });
  const text = buildMonthlyWhatsappText(snapshot, "https://dashboard.example/summaries/123");
  assert.match(text, /Email winner/);
  assert.match(text, /https:\/\/dashboard\.example\/summaries\/123/);
  assert.doesNotMatch(text, /פופ אפ/);
  assert.ok(snapshot.completeness.missing.includes("מחזור אתר"));
  assert.equal(snapshot.completeness.ready, false);
});

test("share links are replaced per environment instead of freezing localhost", () => {
  const local = "Monthly copy\n\nלצפייה בסיכום המלא והאינטראקטיבי:\nhttp://localhost:3020/summaries/123";
  assert.equal(withoutMonthlySummaryShareLink(local), "Monthly copy");
  assert.equal(
    withMonthlySummaryShareLink(local, "https://app.example/summaries/123"),
    "Monthly copy\n\nלצפייה בסיכום המלא והאינטראקטיבי:\nhttps://app.example/summaries/123",
  );
});

test("AI copy validation rejects changed, added or omitted numbers", () => {
  const original = "הכנסה 47,507 ₪ | 20.2% | 40 מכירות";
  assert.equal(preservesMonthlyCopyNumbers(original, "בחודש נרשמו 40 מכירות, 20.2% ו־47,507 ₪"), true);
  assert.equal(preservesMonthlyCopyNumbers(original, "הכנסה 47,500 ₪ | 20.2% | 40 מכירות"), false);
  assert.equal(preservesMonthlyCopyNumbers(original, "הכנסה 47,507 ₪ | 40 מכירות"), false);
});
