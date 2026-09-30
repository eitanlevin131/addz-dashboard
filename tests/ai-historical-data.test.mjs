import test from "node:test";
import assert from "node:assert/strict";
import { resolveAiQuestionPeriod } from "../src/lib/ai-question-period.ts";

const now = new Date("2026-09-30T09:00:00Z");

test("an explicit Hebrew month and year resolves to the exact account-local period", () => {
  const period = resolveAiQuestionPeriod("איזה קמפיינים שלחנו בנובמבר 2025?", "Asia/Jerusalem", now);

  assert.equal(period?.label, "נובמבר 2025");
  assert.equal(period?.startDate, "2025-11-01");
  assert.equal(period?.endDate, "2025-11-30");
  assert.equal(period?.endExclusiveDate, "2025-12-01");
});

test("a future month without a year resolves to its latest completed occurrence", () => {
  const period = resolveAiQuestionPeriod("מה שלחנו בנובמבר?", "Asia/Jerusalem", now);

  assert.equal(period?.label, "נובמבר 2025");
});

test("last year resolves to the previous calendar year", () => {
  const period = resolveAiQuestionPeriod("מה עבד הכי טוב בשנה שעברה?", "Asia/Jerusalem", now);

  assert.equal(period?.label, "שנת 2025");
  assert.equal(period?.startDate, "2025-01-01");
  assert.equal(period?.endDate, "2025-12-31");
});

test("numeric month and year are supported", () => {
  const period = resolveAiQuestionPeriod("תן לי את הקמפיינים של 11/2025", "Asia/Jerusalem", now);

  assert.equal(period?.label, "נובמבר 2025");
});

test("a natural Hebrew date range resolves to inclusive account-local bounds", () => {
  const period = resolveAiQuestionPeriod(
    "תבדוק החל מה-1.1.26 ועד ה-23.9.26",
    "Asia/Jerusalem",
    now,
  );

  assert.equal(period?.startDate, "2026-01-01");
  assert.equal(period?.endDate, "2026-09-23");
  assert.equal(period?.endExclusiveDate, "2026-09-24");
});

test("a single explicit date resolves to one account-local day", () => {
  const period = resolveAiQuestionPeriod("מה שלחנו ב-4.11.2025?", "Asia/Jerusalem", now);

  assert.equal(period?.label, "4.11.2025");
  assert.equal(period?.startDate, "2025-11-04");
  assert.equal(period?.endDate, "2025-11-04");
});
