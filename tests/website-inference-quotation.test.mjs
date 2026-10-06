import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { copiedInferenceSummary } from "../src/lib/website-intelligence/ai-quality.ts";
import { validateAiFindings } from "../src/lib/website-intelligence/ai.ts";
import { applyFindingReview } from "../src/lib/website-intelligence/finding-review.ts";

const winter = 'WINTER COLLECTION החורף כבר כאן ואנחנו בספייסהאוס דואגים לחמם לכם את החורף עם מהדורת קוקטיילים ומשקאות חורפיים שנרקחו במיוחד ע"י המיקסולוג של הספייסהאוס יותם שילה המהדורה החורפית ❄ WINTER COLLECTION ❄';
function validate(summary, evidence, category = "voice", key = "tone", context) {
  const row = { category, key, sourceId: "s", evidence, value: { summary, details: [] }, observationStatus: "inferred", confidence: "medium" };
  const source = { id: "s", url: "https://example.test/page", text: evidence, pageType: "about", contentHash: "h", evidenceChunks: [{ id: "c", text: evidence }] };
  const task = { voice: "brand_voice", brand: "brand_voice", audience: "audience_problems", problems: "audience_problems" }[category];
  return validateAiFindings({ findings: [row] }, [source], task, context)[0];
}
for (const summary of [winter, "WINTER COLLECTION החורף כבר כאן", "החורף כבר כאן ואנחנו בספייסהאוס דואגים לחמם לכם את החורף", "WINTER COLLECTION", "Tone: WINTER COLLECTION", "טון: החורף כבר כאן"]) {
  test("full, partial and heading quotes cannot become inferred tone: " + summary.slice(0, 45), () => {
    assert.equal(copiedInferenceSummary(summary, winter), true);
    assert.throws(() => validate(summary, winter), /missing_strategic_interpretation/);
  });
}
test("punctuation, spacing, case and Hebrew marks do not hide a copied phrase", () => {
  for (const text of ['winter collection: החורף   כבר כאן!', '״הַחוֹרֶף כְּבָר כָּאן״', 'WINTER-COLLECTION החורף, כבר כאן']) {
    assert.equal(copiedInferenceSummary(text, winter), true);
  }
});
test("minor trimming and generic inference wrappers cannot disguise dominant copied wording", () => {
  const source = "Our handcrafted bottled cocktails bring the bar experience to your home with carefully selected ingredients.";
  for (const text of [
    "Likely positioning: handcrafted bottled cocktails bring the bar experience to your home.",
    "Our handcrafted bottled cocktails bring the bar experience with carefully selected ingredients.",
  ]) assert.equal(copiedInferenceSummary(text, source), true);
});
for (const [category, key] of [["brand", "positioning"], ["audience", "audience_likely"], ["problems", "pain_points_likely"], ["problems", "desired_outcomes"], ["audience", "use_cases"]]) {
  test("quotation guard applies to inferred semantic type " + key + " without Research context", () => {
    assert.throws(() => validate("החורף כבר כאן", winter, category, key), /missing_strategic_interpretation/);
  });
}
for (const [summary, evidence, category, key] of [
  ["טון עונתי וחמים עם פנייה ישירה לקורא.", winter, "voice", "tone"],
  ['המיצוב מרמז על חוויה עונתית סביב המהדורה "WINTER COLLECTION", לא על שירות קבוע.', winter, "brand", "positioning"],
  ["A friendly, personal tone conveyed through the greeting hello friends.", "Hello friends! Welcome to our store.", "voice", "tone"],
  ["Premium positioning grounded in the phrase bar experience and the ingredient-quality claim.", "Our bottled drinks bring the bar experience home with carefully selected ingredients.", "brand", "positioning"],
]) {
  test("genuine interpretation may retain a short source/brand phrase: " + key + " / " + summary, () => {
    assert.equal(copiedInferenceSummary(summary, evidence), false);
    assert.equal(validate(summary, evidence, category, key).observationStatus, "inferred");
  });
}
test("explicit observed audience quotation is not treated as an inferred quote", () => {
  const result = validate("הקהל שלנו כולל הורים וילדים.", "הקהל שלנו כולל הורים וילדים.", "audience", "audience_likely");
  assert.equal(result.observationStatus, "observed");
  assert.equal(result.key, "audience_explicit");
});
test("an approving model decision cannot override copied-inference rejection", () => {
  const finding = { category: "voice", key: "tone", sourceType: "ai", sourceId: "s", evidence: winter,
    value: { summary: "WINTER COLLECTION החורף כבר כאן", details: [] }, observationStatus: "inferred", confidence: "medium" };
  const result = applyFindingReview([finding], { decisions: [{ index: 0, approved: true, reason: "supported" }] });
  assert.equal(result.findings.length, 0);
  assert.equal(result.rejected[0].reason, "missing_strategic_interpretation");
});
test("saved Spicehaus winter finding is rejected using its unchanged summary and citation", {
  skip: !fs.existsSync(".tmp/epic2-publication-boundary/spicehaus-result.json"),
}, () => {
  const saved = JSON.parse(fs.readFileSync(".tmp/epic2-publication-boundary/spicehaus-result.json"));
  const finding = saved.findings.find(f => f.key === "tone");
  assert.ok(finding?.sourceUrl.endsWith("/pages/winter-collection"));
  assert.equal(copiedInferenceSummary(finding.value.summary, finding.evidence), true);
  assert.throws(() => validate(finding.value.summary, finding.evidence), /missing_strategic_interpretation/);
});
