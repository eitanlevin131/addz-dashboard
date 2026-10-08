import test from "node:test";
import assert from "node:assert/strict";
import { questionPresentation, answerNeedsText, answerIsComplete, firstUnanswered, ASK_CONTENT } from "../src/lib/questionnaire/presentation.ts";
import { readableSourceBlocks } from "../src/lib/questionnaire/readable-source.ts";
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
test("policy layout preserves amounts, fees, exceptions and all source wording", () => {
  const text = "מדיניות משלוחים דמי משלוח עבור ספות ₪400 דמי משלוח עבור כורסאות ₪100. איסוף עצמי: ללא עלות. זמני אספקה: עד 14 ימי עסקים. ביטול עסקה: 1.ביטול בתוך 14 ימים בתנאי שלא נעשה שימוש. 2.דמי ביטול 5% או 100 ₪, הנמוך מביניהם.";
  const blocks = readableSourceBlocks(text);
  assert.ok(blocks.length >= 6);
  assert.equal(blocks.map(b => b.text).join(" ").replace(/\s+/g, ""), text.replace(/\s+/g, ""));
  assert.ok(blocks.some(b => b.text.includes("5% או 100 ₪")));
  assert.ok(blocks.some(b => b.text.includes("בתנאי שלא נעשה שימוש")));
});
test("FAQ questions are readable headings without rewriting their answers", () => {
  const blocks = readableSourceBlocks("היכן ניתן לאסוף את ההזמנה? בתיאום מראש, בימים א׳–ה׳ 9:00–17:00. האם כל המוצרים זמינים? רק המוצרים המסומנים במלאי.");
  assert.equal(blocks[0].kind, "heading");
  assert.equal(blocks[2].kind, "heading");
  assert.equal(blocks[1].text, "בתיאום מראש, בימים א׳–ה׳ 9:00–17:00.");
});
test("layout never splits decimal amounts into misleading values", () => {
  const blocks = readableSourceBlocks("מחיר המוצר 550.00 ₪. המשלוח 49.90 ₪.");
  assert.deepEqual(blocks.map(b => b.text), ["מחיר המוצר 550.00 ₪.", "המשלוח 49.90 ₪."]);
});
test("catalog confirmation is about assortment with clean examples, not crawl statistics", () => {
  const p = questionPresentation(question("catalog_listing", { name: "SEO catalog title", productCount: 79, products: [{ name: "Claude · Regular price ₪550.00 Sale price ₪550.00 Unit price / per" }] }));
  assert.match(p.prompt, /חסרה קטגוריה/);
  assert.match(p.help, /אין צורך לאשר כל מוצר/);
  assert.deepEqual(p.facts, [{ label: "דוגמה מהמוצרים שלכם", value: "Claude" }]);
  assert.ok(!JSON.stringify(p).includes("Regular price"));
  assert.ok(!JSON.stringify(p).includes("79"));
});
test("client questions explain audiences, maximum discounts, curated assets and access contact", () => {
  for (const [id, copy] of Object.entries(ASK_CONTENT)) {
    const p = questionPresentation({ id, label: "old snapshot label", action: "ask" });
    assert.equal(p.prompt, copy.label); assert.equal(p.help, copy.help);
  }
  assert.ok(!ASK_CONTENT.audience_priority.label.includes("ברשימה"));
  assert.match(ASK_CONTENT.discount_rules.label, /מקסימלית/);
  assert.match(ASK_CONTENT.assets.help, /מימי צילום.*סיננתם/);
  assert.match(ASK_CONTENT.access.help, /אין להזין/);
});
test("forward navigation needs an answer, not a default unknown or blank correction", () => {
  const items = [{ id: "first", action: "ask" }, { id: "second", action: "confirm" }];
  assert.equal(firstUnanswered(items, {}).id, "first");
  assert.equal(firstUnanswered(items, { first: { state: "answered", text: " " } }).id, "first");
  assert.equal(firstUnanswered(items, { first: { state: "unknown", text: "" }, second: { state: "corrected", text: " " } }).id, "second");
  assert.equal(firstUnanswered(items, { first: { state: "kickoff", text: "" }, second: { state: "confirmed", text: "" } }), undefined);
});
test("asset links or sealed attachments can be answers but cannot replace a policy correction", () => {
  const answer = { state: "answered", text: "", links: ["https://example.test/photos"] };
  assert.equal(answerIsComplete({ action: "ask", links: true }, answer), true);
  assert.equal(answerIsComplete({ action: "ask" }, answer), false);
  assert.equal(answerIsComplete({ action: "confirm" }, { ...answer, state: "corrected" }), false);
  assert.equal(answerIsComplete({ action: "ask", links: true }, { state: "answered", text: "", attachments: [{}] }), true);
});
