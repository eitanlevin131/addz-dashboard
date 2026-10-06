import test from "node:test";
import assert from "node:assert/strict";
import { questionPresentation, answerNeedsText } from "../src/lib/questionnaire/presentation.ts";
import { publicProjection } from "../src/lib/questionnaire/core.ts";

const question = (key, value, suggestion = "") => ({ id: "finding:test", label: "מידע מהאתר", action: "confirm", required: false, section: "known", suggestion,
  source: { key, value, category: "operations", authority: "website_observed", evidence: "original evidence", url: "https://example.test", confidence: "high", reviewDisposition: "normal" } });
test("product presentation separates name and price instead of dumping description/JSON", () => {
  const result = questionPresentation(question("product", { name: "תבלין", price: 25, currency: "ILS", description: "x".repeat(2000), internalNote: "secret" }));
  assert.deepEqual(result.facts, [{ label: "מוצר לדוגמה", value: "תבלין" }, { label: "מחיר שהופיע באתר", value: "25 ₪" }]);
  assert.equal(result.text, ""); assert.ok(!JSON.stringify(result).includes("secret"));
});
test("zero prices are preserved, absent prices are not fabricated", () => {
  assert.equal(questionPresentation(question("product", { name: "דוגמה", price: 0 })).facts[1].value, "0");
  assert.equal(questionPresentation(question("product", { name: "דוגמה" })).facts.length, 1);
});
test("policies retain all qualifiers without summary or arbitrary truncation", () => {
  const text = "איסוף חינם מ־150 ₪. לבית חינם מ־300 ₪. ".repeat(80) + "ביטול בכפוף לתנאים בלבד.";
  const q = question("shipping_text", { text }, text); const before = JSON.stringify(q);
  const result = questionPresentation(q);
  assert.equal(result.text, text); assert.match(result.prompt, /עדכנית/);
  assert.equal(JSON.stringify(q), before);
});
test("inferred audience stays a question and original authority/evidence remain intact", () => {
  const q = question("audience_likely", { summary: "ייתכן שקהל ביתי רלוונטי" }, "ייתכן שקהל ביתי רלוונטי");
  q.source.category = "audience"; q.source.authority = "website_inferred";
  const result = publicProjection({ snapshot: { clientName: "TEST", items: [q] }, selectedIds: [q.id], answers: {}, revision: 0, status: "sent" });
  assert.match(result.items[0].presentation.prompt, /רלוונטי/);
  assert.equal(result.items[0].source.authority, "website_inferred");
  assert.equal(result.items[0].source.evidence, q.source.evidence);
  assert.equal("value" in result.items[0].source, false);
});
test("legacy snapshot shapes fall back to their original text, never guessed facts", () => {
  const q = question("unknown_key", null, "טקסט מקור");
  assert.equal(questionPresentation(q).text, q.suggestion);
  assert.deepEqual(questionPresentation(q).facts, []);
});
test("ordinary client questions have no invented website context", () => {
  assert.deepEqual(questionPresentation({ label: "מה חשוב לכם?", action: "ask" }), { prompt: "מה חשוב לכם?", facts: [], text: "" });
});
test("corrections and partial answers need text before autosave, other decisions do not", () => {
  for (const state of ["partial", "corrected", "answered"]) assert.equal(answerNeedsText(state), true);
  for (const state of ["confirmed", "rejected", "unknown", "kickoff"]) assert.equal(answerNeedsText(state), false);
});
