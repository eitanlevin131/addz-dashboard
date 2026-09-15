import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetricSnapshot,
  compareMetricSnapshots,
} from "../src/lib/metric-snapshot-core.ts";

const costs = {
  usdIlsRate: 3.7,
  smsCreditPriceUsd: 0.01,
  monthlySubscriptionCostUsd: 100,
  agencyRetainerCostIls: 1_000,
};

const email = (overrides = {}) => ({
  id: "email-1",
  accountId: "account-1",
  campaignId: 1,
  campaignName: "Email",
  subjectLine: "Subject",
  sentAt: "2026-09-10T08:00:00.000Z",
  totalRecipients: 100,
  totalDelivered: 95,
  totalOpens: 20,
  uniqueClicks: 2,
  totalClicks: 3,
  purchases: 2,
  revenueGenerated: 200,
  totalBounces: 0,
  unsubscribed: 0,
  spam: 0,
  ...overrides,
});

const sms = (overrides = {}) => ({
  id: "sms-1",
  accountId: "account-1",
  campaignId: 2,
  campaignName: "SMS",
  sentAt: "2026-09-10T10:00:00.000Z",
  totalRecipients: 1_000,
  totalDelivered: 980,
  uniqueClicks: 10,
  totalClicks: 12,
  purchases: 3,
  revenueGenerated: 300,
  unsubscribed: 1,
  ...overrides,
});

const automation = (overrides = {}) => ({
  id: "automation-1",
  accountId: "account-1",
  automationId: 3,
  automationName: "Welcome",
  channel: "sms",
  date: "2026-09-11",
  totalRecipients: 500,
  totalDelivered: 490,
  totalOpens: 0,
  totalClicks: 8,
  sentSms: 500,
  purchases: 4,
  revenueGenerated: 400,
  ...overrides,
});

function snapshot(overrides = {}) {
  return buildMetricSnapshot({
    timezone: "UTC",
    capturedAt: new Date("2026-09-15T08:00:00.000Z"),
    coverageStart: "2026-09-01",
    coverageEnd: "2026-09-15",
    costs,
    emails: [email()],
    sms: [sms()],
    automations: [automation()],
    ...overrides,
  });
}

test("metric snapshots preserve channel totals, purchases and configured costs", () => {
  const value = snapshot();

  assert.equal(value.totalRevenue, 900);
  assert.equal(value.totalPurchases, 9);
  assert.equal(value.smsMessages, 1_500);
  assert.equal(value.smsCostUsd, 15);
  assert.equal(value.smsCostIls, 55.5);
  assert.equal(value.totalCostIls, 1_425.5);
  assert.deepEqual(value.dailyMetrics.map((day) => day.date), ["2026-09-10", "2026-09-11"]);
  assert.equal(value.dailyMetrics[0].totalRevenue, 500);
  assert.equal(value.dailyMetrics[1].smsCostIls, 18.5);
});

test("snapshot comparison identifies retrospective Flashy changes on overlapping days", () => {
  const previous = snapshot({
    capturedAt: new Date("2026-09-14T08:00:00.000Z"),
    coverageEnd: "2026-09-14",
  });
  const current = snapshot({
    emails: [email({ revenueGenerated: 250, purchases: 3 })],
    sms: [sms(), sms({
      id: "sms-today",
      campaignId: 4,
      sentAt: "2026-09-15T07:00:00.000Z",
      revenueGenerated: 800,
      purchases: 8,
    })],
  });
  const revision = compareMetricSnapshots(current, { ...previous, id: "previous" });

  assert.equal(revision.previousSnapshotId, "previous");
  assert.equal(revision.changedDays, 1);
  assert.equal(revision.historicalChangedDays, 1);
  assert.equal(revision.historicalRevenueDelta, 50);
  assert.equal(revision.historicalPurchasesDelta, 1);
  assert.equal(revision.largestChanges[0].date, "2026-09-10");
});

test("snapshot comparison separates pricing changes from Flashy metric changes", () => {
  const previous = snapshot();
  const current = snapshot({ costs: { ...costs, smsCreditPriceUsd: 0.02 } });
  const revision = compareMetricSnapshots(current, { ...previous, id: "previous" });

  assert.equal(revision.costConfigurationChanged, true);
  assert.equal(revision.historicalRevenueDelta, 0);
  assert.equal(revision.historicalSmsCostIlsDelta, 55.5);
});
