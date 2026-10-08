import test from "node:test";
import assert from "node:assert/strict";
import { generateQuestionnaire, parseAnswers, publicProjection, questionnaireProgress, validateSelection } from "../src/lib/questionnaire/core.ts";
import { answerIsComplete, firstUnanswered } from "../src/lib/questionnaire/presentation.ts";
import { rankedAnswerError, rankedAnswerText, rankedAnswerValues } from "../src/lib/questionnaire/ranked-answer.ts";
import { prepareKickoff, questionDomain } from "../src/lib/kickoff/core.ts";
import { characterizationDocument } from "../src/lib/kickoff/document.ts";

const client = { name: "עסק לבדיקה", website: "https://example.test", commercialScope: null, includedServices: [] };
const domains = { brand_story: "identity", brand_positioning: "positioning", brand_promise: "positioning", brand_differentiators: "differentiation", customer_pains: "pains", customer_needs: "pains", customer_desires: "desires", purchase_motivations: "motivations", purchase_objections: "objections", category_priorities: "products", product_bestsellers: "products" };
const snapshot = () => generateQuestionnaire(client, null, []);
const categoryRanking = { kind: "categories", limit: 4 };

test("core characterization topics are explicit required ASK items regardless of website evidence or package", () => {
  const source = { authority: "website_observed", scanId: "scan", findingId: "story", sourceId: "source", url: "https://example.test/about", pageType: "about", evidence: "סיפור באתר", confidence: "high", reviewDisposition: "normal", category: "brand", key: "brand_story", value: { text: "סיפור באתר" }, observationStatus: "observed" };
  for (const q of [snapshot(), generateQuestionnaire(client, "scan", [source])]) {
    assert.equal(q.version, "questionnaire-v2");
    assert.ok(q.items.length <= 50);
    for (const [id, domain] of Object.entries(domains)) {
      const item = q.items.find(i => i.id === id);
      assert.equal(item.action, "ask"); assert.equal(item.required, true);
      assert.equal(item.source, undefined); assert.equal(item.suggestion, undefined);
      assert.equal(questionDomain(item), domain);
      assert.throws(() => validateSelection(q, q.items.filter(i => i.id !== id).map(i => i.id)));
    }
  }
});
test("strategic answers cannot be skipped silently; deliberate unknown/pending answers remain unresolved", () => {
  const q = snapshot(), ids = q.items.map(i => i.id);
  assert.ok(Object.keys(domains).every(id => questionnaireProgress(q, ids, {}).missingRequired.includes(id)));
  const answers = parseAnswers(q, ids, Object.fromEntries(q.items.filter(i => i.required).map(i => [i.id, { state: "kickoff", text: "" }])));
  assert.deepEqual(questionnaireProgress(q, ids, answers).missingRequired, []);
  const doc = characterizationDocument({ snapshot: prepareKickoff({ snapshot: q, selectedIds: ids, answers, status: "submitted" }, { packageCode: null, commercialScope: null }), addedTopics: [], decisions: {} });
  for (const field of doc.flatMap(s => s.fields).filter(f => f.topic.id in domains)) {
    assert.equal(field.state, "unresolved"); assert.equal(field.value, "");
  }
});
test("ranked inputs retain all four categories and eight products with order and Hebrew names", () => {
  const q = snapshot();
  for (const id of ["category_priorities", "product_bestsellers"]) {
    const item = q.items.find(i => i.id === id);
    const values = Array.from({ length: item.ranking.limit }, (_, i) => `${item.ranking.kind === "categories" ? "קטגוריה" : "מוצר"} ${i + 1}`);
    const text = rankedAnswerText(values);
    assert.deepEqual(rankedAnswerValues(text, item.ranking.limit), values);
    assert.equal(rankedAnswerError(text, item.ranking), null);
    assert.equal(parseAnswers(q, q.items.map(i => i.id), { [id]: { state: "answered", text } })[id].text, text);
  }
});
test("in-progress multiword typing does not lose trailing spaces", () => {
  const text = rankedAnswerText(["שולחנות ", ""]);
  assert.equal(rankedAnswerValues(text, 4)[0], "שולחנות ");
  assert.equal(rankedAnswerError(text, categoryRanking), null);
});
test("businesses with fewer categories/products can answer without fabricated entries", () => {
  assert.equal(rankedAnswerError("1. קטגוריה אחת", categoryRanking), null);
  assert.equal(rankedAnswerError("1. מוצר אחד\n2. מוצר שני", { kind: "products", limit: 8 }), null);
});
test("gaps, duplicates, too many entries and oversized names fail both UI and server validation", () => {
  const q = snapshot(), item = q.items.find(i => i.id === "category_priorities"), ids = q.items.map(i => i.id);
  for (const text of ["", "3. ספות", "1. ספות\n3. שולחנות", "1. ספות\n2.  ספות ", "1. Sofa\n2. SOFA", rankedAnswerText(["א", "ב", "ג", "ד", "ה"]), rankedAnswerText(["א".repeat(241)]), "1. ספות\rריהוט"]) {
    assert.ok(rankedAnswerError(text, item.ranking));
    assert.equal(answerIsComplete(item, { state: "answered", text }), false);
    assert.throws(() => parseAnswers(q, ids, { category_priorities: { state: "answered", text } }));
  }
  assert.deepEqual(rankedAnswerValues("1. ספות\n3. שולחנות", 4), ["ספות", "", "שולחנות", ""]);
  assert.equal(firstUnanswered([item], { [item.id]: { state: "answered", text: "2. ספות" } }).id, item.id);
});
test("unknown/kickoff ranking remains a deliberate valid answer without requiring invented rankings", () => {
  const q = snapshot(), item = q.items.find(i => i.id === "product_bestsellers");
  for (const state of ["unknown", "kickoff"]) {
    assert.equal(answerIsComplete(item, { state, text: "" }), true);
    assert.equal(parseAnswers(q, q.items.map(i => i.id), { [item.id]: { state, text: "" } })[item.id].state, state);
  }
});
test("public projection retains ranking controls but does not infer metadata for legacy questions", () => {
  const q = snapshot(), result = publicProjection({ snapshot: q, selectedIds: q.items.map(i => i.id), answers: {}, status: "sent", revision: 0 });
  assert.deepEqual(result.items.find(i => i.id === "category_priorities").ranking, categoryRanking);
  assert.deepEqual(result.items.find(i => i.id === "product_bestsellers").ranking, { kind: "products", limit: 8 });
  const legacy = { version: "questionnaire-v1", items: [{ id: "priorities", section: "priorities", label: "מוצרים לקידום", action: "ask", required: true }] };
  const before = JSON.stringify(legacy);
  assert.equal(publicProjection({ snapshot: legacy, selectedIds: ["priorities"], answers: {}, status: "submitted", revision: 1 }).items[0].ranking, undefined);
  assert.equal(parseAnswers(legacy, ["priorities"], { priorities: { state: "answered", text: "טקסט רגיל" } }).priorities.text, "טקסט רגיל");
  assert.equal(JSON.stringify(legacy), before);
});
test("all strategic client answers reach the correct document chapters verbatim without rewriting evidence", () => {
  const q = snapshot(), before = JSON.stringify(q), ids = q.items.map(i => i.id);
  const input = Object.fromEntries(Object.keys(domains).map(id => [id, { state: "answered", text: q.items.find(i => i.id === id).ranking ? rankedAnswerText(["ראשון", "שני"]) : `תשובת הלקוח עבור ${id}` }]));
  const answers = parseAnswers(q, ids, input);
  const kickoff = prepareKickoff({ snapshot: q, selectedIds: ids, answers, status: "submitted" }, { packageCode: null, commercialScope: null });
  const sections = characterizationDocument({ snapshot: kickoff, addedTopics: [], decisions: {} });
  const chapterFor = { identity: "business", pains: "purchase", desires: "purchase", motivations: "buying", objections: "buying", positioning: "positioning", differentiation: "positioning", products: "products" };
  for (const [id, domain] of Object.entries(domains)) {
    const field = sections.find(s => s.id === chapterFor[domain]).fields.find(f => f.topic.id === id);
    assert.ok(field, id); assert.equal(field.value, input[id].text); assert.equal(field.state, "resolved");
    assert.equal(field.authority, "client_statement"); assert.equal(field.topic.question.source, undefined);
  }
  assert.equal(JSON.stringify(q), before);
});
