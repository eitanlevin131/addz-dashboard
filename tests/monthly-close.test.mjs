import assert from "node:assert/strict";
import test from "node:test";
import { assessMonthlyClose, normalizeMonthlyCloseStage } from "../src/lib/monthly-close.ts";

test("monthly close normalizes persisted summary states", () => {
  assert.equal(normalizeMonthlyCloseStage("draft"), "draft");
  assert.equal(normalizeMonthlyCloseStage("approved"), "approved");
  assert.equal(normalizeMonthlyCloseStage("sent"), "sent");
  assert.equal(normalizeMonthlyCloseStage(null), "not_started");
});

test("healthy sent accounts with complete inputs do not require attention", () => {
  const result = assessMonthlyClose({
    summaryStatus: "sent",
    syncStatus: "healthy",
    emailReports: 8,
    smsReports: 4,
    automationReports: 6,
    missingInputs: [],
    smsCreditPriceUsd: 0.01,
    monthlySubscriptionCostUsd: 100,
    agencyRetainerCostIls: 3000,
    hasMetricSnapshot: true,
  });
  assert.equal(result.needsAttention, false);
  assert.deepEqual(result.dataIssues, []);
  assert.deepEqual(result.costIssues, []);
});

test("monthly close reports data and cost gaps without inventing conclusions", () => {
  const result = assessMonthlyClose({
    summaryStatus: null,
    syncStatus: "stale",
    emailReports: 0,
    smsReports: 2,
    automationReports: 0,
    missingInputs: ["מחזור אתר"],
    smsCreditPriceUsd: 0,
    monthlySubscriptionCostUsd: 0,
    agencyRetainerCostIls: 0,
    hasMetricSnapshot: false,
  });
  assert.equal(result.stage, "not_started");
  assert.equal(result.needsAttention, true);
  assert.deepEqual(result.dataIssues, ["הסנכרון אינו עדכני", "אין snapshot יומי"]);
  assert.deepEqual(result.costIssues, ["מחיר SMS", "מנוי Flashy", "ריטיינר"]);
});

test("approved summaries are ready rather than marked as requiring attention", () => {
  const result = assessMonthlyClose({
    summaryStatus: "approved",
    syncStatus: "healthy",
    emailReports: 5,
    smsReports: 2,
    automationReports: 4,
    missingInputs: [],
    smsCreditPriceUsd: 0.01,
    monthlySubscriptionCostUsd: 100,
    agencyRetainerCostIls: 3000,
    hasMetricSnapshot: true,
  });
  assert.equal(result.stage, "approved");
  assert.equal(result.needsAttention, false);
});

test("a complete draft still requires review before it is ready to send", () => {
  const result = assessMonthlyClose({
    summaryStatus: "draft",
    syncStatus: "healthy",
    emailReports: 5,
    smsReports: 2,
    automationReports: 4,
    missingInputs: [],
    smsCreditPriceUsd: 0.01,
    monthlySubscriptionCostUsd: 100,
    agencyRetainerCostIls: 3000,
    hasMetricSnapshot: true,
  });
  assert.equal(result.stage, "draft");
  assert.equal(result.needsAttention, true);
});
