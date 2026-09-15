import test from "node:test";
import assert from "node:assert/strict";
import { matchNewsletterPlans, plannerTitleSimilarity } from "../src/lib/planner-match.ts";

const plan = (overrides = {}) => ({
  id: "plan-1",
  clientId: "client-1",
  accountId: "account-1",
  date: "2026-09-13",
  channel: "email",
  kind: "campaign",
  status: "planned",
  title: "מבצע ראש השנה מדרגות",
  owner: "",
  notes: "",
  ...overrides,
});

const email = (overrides = {}) => ({
  id: "report-1",
  accountId: "account-1",
  campaignId: 77881,
  campaignName: "מכירתי - מבצע ראש השנה מדרגות | ADDZ",
  subjectLine: "",
  sentAt: "2026-09-13T06:00:00.000Z",
  totalRecipients: 1000,
  totalDelivered: 980,
  totalOpens: 400,
  uniqueClicks: 80,
  totalClicks: 100,
  purchases: 12,
  revenueGenerated: 5500,
  totalBounces: 20,
  unsubscribed: 2,
  spam: 0,
  ...overrides,
});

test("matches a planned campaign by channel, nearby date and meaningful title", () => {
  const result = matchNewsletterPlans([plan()], [email()], [], "Asia/Jerusalem", new Date("2026-09-14T08:00:00Z"));
  assert.equal(result.matches[0].status, "sent");
  assert.equal(result.matches[0].report?.campaignId, 77881);
  assert.equal(result.unmatchedReports.length, 0);
});

test("does not match a generic title or a different account", () => {
  const result = matchNewsletterPlans(
    [plan({ title: "דיוור חדש" })],
    [email({ accountId: "account-2" })],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );
  assert.equal(result.matches[0].status, "not_found");
  assert.equal(result.matches[0].report, undefined);
});

test("an explicit Flashy campaign URL wins even when the title changed", () => {
  const result = matchNewsletterPlans(
    [plan({ flashyUrl: "https://my.flashy.app/campaigns/77881", title: "שם פנימי אחר" })],
    [email({ campaignName: "שם חיצוני" })],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );
  assert.equal(result.matches[0].status, "sent");
  assert.equal(result.matches[0].confidence, 1);
});

test("future and postponed plans keep distinct operational states", () => {
  const result = matchNewsletterPlans(
    [plan({ date: "2026-09-20" }), plan({ id: "plan-2", date: "2026-09-12", status: "postponed" })],
    [],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );
  assert.deepEqual(result.matches.map((item) => item.status), ["planned", "postponed"]);
});

test("title similarity ignores channel and agency wrapper words", () => {
  assert.ok(plannerTitleSimilarity("SMS מבצע חגים", "מבצע חגים | ADDZ") > 0.8);
});

test("a persisted campaign match wins even when title and date no longer qualify", () => {
  const result = matchNewsletterPlans(
    [plan({
      date: "2026-08-01",
      title: "שם פנימי",
      matchedCampaignId: 77881,
      matchedCampaignChannel: "email",
      matchMethod: "manual",
      matchConfidence: 1,
      matchConfirmedAt: "2026-09-14T08:00:00.000Z",
    })],
    [email({ campaignName: "שם חיצוני", sentAt: "2026-09-13T06:00:00.000Z" })],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );

  assert.equal(result.matches[0].report?.campaignId, 77881);
  assert.equal(result.matches[0].matchState, "confirmed");
  assert.equal(result.unmatchedReports.length, 0);
  assert.equal(result.availableReports.length, 0);
});

test("automatic matches remain reviewable until confirmed", () => {
  const result = matchNewsletterPlans(
    [plan({
      matchedCampaignId: 77881,
      matchedCampaignChannel: "email",
      matchMethod: "auto",
      matchConfidence: 0.91,
    })],
    [email()],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );

  assert.equal(result.matches[0].matchState, "automatic");
  assert.equal(result.matches[0].confidence, 0.91);
});

test("dismissed plans do not reconnect automatically", () => {
  const result = matchNewsletterPlans(
    [plan({ matchingDisabled: true })],
    [email()],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );

  assert.equal(result.matches[0].matchState, "none");
  assert.equal(result.matches[0].report, undefined);
  assert.equal(result.unmatchedReports.length, 1);
  assert.equal(result.availableReports.length, 1);
});

test("a stored campaign that is absent from the current reports is marked missing", () => {
  const result = matchNewsletterPlans(
    [plan({ matchedCampaignId: 77881, matchedCampaignChannel: "email", matchMethod: "auto" })],
    [],
    [],
    "Asia/Jerusalem",
    new Date("2026-09-14T08:00:00Z"),
  );

  assert.equal(result.matches[0].matchState, "missing");
  assert.equal(result.matches[0].status, "not_found");
});
