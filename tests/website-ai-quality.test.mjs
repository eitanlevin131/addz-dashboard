import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { aiInput, prepareAiTask, validateAiFindings, WEBSITE_AI_VERSION } from "../src/lib/website-intelligence/ai.ts";

const source = (text, extra = {}) => ({ id: "source", url: "https://example.test/policy", pageType: "shipping", text, contentHash: "source", ...extra });
const row = (evidence, summary = evidence, extra = {}) => ({ category: "operations", key: "shipping", value: { summary, details: [] }, sourceId: "source", evidence, observationStatus: "observed", confidence: "high", ...extra });
const validate = (finding, sources, task = "differentiation_operations") => validateAiFindings({ findings: [finding] }, sources, task)[0];

for (const text of [
  "Free pickup-point shipping on orders over ₪150.",
  "Home delivery is free only on orders over ₪300.",
  "Members receive a 10% discount with code SAVE, on purchases of at least ₪200, until Friday, excluding bundles.",
  "Price $20 per box, minimum purchase 3 boxes, for members only.",
  "משלוח לנקודת איסוף חינם בהזמנות של 150 ש״ח ומעלה בלבד.",
]) test("complete commercial rule retains all qualifiers: " + text, () => {
  assert.equal(validate(row(text), [source(text)]).value.summary, text);
  const partial = text.includes("10%") ? "10% discount" : text.includes("$20") ? "Price $20" : text.includes("150 ש") ? "150 ש״ח" : text.includes("delivery") ? "free" : "shipping";
  assert.throws(() => validate(row(text, partial), [source(text)]), /incomplete_commercial_condition/);
});
test("delivery method and distinct thresholds cannot be collapsed, even with a literal citation", () => {
  const text = "Pickup-point shipping: free from ₪150. Home delivery: free from ₪300.";
  assert.throws(() => validate(row("free from ₪150", "free from ₪150"), [source(text)]), /incomplete_commercial_condition/);
  assert.equal(validate(row(text), [source(text)]).value.summary, text);
});
test("method in a preceding heading remains material; hidden/truncated conditions still reject", () => {
  const text = "Pickup-point shipping. Free from ₪150. Home delivery. Free from ₪300.";
  const citation = "Free from ₪150.";
  assert.throws(() => validate(row(citation), [source(citation, { validationText: text })]), /incomplete_commercial_condition/);
  assert.equal(validate(row(text), [source(text)]).value.summary, text);
});
test("a later coupon/minimum-purchase qualifier cannot be dropped from a conditional offer", () => {
  const text = "10% discount. Only for members with code SAVE and a minimum purchase of ₪200.";
  const extra = { category: "commercial", key: "discounts_claim" };
  assert.throws(() => validate(row("10% discount.", "10% discount.", extra), [source(text)], "products_commercial"), /incomplete_commercial_condition/);
  assert.equal(validate(row(text, text, extra), [source(text)], "products_commercial").value.summary, text);
});
test("multiple conditions inside one evidence cannot be fragmented into an unconditional summary", () => {
  const text = "Free shipping only for members, on orders above $100, with code SAVE, excluding remote areas.";
  assert.throws(() => validate(row(text, "Free shipping", { value: { summary: "Free shipping", details: ["on orders above $100"] } }), [source(text)]), /incomplete_commercial_condition/);
});
test("a separate geographic/expiry qualifier without currency remains part of the rule", () => {
  for (const suffix of ["Only mainland addresses are eligible.", "Valid until Friday, excluding remote areas."]) {
    const text = "Free shipping from ₪150. " + suffix;
    assert.throws(() => validate(row("Free shipping from ₪150."), [source(text)]), /incomplete_commercial_condition/);
    assert.equal(validate(row(text), [source(text)]).value.summary, text);
  }
});
test("currency decimal prices and thresholds keep their numbers intact", () => {
  const text = "Price ₪19.90 per unit with a minimum purchase of 2 units.";
  assert.equal(validate(row(text), [source(text)]).value.summary, text);
  assert.throws(() => validate(row(text, "Price ₪19.90"), [source(text)]), /incomplete_commercial_condition/);
});
test("product names are not categories on product pages or category archives", () => {
  const name = "תערובת מרקש 25 גרם", extra = { category: "products", key: "categories" };
  for (const pageType of ["product", "category"]) {
    assert.throws(() => validate(row(name, name, extra), [source(name, { pageType, productNames: [name] })], "products_commercial"), /product_as_category/);
  }
  const text = "קטגוריות המוצרים: תערובות תבלינים, מארזים ומתנות.";
  assert.equal(validate(row(text, "תערובות תבלינים", extra), [source(text, { pageType: "category", productNames: [name] })], "products_commercial").key, "categories");
});
test("product blacklist spans sources not selected for the task, without leaking validation text to AI", () => {
  const list = Array.from({ length: 10 }, (_, n) => source("Useful product content. ".repeat(150), { id: "s" + n, contentHash: "h" + n, pageType: "product", productNames: ["SKU " + n] }));
  const prepared = prepareAiTask("products_commercial", list);
  assert.ok(prepared.sources[0].productNames.includes("SKU 9"));
  assert.ok(prepared.sources[0].validationText.length > prepared.sources[0].text.length);
  const input = JSON.parse(aiInput("products_commercial", prepared.sources));
  assert.equal(input.sources[0].validationText, undefined);
  assert.ok(input.excludedProductNames.includes("SKU 9"));
});
test("a generic shop/catalog heading is not a genuine product group", () => {
  for (const label of ["חנות", "מוצרים", "Shop", "All products"]) {
    const text = `${label}: browse our product catalog.`;
    assert.throws(() => validate(row(text, label, { category: "products", key: "categories" }), [source(text, {pageType:"category"})], "products_commercial"), /unsupported_category_taxonomy/);
  }
});
test("an explicitly stated nationwide customer base is observed, not a likely audience", () => {
  const text = "עם קהל לקוחות בכל רחבי הארץ בכל קשת הגילאים והבחירות התזונתיות;";
  assert.equal(validate(row(text, text, {category:"audience", key:"audience_explicit", observationStatus:"inferred"}), [source(text)], "audience_problems").observationStatus, "observed");
});
test("explicit Hebrew audience is observed even when AI selects audience_likely/inferred", () => {
  const text = "הקהל שלנו כולל צמחוניים, טבעוניים, קהילת הצליאק והנמנעים מגלוטן.";
  for (const key of ["audience_explicit", "audience_likely"]) {
    const finding = validate(row(text, "קהילת הצליאק והנמנעים מגלוטן", { category: "audience", key, observationStatus: "inferred" }), [source(text, { pageType: "about" })], "audience_problems");
    assert.equal(finding.observationStatus, "observed"); assert.equal(finding.key, "audience_explicit");
  }
});
test("explicit English audience is directly observed; contextual audience stays inferred", () => {
  const text = "Our audience includes parents and children who enjoy cooking.";
  assert.equal(validate(row(text, "parents and children", { category: "audience", key: "audience_likely" }), [source(text)], "audience_problems").observationStatus, "observed");
  const context = "Our products are gluten-free and convenient to cook at home.";
  assert.throws(() => validate(row(context, "קהילת הצליאק", { category: "audience", key: "audience_likely" }), [source(context)], "audience_problems"), /unsupported_claim_expansion/);
  const inferred = validate(row(context, "צרכנים המחפשים מוצרים ללא גלוטן", { category: "audience", key: "audience_likely" }), [source(context)], "audience_problems");
  assert.equal(inferred.observationStatus, "inferred"); assert.equal(inferred.confidence, "medium");
  assert.throws(() => validate(row(context, "קהילת הצליאק", { category: "audience", key: "audience_explicit" }), [source(context)], "audience_problems"), /unsupported_explicit_audience/);
});
test("a negated audience statement cannot be promoted as explicit positive evidence", () => {
  const text = "Intended for adults only, not children.";
  assert.throws(() => validate(row(text, "children", { category: "audience", key: "audience_explicit" }), [source(text)], "audience_problems"), /unsupported_explicit_audience/);
});
test("non-commercial observations and derived pains retain their original boundaries", () => {
  const text = "משלוחים יוצאים בימים א׳ עד ה׳.";
  assert.equal(validate(row(text), [source(text)]).observationStatus, "observed");
  const pain = "Our customers want to save time when preparing dinner for families.";
  assert.equal(validate(row(pain, "רצון להכין ארוחה מהר", { category: "problems", key: "desired_outcomes" }), [source(pain)], "audience_problems").observationStatus, "inferred");
  assert.equal(WEBSITE_AI_VERSION.skillVersion, "10");
});
test("stored Ayelet commercial and product failures are rejected without fetching its website", { skip: !fs.existsSync(".tmp/epic2-quality-final/ayelet-manual-review-input.json") }, () => {
  const saved = JSON.parse(fs.readFileSync(".tmp/epic2-quality-final/ayelet-manual-review-input.json", "utf8"));
  const productNames = saved.metrics.products.map(p => p.name);
  for (const published of saved.published.filter(p => p.key === "categories" || p.value.summary.includes("150"))) {
    const original = saved.sources.find(s => s.canonical_url === published.source);
    const input = source(original.text, { id: original.id, pageType: original.page_type, productNames });
    assert.throws(() => validate(row(published.evidence, published.value.summary, { category: published.category, key: published.key, sourceId: original.id, observationStatus: published.kind }), [input], published.task), /product_as_category|incomplete_commercial_condition/);
  }
});
