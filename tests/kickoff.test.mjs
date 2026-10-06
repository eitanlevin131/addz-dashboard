import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agenda, allTopics, characterization, expectedRevision, parseDecision, parseNewTopic, prepareKickoff, questionDomain } from "../src/lib/kickoff/core.ts";

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
