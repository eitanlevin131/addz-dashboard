import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agenda, allTopics, characterization, expectedRevision, parseDecision, parseNewTopic, prepareKickoff, questionDomain } from "../src/lib/kickoff/core.ts";
import { characterizationDocument, DOCUMENT_SECTIONS } from "../src/lib/kickoff/document.ts";

const client = { packageCode: "email_5", commercialScope: { campaignLimit: 5, automationSetupTier: 3 } };
function questionnaire() {
  const source = { authority: "website_observed", scanId: "scan", findingId: "shipping", sourceId: "source", url: "https://example.test/shipping", pageType: "shipping", evidence: "משלוח לנקודת איסוף חינם מעל 150 ₪; לבית מעל 300 ₪", locator: "main", confidence: "high", reviewDisposition: "normal", category: "operations", key: "shipping_text", value: { text: "original" } };
  const items = [
    { id: "shipping", section: "known", label: "משלוחים", action: "confirm", required: false, suggestion: source.evidence, source },
    { id: "returns", section: "known", label: "ביטולים", action: "confirm", required: false, suggestion: "14 יום", source: { ...source, key: "returns_text", findingId: "returns" } },
    { id: "audience", section: "audience", label: "קהל אפשרי", action: "confirm", required: false, suggestion: "ייתכן שבשלנים", source: { ...source, key: "audience_likely", authority: "website_inferred" } },
    { id: "review", section: "brand", label: "השערה לבירור", action: "confirm", required: false, suggestion: "השערה", source: { ...source, reviewDisposition: "needs_review" } },
    { id: "priorities", section: "priorities", label: "מוצרים לקידום", action: "ask", required: true },
    { id: "red_lines", section: "rules", label: "גבולות שפה", action: "ask", required: true },
    { id: "calendar", section: "services", label: "תכנון דיוורים", action: "ask", required: false },
  ];
  const answer = (state, text = "") => ({ state, text, priority: "normal", links: [], updatedAt: "2026-10-06T12:00:00Z" });
  return { id: "questionnaire", clientId: "client", revision: 7, status: "submitted", snapshot: { version: "questionnaire-v1", clientName: "תבלינים", website: "https://example.test", scanId: "scan", items, kickoffTopics: ["מה המיצוב?"], services: ["newsletter"], warnings: [] }, selectedIds: items.filter(i => i.id !== "review").map(i => i.id), answers: { shipping: answer("confirmed"), returns: answer("corrected", "21 יום לפי תנאים"), priorities: answer("answered", "לקדם מארזים"), red_lines: answer("answered", "ללא הבטחות רפואיות") }, linkExpiresAt: null, revokedAt: null, submittedAt: "2026-10-06T12:00:00Z" };
}
function prepared() { return { snapshot: prepareKickoff(questionnaire(), client), addedTopics: [], decisions: {} }; }
test("preparation requires submitted questionnaire, not a draft or unsubmitted client answer", () => {
  for (const status of ["draft", "ready", "sent", "in_progress"]) assert.throws(() => prepareKickoff({ ...questionnaire(), status }, client), e => e.status === 409);
  assert.ok(prepareKickoff({ ...questionnaire(), status: "reviewed" }, client));
});
test("confirmed operational facts flow automatically without repeating them in the agenda", () => {
  const record = prepared(), summary = characterization(record);
  assert.ok(!agenda(record).some(t => t.id === "shipping"));
  assert.equal(summary.resolved.find(e => e.topic.id === "shipping").value, questionnaire().snapshot.items[0].source.evidence);
  assert.equal(summary.resolved.find(e => e.topic.id === "shipping").authority, "client_confirmed");
  assert.equal(summary.resolved.find(e => e.topic.id === "priorities").value, "לקדם מארזים");
  assert.equal(summary.approvedBrandBrain, false);
});
test("client correction, original inference and unselected needs-review stay unresolved and prominent", () => {
  const record = prepared(), topics = agenda(record);
  assert.ok(topics.findIndex(t => t.id === "returns") < topics.findIndex(t => t.id === "audience"));
  assert.equal(topics.find(t => t.id === "review").group, "conflict");
  assert.ok(characterization(record).unresolved.some(t => t.id === "audience"));
  assert.ok(!characterization(record).resolved.some(e => e.topic.id === "returns"));
});
test("confirmation of a hypothesis remains a separate client statement, never rewrites inference", () => {
  const q = questionnaire(); q.answers.audience = { ...q.answers.shipping, state: "confirmed" };
  const snapshot = prepareKickoff(q, client), topic = snapshot.topics.find(t => t.id === "audience");
  assert.equal(topic.question.source.authority, "website_inferred");
  assert.equal(topic.knownAuthority, "client_confirmed");
});
test("decision supersedes current value but retains every original authority and condition", () => {
  const record = prepared(), before = JSON.stringify(record.snapshot);
  const parsed = parseDecision({ topicId: "returns", outcome: "corrected", value: "החזרה תוך 21 יום ללא פתיחת המוצר", note: "הלקוח אישר בפגישה" }, allTopics(record), "staff");
  record.decisions[parsed.topicId] = parsed.decision;
  const entry = characterization(record).resolved.find(e => e.topic.id === "returns");
  assert.equal(entry.authority, "kickoff_decision"); assert.equal(entry.topic.question.suggestion, "14 יום");
  assert.equal(entry.topic.answer.text, "21 יום לפי תנאים");
  assert.equal(JSON.stringify(record.snapshot), before);
});
test("snapshot is a deep copy including answers and commercial scope", () => {
  const q = questionnaire(), snapshot = prepareKickoff(q, client);
  q.snapshot.items[0].source.evidence = "changed"; q.answers.returns.text = "changed";
  assert.notEqual(snapshot.topics[0].question.source.evidence, "changed");
  assert.notEqual(snapshot.topics.find(t => t.id === "returns").answer.text, "changed");
  assert.equal(snapshot.questionnaireRevision, 7); assert.equal(snapshot.scope.campaignLimit, 5);
});
test("unresolved/follow-up suppress prior resolved value and separate partial information", () => {
  for (const outcome of ["unresolved", "follow_up"]) {
    const record = prepared();
    record.decisions.shipping = parseDecision({ topicId: "shipping", outcome, value: "מידע חלקי", note: "לקבל אישור לסף" }, allTopics(record), "staff").decision;
    const summary = characterization(record);
    assert.ok(!summary.resolved.some(e => e.topic.id === "shipping"));
    assert.equal(outcome === "unresolved" ? summary.unresolved.some(t => t.id === "shipping") : summary.followUps.some(e => e.topic.id === "shipping"), true);
  }
});
test("kickoff-only information has distinct provenance and never masquerades as website evidence", () => {
  const record = prepared(), topic = parseNewTopic({ label: "מניע לרכישה", domain: "motivations" }, "kickoff:unique");
  record.addedTopics.push(topic);
  record.decisions[topic.id] = parseDecision({ topicId: topic.id, outcome: "new_information", value: "מתנה למארחים" }, allTopics(record), "staff").decision;
  const entry = characterization(record).resolved.find(e => e.topic.id === topic.id);
  assert.equal(entry.topic.origin, "kickoff"); assert.equal(entry.topic.question, undefined);
  assert.equal(entry.topic.domain, "motivations");
});
test("high priority known information can be discussed without losing its automatic value", () => {
  const q = questionnaire(); q.answers.shipping.priority = "high";
  const record = { snapshot: prepareKickoff(q, client), addedTopics: [], decisions: {} };
  assert.ok(agenda(record).some(t => t.id === "shipping"));
  assert.ok(characterization(record).resolved.some(e => e.topic.id === "shipping"));
});
test("empty domains do not invent answers and generic reality input does not get relabelled as pain", () => {
  const record = prepared();
  assert.ok(!characterization(record).domains.some(d => d.id === "desires"));
  assert.equal(questionDomain({ id: "customer_reality", section: "reality" }), "customer_context");
  assert.equal(questionDomain({ id: "benefit", section: "known", source: { key: "benefits" } }), "products");
  assert.equal(questionDomain({ id: "brand_correction", section: "brand" }), "identity");
  assert.equal(record.snapshot.topics.find(t => t.id === "agenda:0").domain, "cross_domain");
});
test("bounded shape validation rejects coercion, unknown ids/domains, control characters and source injection", () => {
  const topics = allTopics(prepared());
  for (const body of [ { topicId: "other", outcome: "confirmed" }, { topicId: "shipping", outcome: ["confirmed"] }, { topicId: "shipping", outcome: "verified" }, { topicId: "shipping", outcome: "decision", value: "" }, { topicId: "shipping", outcome: "follow_up", note: "" }, { topicId: "shipping", outcome: "decision", value: "x".repeat(4001) }, { topicId: "shipping", outcome: "decision", value: "a\u0000" }, { topicId: "shipping", outcome: "decision", value: "a", source: "fake" } ]) assert.throws(() => parseDecision(body, topics, "staff"));
  for (const body of [{ label: "", domain: "voice" }, { label: "x", domain: "brain" }, { label: "x", domain: ["voice"] }, { label: "x", domain: "voice", origin: "website" }]) assert.throws(() => parseNewTopic(body, "id"));
  for (const value of [-1, "0", 0.5, null, Infinity]) assert.throws(() => expectedRevision(value));
  assert.equal(expectedRevision(0), 0);
});
test("all six outcomes supported; plain HTML is inert text, not markup", () => {
  const topics = allTopics(prepared());
  for (const outcome of ["confirmed", "corrected", "new_information", "decision", "unresolved", "follow_up"]) {
    assert.equal(parseDecision({ topicId: "shipping", outcome, value: "<script>1</script>", note: "טיפול" }, topics, "staff").decision.outcome, outcome);
  }
});
test("routes stay team-only with bounded bodies, CAS atomic audit and no provider/source writes", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const route = await read("../src/app/api/clients/[id]/kickoff/route.ts"), repo = await read("../src/lib/kickoff/repository.ts"), ui = await read("../src/components/client-kickoff.tsx");
  assert.match(route, /clientApi\(/); assert.match(route, /sameOriginMutation/); assert.match(route, /questionnaireBody/); assert.match(route, /no-store/);
  assert.match(repo, /for update/); assert.match(repo, /row\.revision !== revision/); assert.match(repo, /db\.batch/); assert.match(repo, /previous: row\.decisions/);
  assert.ok(!/update\(website|update\(clientQuestionnaires|fetch\(|OpenAI|Resend/.test(repo));
  assert.ok(!/dangerouslySetInnerHTML/.test(ui));
});
test("document covers every domain once, with ordered chapters and no invented empty content", () => {
  const record = prepared(), sections = characterizationDocument(record);
  const domains = DOCUMENT_SECTIONS.flatMap(section => section.domains);
  assert.equal(new Set(domains).size, domains.length);
  assert.equal(domains.length, 16);
  assert.equal(sections.flatMap(section => section.fields).length, allTopics(record).length);
  assert.equal(sections.find(section => section.id === "positioning").fields.length, 0);
  assert.equal(sections[0].title, "רקע על העסק וסיפור המותג");
});
test("document uses field labels rather than policy confirmation questions and preserves source wording", () => {
  const record = prepared(), fields = characterizationDocument(record).flatMap(section => section.fields);
  const shipping = fields.find(field => field.topic.id === "shipping");
  assert.equal(shipping.label, "משלוחים ואספקה");
  assert.equal(shipping.value, questionnaire().snapshot.items[0].source.evidence);
  assert.equal(shipping.authority, "client_confirmed");
});
test("document client correction and website hypotheses remain proposals, not resolved truth", () => {
  const fields = characterizationDocument(prepared()).flatMap(section => section.fields);
  const returns = fields.find(field => field.topic.id === "returns"), audience = fields.find(field => field.topic.id === "audience");
  assert.equal(returns.value, ""); assert.equal(returns.state, "unresolved");
  assert.equal(returns.draft, "21 יום לפי תנאים"); assert.equal(returns.draftAuthority, "client_answer");
  assert.equal(audience.value, ""); assert.equal(audience.draft, "ייתכן שבשלנים");
  assert.equal(audience.draftAuthority, "website_proposal");
});
test("document edits use meeting authority and do not rewrite questionnaire, website or snapshot", () => {
  const record = prepared(), before = JSON.stringify(record.snapshot);
  record.decisions.shipping = parseDecision({ topicId: "shipping", outcome: "corrected", value: "משלוח לנקודה חינם מעל 200 ₪", note: "תוקן בשיחה" }, allTopics(record), "staff").decision;
  const field = characterizationDocument(record).flatMap(section => section.fields).find(field => field.topic.id === "shipping");
  assert.equal(field.value, "משלוח לנקודה חינם מעל 200 ₪"); assert.equal(field.authority, "kickoff_decision");
  assert.equal(JSON.stringify(record.snapshot), before);
});
test("document follow-ups and unresolved drafts never surface as resolved document values", () => {
  for (const outcome of ["unresolved", "follow_up"]) {
    const record = prepared();
    record.decisions.shipping = parseDecision({ topicId: "shipping", outcome, value: "תנאי חלקי", note: "לבירור" }, allTopics(record), "staff").decision;
    const field = characterizationDocument(record).flatMap(section => section.fields).find(field => field.topic.id === "shipping");
    assert.equal(field.value, ""); assert.equal(field.draft, "תנאי חלקי");
    assert.equal(field.draftAuthority, "meeting_draft"); assert.equal(field.state, outcome);
  }
});
test("new document sections use the existing meeting topic model and no fake evidence", () => {
  const record = prepared(), topic = parseNewTopic({ label: "יעדי הקמפיין", domain: "services" }, "kickoff:new");
  record.addedTopics.push(topic);
  const field = characterizationDocument(record).find(section => section.id === "commercial").fields.find(field => field.topic.id === topic.id);
  assert.equal(field.state, "unresolved"); assert.equal(field.topic.origin, "kickoff");
  assert.equal(field.topic.question, undefined); assert.equal(field.value, "");
});
test("older catalog and voice assignments render in their proper document chapters without rewriting snapshots", () => {
  const record = prepared(), catalog = { id: "catalog", label: "מגוון", domain: "identity", question: { source: { key: "catalog_listing" } } }, voice = { id: "brand_correction", label: "שפה", domain: "identity" };
  record.snapshot.topics.push(catalog, voice);
  const before = JSON.stringify(record.snapshot), sections = characterizationDocument(record);
  assert.ok(sections.find(section => section.id === "products").fields.some(field => field.topic.id === "catalog"));
  assert.ok(sections.find(section => section.id === "language").fields.some(field => field.topic.id === "brand_correction"));
  assert.equal(JSON.stringify(record.snapshot), before);
});
