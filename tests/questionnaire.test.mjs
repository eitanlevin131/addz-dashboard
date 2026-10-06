import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { editableQuestionnaireAnswer, generateQuestionnaire, parseAnswers, preKickoff, publicProjection, questionnaireLinkUrl, questionnaireProgress, validateSelection, safeReferenceUrl } from "../src/lib/questionnaire/core.ts";
import { createQuestionnaireToken, questionnaireTokenHash, isLiveQuestionnaireLink, publicRateBucket, readQuestionnaireBody, validPublicRequestOrigin } from "../src/lib/questionnaire/security.ts";

const client = { name: "תבלינים לבדיקה", website: "https://example.test", commercialScope: null, includedServices: [] };
function finding(overrides = {}) {
  return { authority: "website_observed", scanId: "scan", findingId: "finding", sourceId: "source", url: "https://example.test/shipping", pageType: "shipping", evidence: "משלוח לבית ללא עלות מעל 300 ₪. לנקודת איסוף מעל 150 ₪.", locator: "main", confidence: "high", reviewDisposition: "normal", category: "operations", key: "shipping_text", value: { text: "משלוח לבית ללא עלות מעל 300 ₪. לנקודת איסוף מעל 150 ₪." }, observationStatus: "observed", ...overrides };
}
const snapshot = () => generateQuestionnaire(client, "scan", [finding()]);
const selected = q => q.items.map(i => i.id);
test("editing a saved answer never echoes server-only timestamps into autosave", () => {
  const q = snapshot(); const saved = parseAnswers(q, selected(q), { priorities: { state: "answered", text: "לקדם מארזים" } }).priorities;
  const draft = { ...editableQuestionnaireAnswer(saved), text: "לקדם תבלינים" };
  assert.equal("updatedAt" in draft, false);
  assert.equal(parseAnswers(q, selected(q), { priorities: draft }).priorities.text, "לקדם תבלינים");
});
test("generation preserves material commercial qualifiers and full source authority", () => {
  const q = snapshot(); const fact = q.items[0];
  assert.equal(fact.source.evidence, finding().evidence);
  assert.equal(fact.suggestion, finding().value.text);
  assert.equal(fact.source.value.text, fact.suggestion);
  assert.equal(fact.source.authority, "website_observed");
  assert.equal(q.items.some(i => i.label.includes("מחזור") || i.label.includes("אסטרטגיה")), false);
});
test("inferred audience is a hypothesis and ignored research does not become a fact", () => {
  const q = generateQuestionnaire(client, "scan", [finding({ authority: "website_inferred", category: "audience", key: "likely_audience", observationStatus: "inferred", value: { summary: "ייתכן שקהל של בשלנים ביתיים רלוונטי" } }), finding({ findingId: "ignored", reviewDisposition: "ignored" }), finding({ findingId: "review", reviewDisposition: "needs_review" })]);
  assert.equal(q.items.find(i => i.source?.key === "likely_audience").source.authority, "website_inferred");
  assert.ok(!q.items.some(i => i.source?.findingId === "ignored"));
  assert.equal(q.items.find(i => i.source?.findingId === "review").source.reviewDisposition, "needs_review");
});
test("bounded and deduplicated facts preserve policy slots despite many product rows", () => {
  const products = Array.from({ length: 60 }, (_, i) => finding({ findingId: String(i), category: "products", key: "product", value: { name: "מוצר " + i, price: i, currency: "ILS" } }));
  const q = generateQuestionnaire(client, "scan", [...products, finding()]);
  assert.ok(q.items.some(i => i.source?.key === "shipping_text"));
  assert.ok(q.items.filter(i => i.source).length <= 20);
  assert.equal(generateQuestionnaire(client, "scan", [finding(), finding({ findingId: "duplicate" })]).items.filter(i => i.source).length, 1);
});
test("package-aware questions use stable service codes and scope, never pricing guesses", () => {
  const empty = snapshot(); assert.ok(!empty.items.some(i => i.section === "services"));
  const newsletter = generateQuestionnaire({ ...client, includedServices: [{ code: "newsletter" }] }, null, []);
  assert.ok(newsletter.items.some(i => i.id === "calendar")); assert.ok(!newsletter.items.some(i => i.id === "whatsapp" || i.id === "lifecycle"));
  const whatsapp = generateQuestionnaire({ ...client, includedServices: [{ code: "whatsapp" }] }, null, []);
  assert.ok(whatsapp.items.some(i => i.id === "whatsapp")); assert.ok(!whatsapp.items.some(i => i.id === "calendar"));
  const setup = generateQuestionnaire({ ...client, commercialScope: { automationSetupTier: 6, whatsappAddon: true, automationCodes: ["birthday"] } }, null, []);
  assert.ok(["whatsapp", "lifecycle", "birthday"].every(id => setup.items.some(i => i.id === id)));
});
test("missing scan generates client-only gaps without inventing website facts", () => {
  const q = generateQuestionnaire(client, null, []);
  assert.ok(q.warnings.length); assert.ok(q.items.every(i => i.action === "ask"));
  assert.ok(q.kickoffTopics.length); assert.equal(q.items.some(i => i.id.includes("brain")), false);
});
test("actual Epic 2 inference keys have client-friendly labels and unresolved sources stay flagged", () => {
  const q = generateQuestionnaire(client, "scan", [finding({ category: "audience", key: "audience_likely", authority: "website_inferred", observationStatus: "inferred", value: { summary: "ייתכן שקהל בשלנים רלוונטי" }, reviewDisposition: "needs_review" })]);
  const fact = q.items.find(i => i.source); assert.equal(fact.label, "קהל אפשרי");
  const projection = publicProjection({ snapshot: q, selectedIds: [fact.id], answers: {}, status: "sent", revision: 0 });
  assert.equal(projection.items[0].source.unresolved, true);
  assert.ok(preKickoff(q, q.items.filter(i => !i.source).map(i => i.id), {}).groups.conflicts.some(e => e.question.id === fact.id));
});
test("team selection cannot remove required questions or add foreign ids", () => {
  const q = snapshot(); assert.deepEqual(validateSelection(q, selected(q)), selected(q));
  assert.throws(() => validateSelection(q, []));
  assert.throws(() => validateSelection(q, [...selected(q), "foreign"]));
  assert.throws(() => validateSelection(q, [...selected(q), q.items[0].id]));
});
test("structured corrections remain separate from immutable website evidence", () => {
  const q = snapshot(); const before = JSON.stringify(q);
  const answers = parseAnswers(q, selected(q), { "finding:finding": { state: "corrected", text: "כעת המשלוח לבית ללא עלות מעל 350 ₪", priority: "high" } });
  assert.equal(JSON.stringify(q), before);
  const groups = preKickoff(q, selected(q), answers).groups;
  assert.equal(groups.corrected.length, 1); assert.equal(groups.conflicts.length, 1);
  assert.equal(groups.conflicts[0].question.source.evidence, finding().evidence);
  assert.equal(groups.conflicts[0].answer.priority, "high");
});
test("confirmed/rejected/unknown/kickoff/new answers are independently grouped", () => {
  const q = snapshot(); const id = q.items[0].id;
  for (const [state, group] of [["confirmed", "confirmed"], ["rejected", "conflicts"], ["unknown", "unknown"], ["kickoff", "kickoff"]]) {
    const answers = parseAnswers(q, selected(q), { [id]: { state, text: "" } });
    assert.ok(preKickoff(q, selected(q), answers).groups[group].some(e => e.question.id === id));
  }
  const answers = parseAnswers(q, selected(q), { priorities: { state: "answered", text: "לקדם מארזים" }, red_lines: { state: "unknown", text: "" } });
  assert.equal(questionnaireProgress(q, selected(q), answers).missingRequired.length, 0);
  assert.equal(preKickoff(q, selected(q), answers).groups.new.length, 1);
});
test("answer validation blocks semantic edits, foreign questions and oversized text", () => {
  const q = snapshot();
  for (const answers of [ { foreign: { state: "answered", text: "x" } }, { "finding:finding": { state: "answered", text: "invented" } }, { priorities: { state: "answered", text: "" } }, { priorities: { state: "answered", text: "x".repeat(4001) } }, { priorities: { state: "answered", text: "hello", source: "altered" } }, { priorities: { state: "answered", text: "hello\u0000" } } ]) assert.throws(() => parseAnswers(q, selected(q), answers));
  assert.throws(() => parseAnswers(q, selected(q).filter(id => id !== "changes"), { changes: { state: "answered", text: "x" } }));
});
test("asset links reject script/credential URLs; text remains inert plain data", () => {
  const q = snapshot();
  assert.throws(() => parseAnswers(q, selected(q), { assets: { state: "answered", text: "לוגו", links: ["javascript:alert(1)"] } }));
  assert.equal(safeReferenceUrl("https://user:pass@example.com"), null);
  const answer = parseAnswers(q, selected(q), { assets: { state: "answered", text: "<script>alert(1)</script>", links: ["https://example.com/logo"] } });
  assert.equal(answer.assets.text, "<script>alert(1)</script>");
});
test("validation states and priorities never accept JSON coercion", () => {
  const q = snapshot();
  for (const state of [["answered"], { state: "answered" }, 1, true])
    assert.throws(() => parseAnswers(q, selected(q), { priorities: { state, text: "x" } }));
  for (const priority of [["normal"], { priority: "high" }, 1, false])
    assert.throws(() => parseAnswers(q, selected(q), { priorities: { state: "answered", text: "x", priority } }));
});
test("public projection excludes client IDs, commercial scope, owner, notes and review metadata", () => {
  const q = snapshot(); const projection = publicProjection({ id: "internal", clientId: "private", snapshot: { ...q, commercialScope: "SECRET", owner: "SECRET" }, selectedIds: selected(q), answers: {}, revision: 0, status: "sent", submittedAt: null, tokenHash: "SECRET" });
  const serialized = JSON.stringify(projection);
  for (const key of ["clientId", "tokenHash", "reviewDisposition", "kickoffTopics", "scanId", "findingId", "commercialScope"]) assert.ok(!serialized.includes(`"${key}"`));
  assert.ok(!serialized.includes("SECRET"));
  assert.equal(projection.items[0].source.evidence, finding().evidence);
});
test("token is 256-bit, unguessable, hash-only, and fragment links contain no client ID", () => {
  const tokens = Array.from({ length: 50 }, createQuestionnaireToken);
  assert.equal(new Set(tokens).size, tokens.length); assert.ok(tokens.every(t => t.length === 43));
  const hash = questionnaireTokenHash(tokens[0]); assert.equal(hash.length, 64); assert.notEqual(hash, tokens[0]);
  assert.equal(questionnaireTokenHash("predictable-id"), null);
  const link = new URL(questionnaireLinkUrl("https://app.example/", tokens[0]));
  assert.equal(link.pathname, "/questionnaire"); assert.equal(link.search, ""); assert.equal(link.hash.slice(1), tokens[0]);
});
test("expired/revoked/draft links deny uniformly while submitted stays readable", () => {
  const row = { status: "sent", revokedAt: null, linkExpiresAt: new Date(Date.now() + 10000) };
  assert.equal(isLiveQuestionnaireLink(row), true);
  assert.equal(isLiveQuestionnaireLink({ ...row, status: "draft" }), false);
  assert.equal(isLiveQuestionnaireLink({ ...row, revokedAt: new Date() }), false);
  assert.equal(isLiveQuestionnaireLink({ ...row, linkExpiresAt: new Date(0) }), false);
  assert.equal(isLiveQuestionnaireLink({ ...row, status: "submitted" }), true);
});
test("durable rate-limit keys do not contain raw IP or token and rotate per minute", () => {
  assert.match(publicRateBucket("192.0.2.1", "test", 0), /^[a-f0-9]{64}$/);
  assert.notEqual(publicRateBucket("192.0.2.1", "test", 0), publicRateBucket("192.0.2.1", "test", 60000));
  assert.notEqual(publicRateBucket("192.0.2.1", "test", 0), publicRateBucket("192.0.2.2", "test", 0));
});
test("public API checks origin, streamed byte budget, media type and JSON object", async () => {
  assert.equal(validPublicRequestOrigin(new Request("https://app.test/api", { headers: { origin: "https://attacker.test" } })), false);
  assert.equal(validPublicRequestOrigin(new Request("https://app.test/api", { headers: { origin: "https://app.test" } })), true);
  const req = text => new Request("https://app.test/api", { method: "PATCH", headers: { "content-type": "application/json" }, body: text });
  assert.deepEqual(await readQuestionnaireBody(req('{"revision":0}')), { revision: 0 });
  await assert.rejects(readQuestionnaireBody(req("[]")));
  await assert.rejects(readQuestionnaireBody(req("x".repeat(65537))), /oversized_body/);
  await assert.rejects(readQuestionnaireBody(new Request("https://app.test/api", { method: "PATCH", body: "{}" })), /invalid_body/);
});
test("public surface cannot call team auth, providers or publish approved brand data", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const repo = await read("../src/lib/questionnaire/repository.ts");
  const api = await read("../src/lib/questionnaire/api.ts");
  const ui = await read("../src/components/public-questionnaire.tsx");
  assert.match(api, /clientApi\(/); assert.match(api, /no-store/);
  assert.match(repo, /for update/); assert.match(repo, /revision=\$\{expected\}/);
  assert.match(repo, /questionnaire\.completed/); assert.match(repo, /isLiveQuestionnaireLink/);
  assert.ok(!/dangerouslySetInnerHTML|localStorage|sessionStorage/.test(ui));
  assert.ok(!/update\(websiteFindings\)|update\(clients\)|fetch\(|Resend|OpenAI|BrandBrain/.test(repo));
});
