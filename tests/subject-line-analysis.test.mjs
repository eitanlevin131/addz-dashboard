import assert from "node:assert/strict";
import test from "node:test";
import { buildSubjectLineEvidence, findUnsupportedSubjectClaims, isCausalSubjectPattern } from "../src/lib/subject-line-analysis.ts";

const report = (campaignId, delivered, revenue, openRate, clickRate = 0.02) => ({
  campaignId,
  name: `Campaign ${campaignId}`,
  subject: `Subject ${campaignId}`,
  delivered,
  opens: Math.round(delivered * openRate),
  clicks: Math.round(delivered * clickRate),
  purchases: Math.round(delivered * 0.005),
  revenue,
});

test("subject evidence rejects a tiny campaign from the eligible winner pool", () => {
  const result = buildSubjectLineEvidence([
    report(1, 10_000, 10_000, 0.22),
    report(2, 9_000, 8_000, 0.25),
    report(3, 8_000, 7_000, 0.28),
    report(4, 7_000, 6_000, 0.24),
    report(99, 50, 2_000, 1),
  ]);

  assert.equal(result.minimumDelivered, 1_600);
  assert.equal(result.eligibleCampaigns, 4);
  assert.equal(result.examples.some((item) => item.campaignId === 99), false);
});

test("subject evidence balances opens, clicks, efficiency and total revenue", () => {
  const result = buildSubjectLineEvidence([
    report(1, 10_000, 4_000, 0.4, 0.01),
    report(2, 10_000, 5_000, 0.2, 0.08),
    report(3, 5_000, 12_000, 0.25, 0.03),
    report(4, 20_000, 20_000, 0.23, 0.025),
  ]);

  const ids = new Set(result.examples.map((item) => item.campaignId));
  assert.deepEqual(ids, new Set([1, 2, 3, 4]));
  assert.equal(result.examples.find((item) => item.campaignId === 3)?.revenuePerThousand, 2_400);
});

test("subject copy rejects commercial claims that were not approved", () => {
  const approved = "מארז קוקטיילים במהדורה מוגבלת, ללא הנחה, ללא הבטחת מלאי וללא תאריך סיום";
  assert.deepEqual(findUnsupportedSubjectClaims("20% הנחה רק היום", approved), [
    "הנחה, מחיר או מתנה שלא אושרו",
    "דדליין שלא אושר",
  ]);
  assert.deepEqual(findUnsupportedSubjectClaims("מהדורה מוגבלת לפני שייגמר", approved), [
    "מחסור או מלאי שלא אושרו",
  ]);
  assert.deepEqual(findUnsupportedSubjectClaims("מארז בלעדי לזמן מוגבל — אל תחמיצו", approved), [
    "דדליין שלא אושר",
    "טענת איכות או פופולריות שלא אושרה",
  ]);
  assert.deepEqual(findUnsupportedSubjectClaims("מארז חדש של SPICEHAUS", approved), [
    "טענת חדשנות שלא אושרה",
  ]);
});

test("subject copy accepts an explicitly approved claim", () => {
  assert.deepEqual(findUnsupportedSubjectClaims("20% הנחה רק היום", "20% הנחה רק היום"), []);
  assert.deepEqual(findUnsupportedSubjectClaims("מארז חדש של SPICEHAUS", "השקת מארז חדש של SPICEHAUS"), []);
});

test("historical patterns reject causal language", () => {
  assert.equal(isCausalSubjectPattern("הניסוח שייצרה פתיחה גבוהה יותר"), true);
  assert.equal(isCausalSubjectPattern("נוסח אישי הופיע לצד פתיחה גבוהה יותר"), false);
});
