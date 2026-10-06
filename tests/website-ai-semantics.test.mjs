import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateAiFindings } from "../src/lib/website-intelligence/ai.ts";
import { semanticFindingSupported } from "../src/lib/website-intelligence/ai-quality.ts";

const source = (text, validationText = text) => ({ id: "source", url: "https://example.test/about", pageType: "about", text, validationText, contentHash: "hash" });
const finding = (evidence, summary = evidence, extra = {}) => ({ category: "problems", key: "stated_problems", sourceId: "source", evidence, value: { summary, details: [] }, observationStatus: "observed", confidence: "high", ...extra });
const check = (row, sources = [source(row.evidence)], task = "audience_problems") => validateAiFindings({ findings: [row] }, sources, task)[0];

for (const text of [
  "Our mission is to make cooking at home enjoyable for everyone.",
  "Our vision is a world in which families cook with confidence.",
  "Our philosophy is that good food should be simple to prepare.",
  "We aspire to inspire people to enjoy cooking again.",
  "החזון שלנו הוא שכמה שיותר אנשים יתאהבו בבישול הביתי.",
]) test("brand aspiration cannot become an observed customer problem: " + text, () => {
  assert.throws(() => check(finding(text)), /unsupported_semantic_type/);
  assert.equal(check(finding(text, text, {category:"brand",key:"brand_description"}), undefined, "brand_voice").observationStatus, "observed");
});
test("relabeling an unsupported brand aspiration as inferred pain is not a bypass", () => {
  const text = "Our vision is a world in which everyone enjoys cooking.";
  assert.throws(() => check(finding(text, "לקוחות חסרי ביטחון במטבח", {key:"pain_points_likely",observationStatus:"inferred"})), /unsupported_semantic_type/);
});
for (const text of [
  "Customers struggle to prepare dinner after a long workday.",
  "Our customers have difficulty choosing the right spices.",
  "הלקוחות שלנו מתקשים לבחור תבלינים שמתאימים לארוחה.",
  "נשים מתקשות למצוא זמן להכנת ארוחה אחרי העבודה.",
]) test("explicit customer experience supports the problem type: " + text, () => {
  const summary = text.replace(/^Our /, "");
  assert.equal(check(finding(text, summary)).observationStatus, "observed");
});
test("a product benefit does not entail a customer desire, observed or inferred", () => {
  const text = "Our spice mixes make cooking faster and easier.";
  for (const observationStatus of ["observed","inferred"]) assert.throws(() => check(finding(text, "רצון לבשל מהר יותר", {key:"desired_outcomes",observationStatus})), /unsupported_semantic_type/);
});
test("an explicit customer desire may ground interpretation without inventing the premise", () => {
  const text = "Our customers want quick and easy meals after work.";
  assert.equal(check(finding(text, "לקוחות רוצים ארוחות פשוטות ומהירות", {key:"desired_outcomes",observationStatus:"inferred"})).observationStatus, "inferred");
});
test("a brand belief is not a customer belief and no new belief taxonomy key is introduced", () => {
  const text = "We believe quality ingredients are important.";
  assert.equal(semanticFindingSupported("customer_beliefs", {summary:"quality ingredients are important",details:[]}, text, text, "observed"), false);
  const explicit = "Customers believe quality ingredients are important.";
  assert.equal(semanticFindingSupported("customer_beliefs", {summary:"quality ingredients are important",details:[]}, explicit, explicit, "observed"), true);
  assert.throws(() => check(finding(explicit, explicit, {key:"customer_beliefs"})), /invalid_ai_schema/);
});
test("shortening a citation cannot strip brand belief/hypothetical framing", () => {
  const quote = "customers struggle to cook with confidence";
  for (const prefix of ["We believe ", "Our aspiration is to help ", "Imagine that ", "If "]) {
    assert.throws(() => check(finding(quote), [source(quote, prefix+quote+".")]), /unsupported_semantic_type/);
  }
});
test("mixed evidence must support the selected claim, not just contain a customer-problem marker elsewhere", () => {
  const text = "Our vision is to make home cooking enjoyable. Customers struggle to choose spices.";
  assert.throws(() => check(finding(text, "Our vision is to make home cooking enjoyable.")), /unsupported_semantic_type/);
  assert.equal(check(finding(text, "Customers struggle to choose spices")).observationStatus, "observed");
});
test("negated customer experience is not an observed positive problem", () => {
  const text = "Our customers do not struggle to choose ingredients.";
  assert.throws(() => check(finding(text)), /unsupported_semantic_type/);
});
test("brand vision cannot masquerade as an observed product benefit or operational rule", () => {
  const text = "Our vision is convenient cooking and delivery for everyone.";
  assert.throws(() => check(finding(text,text,{category:"products",key:"benefits"}),undefined,"products_commercial"), /unsupported_semantic_type/);
  assert.throws(() => check(finding(text,text,{category:"operations",key:"shipping"}),undefined,"differentiation_operations"), /unsupported_semantic_type/);
});
test("Ayelet's previously published literal vision quote is rejected specifically for semantic type", {skip:!fs.existsSync(".tmp/epic2-quality-ai4-final/manual-review.json")}, () => {
  const saved=JSON.parse(fs.readFileSync(".tmp/epic2-quality-ai4-final/manual-review.json","utf8"));
  const bad=saved.published.find(f=>f.key==="stated_problems");
  assert.ok(bad.source.text.includes(bad.evidence));
  assert.ok(bad.evidence.includes(bad.value.summary));
  assert.throws(() => check(finding(bad.evidence,bad.value.summary),[source(bad.evidence,bad.source.text)]), /unsupported_semantic_type/);
});
