import assert from "node:assert/strict";
import test from "node:test";
import { websiteOverview, websiteProgress, findingText, sameWebsiteForQuestionnaire, websiteProductSample } from "../src/lib/website-intelligence/overview.ts";

test("product sample distinguishes discovered candidates from selected and processed pages", () => {
  assert.deepEqual(websiteProductSample([{ id: "a", pageType: "product", status: "completed" }, { id: "b", pageType: "product", status: "failed" }], [
    { url: "https://example.test/product", type: "product" }, { url: "https://example.test/product", type: "product" }, { url: "https://example.test/other", type: "category" },
  ]), { discovered: 1, selected: 2, processed: 1 });
  assert.deepEqual(websiteProductSample([], []), { discovered: 0, selected: 0, processed: 0 });
});
import { shouldStartInitialWebsiteScan } from "../src/lib/client-foundation.ts";
const sources = [{ id: "s1", status: "completed", pageType: "product" }, { id: "s2", status: "failed", pageType: "shipping" }];
const finding = (extra = {}) => ({ id: "f1", sourceId: "s1", category: "products", key: "product", value: { name: "תבלין", price: 0, currency: "ILS" }, observationStatus: "observed", reviewDisposition: "normal", ...extra });
test("creation consent is opt-in in the UI but existing API auto-start remains compatible", () => {
  assert.equal(shouldStartInitialWebsiteScan(undefined), true);
  assert.equal(shouldStartInitialWebsiteScan(true), true);
  assert.equal(shouldStartInitialWebsiteScan(false), false);
  for (const invalid of [null, "false", 0, {}]) assert.throws(() => shouldStartInitialWebsiteScan(invalid));
});
test("overview preserves source IDs, exact commercial qualifiers and inferred status", () => {
  const summary = "משלוח לנקודת איסוף חינם מ־150 ש״ח; משלוח לבית חינם מ־300 ש״ח";
  const result = websiteOverview(sources, [finding({ category: "commercial", key: "offer", value: { summary }, observationStatus: "inferred", reviewDisposition: "needs_review" })]);
  assert.equal(result.sections[0].items[0].text, summary);
  assert.equal(result.sections[0].items[0].sourceId, "s1");
  assert.equal(result.sections[0].items[0].reviewDisposition, "needs_review");
  assert.equal(result.observed, 0); assert.equal(result.inferred, 1); assert.equal(result.needsReview, 1);
});
test("ignored findings and page titles do not become business summary items", () => {
  const result = websiteOverview(sources, [finding({ reviewDisposition: "ignored" }), finding({ category: "brand", key: "page_title", value: "דף מוצר" })]);
  assert.equal(result.ignored, 1); assert.equal(result.products, 0); assert.deepEqual(result.sections, []);
});
test("products/prices count distinct extracted records, including zero prices", () => {
  const result = websiteOverview(sources, [finding(), finding({ id: "duplicate" }), finding({ id: "unpriced", value: { name: "מוצר ללא מחיר" } })]);
  assert.equal(result.products, 2); assert.equal(result.pricedProducts, 1); assert.equal(result.pages, 1); assert.equal(result.failed, 1);
});
test("policy coverage distinguishes a processed page from a saved policy, including shared pages", () => {
  const result = websiteOverview(sources, [finding({ category: "operations", key: "returns_text", value: { text: "אפשר לבטל בכפוף לתנאים" } })]);
  assert.deepEqual(result.coverage.find(row => row.type === "shipping"), { type: "shipping", source: false, finding: false });
  assert.deepEqual(result.coverage.find(row => row.type === "returns"), { type: "returns", source: false, finding: true });
});
test("summary samples are bounded per category without changing totals", () => {
  const result = websiteOverview(sources, Array.from({ length: 8 }, (_, index) => finding({ id: String(index), value: { name: `מוצר ${index}` } })));
  assert.equal(result.sections[0].count, 8); assert.equal(result.sections[0].items.length, 2);
});
test("materially identical examples appear once without changing finding counts", () => {
  const result = websiteOverview(sources, [finding(), finding({ id: "same" })]);
  assert.equal(result.sections[0].count, 2); assert.equal(result.sections[0].items.length, 1);
});
test("summary prefers already validated concise findings over long raw policy excerpts", () => {
  const result = websiteOverview(sources, [finding({ id: "raw", category: "operations", key: "shipping_text", value: { text: "תוכן ארוך של מדיניות האתר" } }), finding({ id: "concise", category: "operations", key: "shipping", value: { summary: "משלוח לבית מ־300 ש״ח ללא עלות" } })]);
  assert.equal(result.sections[0].items[0].id, "concise");
  assert.equal(result.sections[0].count, 2);
});
test("progress uses persisted stages, real source counts and frozen terminal duration", () => {
  const scan = { status: "running", startedAt: "2026-10-06T10:00:00Z", createdAt: "2026-10-06T09:59:00Z", completedAt: null, state: { stage: "fetch", taskIndex: 0 } };
  const progress = websiteProgress(scan, sources, Date.parse("2026-10-06T10:02:30Z"));
  assert.equal(progress.stage, 1); assert.equal(progress.processed, 2); assert.equal(progress.selected, 2); assert.equal(progress.elapsedSeconds, 150);
  const completed = websiteProgress({ ...scan, status: "completed_with_warnings", completedAt: "2026-10-06T10:03:00Z", state: { stage: "finalize", taskIndex: 4 } }, sources, Date.parse("2026-10-07T10:00:00Z"));
  assert.equal(completed.finished, true); assert.equal(completed.elapsedSeconds, 180); assert.equal(completed.analysisCompleted, 4);
});
test("elapsed time for a pending scan never becomes negative", () => {
  assert.equal(websiteProgress({ status: "pending", createdAt: "2026-10-06T10:00:00Z", startedAt: null, completedAt: null, state: { stage: "bootstrap", taskIndex: 0 } }, [], 0).elapsedSeconds, 0);
});
test("questionnaire CTA handles normalized websites and rejects stale changed URLs", () => {
  assert.equal(sameWebsiteForQuestionnaire("https://www.example.test", "https://example.test/"), true);
  assert.equal(sameWebsiteForQuestionnaire("https://example.test/new", "https://example.test/old"), false);
  assert.equal(sameWebsiteForQuestionnaire(null, "https://example.test/"), false);
});
test("Hebrew finding values remain plain text rather than generated narrative", () => {
  assert.equal(findingText({ summary: "<script>אל תפרש HTML</script>" }), "<script>אל תפרש HTML</script>");
  assert.equal(findingText({ name: "מוצר", price: 25, currency: "ILS" }), "מוצר · 25 ILS");
});
