import test from "node:test";
import assert from "node:assert/strict";
import { strategicBundle, validateStrategicCandidates, applyStrategicReview, strategicRequest, requestStrategic } from "../src/lib/website-intelligence/strategic.ts";
import { websiteReasoning, intelligenceClassification } from "../src/lib/website-intelligence/strategic-contract.ts";
import { generateQuestionnaire } from "../src/lib/questionnaire/core.ts";
import { questionPresentation } from "../src/lib/questionnaire/presentation.ts";
import { websiteWarningLabel } from "../src/lib/website-intelligence/config.ts";

const source = { id: "s", url: "https://example.test/about", pageType: "about", status: "completed",
  text: "Our brand offers furniture. We design comfortable ergonomic chairs with support for long sitting. Customers can choose furniture for their room. Our mission is to create beauty. Discover your style and contact us for advice. We sell online and can send extra photographs of products before purchase." };
const bundle = strategicBundle("positioning", [source]);
const row = (overrides = {}) => ({ key: "positioning", summary: "The sampled description appears to balance style and practical use.", classification: "INFERRED", confidence: "medium", scope: "sample", subject: "sampled furniture descriptions", attributed: true,
  evidenceRefs: [bundle.evidence[0].ref], reasoningBridge: "The description joins design language with explicit ergonomic comfort; broader brand intent remains unconfirmed.", ...overrides });
const review = (verdict = "PASS_INFERRED", reason = "supported") => ({ decisions: [{ index: 0, verdict, reason }] });
test("source selection uses original text and traceable coherent chunks", () => {
  assert.ok(bundle.sufficient); assert.ok(bundle.evidence.every(e => e.locations.every(l => l.sourceId === "s")));
  assert.ok(bundle.coverage.characters <= 36000); assert.ok(bundle.evidence.length <= 24);
});
test("strategic warnings identify the domain and never hide source drift", () => {
  assert.match(websiteWarningLabel("strategic_audience_invalid_findings_rejected"), /קהל ומצבי שימוש/);
  assert.match(websiteWarningLabel("strategic_audience_source_context_changed"), /סריקה חדשה/);
});
test("paragraph at the end remains accessible", () => {
  const long = { ...source, text: "Irrelevant controls. ".repeat(150) + "\n\n" + source.text };
  assert.ok(strategicBundle("positioning", [long]).evidence.some(e => e.text.includes("ergonomic")));
});
test("missing evidence fails before review", () => {
  assert.equal(validateStrategicCandidates({ findings: [row({ evidenceRefs: ["invented"] })] }, bundle).rejected[0].reason, "invalid_evidence_reference");
});
test("schema rejects unknown semantic types, empty bridges and excess candidates", () => {
  for (const output of [{ findings: [row({ key: "categories" })] }, { findings: [row({ reasoningBridge: "" })] }, { findings: [row(), row(), row(), row()] }])
    assert.throws(() => validateStrategicCandidates(output, bundle), /invalid_ai_schema/);
});
test("inference is not a trimmed source quotation", () => {
  assert.equal(validateStrategicCandidates({ findings: [row({ summary: "Discover your style and contact us for advice." })] }, bundle).rejected[0].reason, "missing_interpretation");
});
test("direct quotations must exist in the original references, not be invented paraphrases", () => {
  const b = strategicBundle("voice", [{ ...source, text: source.text + " הוספה למועדפים. מעבר למאמר. הוספה לסל." }]);
  const base = row({ key: "cta_patterns", classification: "OBSERVED", evidenceRefs: [b.evidence[0].ref] });
  assert.equal(validateStrategicCandidates({ findings: [{ ...base, summary: "האתר מזמין ללחוץ על „הוסף לרשימת המשאלות” ו„הוספה לסל”." }] }, b).rejected[0].reason, "unsupported_direct_quotation");
  assert.equal(validateStrategicCandidates({ findings: [{ ...base, summary: "האתר משתמש בפניות „הוספה למועדפים” ו„הוספה לסל”." }] }, b).candidates.length, 1);
});
test("review cannot override a deterministic rejection", () => {
  assert.equal(applyStrategicReview([row({ evidenceRefs: ["wrong"] })], review(), bundle).findings.length, 0);
});
test("verdict/classification/reason must agree", () => {
  for (const decision of [review("PASS_OBSERVED"), review("KEEP_HYPOTHESIS")])
    assert.equal(applyStrategicReview([row()], decision, bundle).findings.length, 0);
  assert.throws(() => applyStrategicReview([row()], review("PASS_INFERRED", "unsupported_type"), bundle), /invalid_ai_review/);
});
test("bundle reference IDs do not depend on database row order", () => {
  const sources = [source, { ...source, id: "s2", url: "https://example.test/home", text: source.text + " Further context." }];
  assert.equal(strategicBundle("positioning", sources).inputHash, strategicBundle("positioning", sources.reverse()).inputHash);
});
test("incomplete and duplicate verdicts fail closed", () => {
  assert.throws(() => applyStrategicReview([row()], { decisions: [] }, bundle), /invalid_ai_review/);
  assert.throws(() => applyStrategicReview([row(), row()], { decisions: [review().decisions[0], review().decisions[0]] }, bundle), /invalid_ai_review/);
});
test("multi-source provenance remains original with hashes/offsets", () => {
  const b = strategicBundle("positioning", [source, { ...source, id: "s2", url: "https://example.test/about-2", text: source.text + " Another design message." }]);
  const c = row({ evidenceRefs: b.evidence.slice(0, 2).map(e => e.ref) });
  const f = applyStrategicReview([c], review(), b).findings[0];
  assert.ok(f); assert.equal(f.value.classification, "INFERRED");
  assert.ok(f.value.evidenceSources.some(e => e.sourceId === "s2"));
  assert.ok(f.value.evidenceSources.every(e => e.sourceTextHash && e.chunkId && typeof e.start === "number"));
});
test("hypotheses remain separate from facts", () => {
  const b = strategicBundle("needs", [source]);
  const c = row({ key: "pain_points_likely", classification: "HYPOTHESIS", summary: "Could seating comfort be an important need for customers?" });
  const f = applyStrategicReview([c], review("KEEP_HYPOTHESIS"), b).findings[0];
  assert.equal(f.observationStatus, "inferred"); assert.equal(f.value.requiresClientConfirmation, true);
  assert.equal(f.confidence, "low");
  assert.equal(intelligenceClassification(f.value, f.observationStatus), "HYPOTHESIS");
});
test("an unconfirmed customer problem never uses a stated-problem label", () => {
  const b = strategicBundle("needs", [source]);
  const c = row({ key: "stated_problems", classification: "HYPOTHESIS", summary: "Could seating comfort matter to these customers?" });
  assert.equal(applyStrategicReview([c], review("KEEP_HYPOTHESIS"), b).findings[0].key, "pain_points_likely");
});
test("derived customer desire cannot be a proven inference or observation", () => {
  const b = strategicBundle("outcomes", [source]);
  for (const classification of ["INFERRED", "OBSERVED"]) assert.ok(validateStrategicCandidates({ findings: [row({ key: "desired_outcomes", classification })] }, b).rejected.length);
});
test("mission is not directly observed customer pain", () => {
  const b = strategicBundle("needs", [source]);
  const result = validateStrategicCandidates({ findings: [row({ key: "stated_problems", classification: "OBSERVED" })] }, b);
  assert.equal(result.rejected[0].reason, "unsupported_customer_semantics");
});
test("dietary audience and time-saving require their own evidence", () => {
  const b = strategicBundle("audience", [source]);
  for (const summary of ["Vegan customers are likely interested in these chairs.", "These chairs save time for customers."])
    assert.equal(validateStrategicCandidates({ findings: [row({ key: "audience_likely", summary })] }, b).rejected[0].reason, "unsupported_claim_expansion");
});
test("commercial conditions cannot be laundered through strategic prose", () => {
  assert.equal(validateStrategicCandidates({ findings: [row({ summary: "Free shipping from ₪150 for all customers." })] }, bundle).rejected[0].reason, "deterministic_commercial_only");
});
test("premium/lifestyle descriptions require their own cited support", () => {
  for (const summary of ["המותג מציג ריהוט יוקרתי לכל הבית.", "The brand specializes in premium lifestyle furniture."])
    assert.equal(validateStrategicCandidates({ findings: [row({ key: "brand_description", classification: "OBSERVED", summary })] }, bundle).rejected[0].reason, "unsupported_brand_descriptor");
  const supported = strategicBundle("positioning", [{ ...source, text: source.text + " Our brand describes its premium lifestyle furniture." }]);
  assert.equal(validateStrategicCandidates({ findings: [row({ key: "brand_description", classification: "OBSERVED", summary: "The brand describes itself as offering premium lifestyle furniture.", evidenceRefs: [supported.evidence[0].ref] })] }, supported).candidates.length, 1);
});
test("single-product copy cannot become whole-brand positioning", () => {
  const b = strategicBundle("positioning", [{ ...source, pageType: "product", title: "Karo" }]);
  assert.equal(validateStrategicCandidates({ findings: [row({ scope: "brand" })] }, b).rejected[0].reason, "product_as_brand");
});
test("product title identity is authoritative, not a stale URL slug", () => {
  const b = strategicBundle("outcomes", [{ ...source, pageType: "product", title: "Karo", url: "https://example.test/products/monsoon-copy" }]);
  assert.equal(validateStrategicCandidates({ findings: [row({ key: "benefits", scope: "product", subject: "Monsoon", classification: "OBSERVED" })] }, b).rejected[0].reason, "untrusted_product_identity");
});
test("non-food ergonomic benefit is supported, storage instructions alone are not", () => {
  const b = strategicBundle("outcomes", [source]);
  assert.equal(validateStrategicCandidates({ findings: [row({ key: "benefits", classification: "OBSERVED" })] }, b).candidates.length, 1);
  const storage = strategicBundle("outcomes", [{ ...source, text: "For ease of access, keep the bottle on a visible shelf. Store in a cool dry place. ".repeat(3) }]);
  assert.equal(validateStrategicCandidates({ findings: [row({ key: "benefits", classification: "OBSERVED" })] }, storage).rejected[0].reason, "unsupported_benefit");
});
test("Terra/Sol routing never sends unsupported minimal reasoning", () => {
  assert.equal(websiteReasoning("gpt-5.6-terra").reasoning.effort, "medium");
  assert.equal(websiteReasoning("gpt-5-mini").reasoning.effort, "minimal");
  assert.equal(strategicRequest(bundle, "gpt-5.6-terra").reasoning.effort, "medium");
  assert.equal(strategicRequest(bundle, "gpt-5.6-terra").store, false);
});
test("provider errors/refusals cannot leak payloads or be published", async () => {
  const original = fetch, key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "private-provider-detail" }), { status: 500 });
    await assert.rejects(requestStrategic(bundle, "gpt-5.6-terra"), e => e.message === "ai_provider_unavailable");
    globalThis.fetch = async () => new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "private refusal" }] }] }));
    await assert.rejects(requestStrategic(bundle, "gpt-5.6-terra"), /ai_refusal/);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});
test("questionnaire keeps a bounded confirmation budget and explicitly labels hypotheses", () => {
  const findings = Array.from({ length: 20 }, (_, i) => ({ authority: "website_hypothesis", findingId: String(i), sourceId: "s", scanId: "scan", url: source.url, evidence: source.text, confidence: "medium", reviewDisposition: "normal", key: "purchase_objections", category: "problems", observationStatus: "inferred", value: { summary: "Could room fit be a purchase concern " + i + "?", classification: "HYPOTHESIS" } }));
  const q = generateQuestionnaire({ name: "Synthetic", website: source.url, includedServices: [], commercialScope: null }, "scan", findings);
  assert.ok(q.items.filter(i => i.action === "confirm").length <= 8);
  assert.match(questionPresentation(q.items.find(i => i.source)).prompt, /לא מאומתת/);
});
