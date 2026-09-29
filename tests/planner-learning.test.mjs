import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignObjectiveLabel,
  matchedReportsForPlan,
  summarizePlannerReports,
} from "../src/lib/planner-learning.ts";

const plan = {
  id: "plan-1",
  clientId: "client-1",
  accountId: "account-1",
  date: "2026-09-10",
  channel: "mixed",
  kind: "campaign",
  status: "planned",
  title: "Launch",
  owner: "",
  notes: "",
  objective: "launch",
  campaignMatches: [
    { channel: "email", campaignId: 11, matchingDisabled: false },
    { channel: "sms", campaignId: 22, matchingDisabled: false },
  ],
};

const email = {
  id: "email-1",
  accountId: "account-1",
  campaignId: 11,
  campaignName: "Launch email",
  subjectLine: "New collection",
  sentAt: "2026-09-10T08:00:00Z",
  totalRecipients: 1000,
  totalDelivered: 980,
  totalOpens: 490,
  uniqueClicks: 98,
  totalClicks: 120,
  purchases: 20,
  revenueGenerated: 8000,
  totalBounces: 20,
  unsubscribed: 4,
  spam: 0,
};

const sms = {
  id: "sms-1",
  accountId: "account-1",
  campaignId: 22,
  campaignName: "Launch SMS",
  messageText: "New collection",
  sentAt: "2026-09-10T08:10:00Z",
  totalRecipients: 500,
  totalDelivered: 490,
  uniqueClicks: 49,
  totalClicks: 60,
  purchases: 10,
  revenueGenerated: 3500,
  unsubscribed: 1,
};

test("a mixed planner item resolves both matched Flashy reports", () => {
  const reports = matchedReportsForPlan(plan, [email], [sms]);
  assert.deepEqual(reports.map((item) => item.channel), ["email", "sms"]);
});

test("planner results use weighted totals and rates", () => {
  const results = summarizePlannerReports(matchedReportsForPlan(plan, [email], [sms]));
  assert.equal(results.reportCount, 2);
  assert.equal(results.revenue, 11500);
  assert.equal(results.purchases, 30);
  assert.equal(results.conversionRate, 30 / 1500);
  assert.equal(results.openRate, 490 / 980);
  assert.equal(results.clickRate, 147 / 1470);
  assert.equal(results.unsubscribeRate, 5 / 1500);
});

test("campaign objectives have stable user-facing labels", () => {
  assert.equal(campaignObjectiveLabel("launch"), "השקה");
  assert.equal(campaignObjectiveLabel(), "לא הוגדרה מטרה");
});
