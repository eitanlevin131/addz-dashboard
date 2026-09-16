import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiEvidenceCatalog,
  normalizeAiGroundedResponse,
} from "../src/lib/ai-grounding.ts";

const account = {
  id: "account-1",
  clientId: "client-1",
  flashyAccountId: 11868,
  name: "Test account",
  website: "",
  currency: "ILS",
  timezone: "Asia/Jerusalem",
  credits: 0,
  usdIlsRate: 3.7,
  smsCreditPriceUsd: 0.01,
  monthlySubscriptionCostUsd: 0,
  agencyRetainerCostIls: 0,
  active: true,
  lastSyncAt: "2026-09-14T00:00:00Z",
};

const summary = {
  revenue: 3000,
  smsCost: 74,
  smsCostUsd: 20,
  fixedCosts: 0,
  subscriptionCostIls: 0,
  profit: 2926,
  roas: 40.54,
  recipients: 3000,
  delivered: 2950,
  opens: 800,
  clicks: 120,
  purchases: 7,
  conversionRate: 0.0023,
  revenuePerMessage: 1,
};

const email = {
  id: "email-1",
  accountId: account.id,
  campaignId: 11,
  campaignName: "Email winner",
  subjectLine: "Subject",
  sentAt: "2026-09-10T08:00:00Z",
  totalRecipients: 1000,
  totalDelivered: 980,
  totalOpens: 500,
  uniqueClicks: 80,
  totalClicks: 100,
  purchases: 5,
  revenueGenerated: 2500,
  totalBounces: 20,
  unsubscribed: 0,
  spam: 0,
};

const sms = {
  id: "sms-1",
  accountId: account.id,
  campaignId: 22,
  campaignName: "SMS weak",
  messageText: "הזדמנות אחרונה להצעה שביקשת לבדוק",
  sentAt: "2026-09-11T08:00:00Z",
  totalRecipients: 2000,
  totalDelivered: 1970,
  uniqueClicks: 20,
  totalClicks: 25,
  purchases: 2,
  revenueGenerated: 500,
  unsubscribed: 0,
};

test("evidence catalog keeps measured SMS values and a direct report target", () => {
  const catalog = buildAiEvidenceCatalog({
    account,
    summary,
    emails: [email],
    sms: [sms],
    automations: [],
    plans: [],
    question: "איזו שליחת SMS חלשה?",
    currentView: "sms",
  });
  const source = catalog.find((item) => item.id === "sms:sms-1");

  assert.ok(source);
  assert.equal(source.reportView, "sms");
  assert.equal(source.metrics.find((item) => item.key === "revenue")?.value, 500);
  assert.equal(source.metrics.find((item) => item.key === "smsCost")?.value, 74);
  assert.equal(source.content, "הזדמנות אחרונה להצעה שביקשת לבדוק");
});

test("grounded AI output cannot cite a source that is not in the catalog", () => {
  const catalog = buildAiEvidenceCatalog({
    account,
    summary,
    emails: [email],
    sms: [sms],
    automations: [],
    plans: [],
    question: "איזה קמפיין מוביל?",
    currentView: "campaigns",
  });
  const result = normalizeAiGroundedResponse({
    answer: "המייל מוביל.",
    facts: [
      { text: "נתון אמיתי", evidenceIds: ["email:email-1"] },
      { text: "נתון מומצא", evidenceIds: ["email:not-real"] },
    ],
    calculations: [],
    inferences: [{ text: "אפשר לבדוק וריאציה", confidence: "high", evidenceIds: ["email:email-1"] }],
  }, catalog, "fallback");

  assert.deepEqual(result.sources.map((item) => item.id), ["email:email-1"]);
  assert.equal(result.facts.length, 1);
  assert.equal(result.inferences[0].confidence, "high");
});

test("an ungrounded model response is replaced with deterministic evidence", () => {
  const catalog = buildAiEvidenceCatalog({
    account,
    summary,
    emails: [email],
    sms: [],
    automations: [],
    plans: [],
    question: "מה עובד?",
    currentView: "overview",
  });
  const result = normalizeAiGroundedResponse({
    answer: "טענה ללא מקור",
    facts: [{ text: "אין הוכחה", evidenceIds: ["made-up"] }],
  }, catalog, "תשובת fallback");

  assert.equal(result.answer, "תשובת fallback");
  assert.ok(result.facts.length > 0);
  assert.ok(result.sources.every((source) => catalog.some((candidate) => candidate.id === source.id)));
});
