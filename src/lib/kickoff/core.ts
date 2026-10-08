import type { QuestionItem, QuestionnaireAnswer, QuestionnaireRecord } from "../questionnaire/core";
import { preKickoff } from "../questionnaire/core.ts";
import type { PackageScope } from "../client-packages";

export const KICKOFF_VERSION = "kickoff-v1";
export const CHARACTERIZATION_DOMAINS = [
  { id: "identity", label: "העסק והמותג" },
  { id: "products", label: "מוצרים ושירותים בעדיפות" },
  { id: "audience", label: "קהל בעדיפות" },
  { id: "customer_context", label: "צרכים וסיבות לרכישה" },
  { id: "pains", label: "כאבים וצרכים" },
  { id: "desires", label: "רצונות ותוצאות" },
  { id: "objections", label: "התנגדויות" },
  { id: "motivations", label: "מניעים לרכישה" },
  { id: "positioning", label: "מיצוב" },
  { id: "differentiation", label: "בידול" },
  { id: "voice", label: "שפת המותג" },
  { id: "rules", label: "ניסוחים וטענות מותרים / אסורים" },
  { id: "commercial", label: "מסחר ומחזור חיי לקוח" },
  { id: "services", label: "החלטות לפי שירות" },
  { id: "operations", label: "תפעול, שירות וחומרים" },
  { id: "cross_domain", label: "החלטות רוחב וסדרי עדיפויות" },
] as const;
export type Domain = typeof CHARACTERIZATION_DOMAINS[number]["id"];
export const KICKOFF_OUTCOMES = {
  confirmed: "אושר בפגישה", corrected: "תוקן בפגישה", new_information: "מידע חדש",
  decision: "התקבלה החלטה", unresolved: "עדיין לא פתור", follow_up: "נדרש המשך טיפול",
} as const;
export type Outcome = keyof typeof KICKOFF_OUTCOMES;
export const AGENDA_GROUPS = {
  conflict: "פערים להכרעה", unknown: "מידע חסר", strategy: "דיון אסטרטגי",
  service: "מסחר ושירותים", follow_up: "המשך טיפול",
} as const;
export type AgendaGroup = keyof typeof AGENDA_GROUPS;
export type Topic = {
  id: string; label: string; domain: Domain; group: AgendaGroup;
  origin: "questionnaire" | "kickoff"; question?: QuestionItem;
  answer?: QuestionnaireAnswer; knownValue?: string; knownAuthority?: "client_confirmed" | "client_statement";
  priority: "normal" | "high";
};
export type KickoffSnapshot = {
  version: string; clientName: string; questionnaireId: string; questionnaireRevision: number;
  questionnaireStatus: string; capturedAt: string; packageCode: string | null;
  scope: PackageScope | null; services: string[]; warnings: string[]; topics: Topic[];
};
export type Decision = {
  outcome: Outcome; value: string; note: string; actorId: string | null; updatedAt: string;
};
export type Decisions = Record<string, Decision>;
export type KickoffRecord = {
  id: string; clientId: string; snapshot: KickoffSnapshot; addedTopics: Topic[];
  decisions: Decisions; revision: number; status: "in_progress" | "completed";
  completedAt: string | null; updatedAt: string; createdAt: string;
};
export class KickoffError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function questionDomain(question: QuestionItem): Domain {
  const key = question.source?.key || question.id;
  const clientDomains: Record<string, Domain> = { brand_story: "identity", brand_positioning: "positioning", brand_promise: "positioning", brand_differentiators: "differentiation", customer_pains: "pains", customer_needs: "pains", customer_desires: "desires", purchase_motivations: "motivations", purchase_objections: "objections", category_priorities: "products", product_bestsellers: "products" };
  if (!question.source && clientDomains[key]) return clientDomains[key];
  if (/shipping|returns|support|contact|faq|operations|assets|access/.test(key)) return "operations";
  if (/pain|stated_problem/.test(key)) return "pains";
  if (/desire|outcome/.test(key)) return "desires";
  if (/objection/.test(key)) return "objections";
  if (/motivation/.test(key)) return "motivations";
  if (/positioning/.test(key)) return "positioning";
  if (/differentiat/.test(key)) return "differentiation";
  if (/benefit|use_case/.test(key)) return "products";
  if (/tone|vocabulary|cta|voice/.test(key)) return "voice";
  if (/red_lines|approved_claim|claims_language/.test(key) || question.section === "rules") return "rules";
  if (/discount|vip|lifecycle|birthday/.test(key)) return "commercial";
  if (question.section === "services") return "services";
  if (question.section === "audience") return "audience";
  if (question.section === "priorities" || /product|categories/.test(key)) return "products";
  if (question.section === "reality") return "customer_context";
  if (question.section === "brand") return "identity";
  return "identity";
}
export function prepareKickoff(q: QuestionnaireRecord, client: { packageCode: string | null; commercialScope: PackageScope | null }, capturedAt = new Date().toISOString()): KickoffSnapshot {
  if (!["submitted", "reviewed"].includes(q.status)) throw new KickoffError("יש להשלים את השאלון לפני הכנת פגישת האפיון.", 409);
  const preparation = preKickoff(q.snapshot, q.selectedIds, q.answers);
  const conflicts = new Set(preparation.groups.conflicts.map(entry => entry.question.id));
  const topics: Topic[] = q.snapshot.items.filter(item => q.selectedIds.includes(item.id) || item.source?.reviewDisposition === "needs_review").map(question => {
    const answer = q.answers[question.id];
    const conflict = conflicts.has(question.id);
    const known = !conflict && answer && ["confirmed", "answered"].includes(answer.state);
    const knownValue = known ? (answer.text || (answer.state === "confirmed" ? question.suggestion : "")) : undefined;
    const domain = questionDomain(question);
    const group: AgendaGroup = conflict ? "conflict" : ["services", "commercial"].includes(domain) ? "service" : ["website_inferred", "website_hypothesis"].includes(question.source?.authority || "") || answer?.state === "kickoff" ? "strategy" : "unknown";
    return { id: question.id, label: question.label, domain, group, origin: "questionnaire", question: structuredClone(question),
      ...(answer ? { answer: structuredClone(answer) } : {}), ...(knownValue ? { knownValue, knownAuthority: answer!.state === "confirmed" ? "client_confirmed" : "client_statement" } : {}), priority: answer?.priority || "normal" };
  });
  for (const [i, label] of q.snapshot.kickoffTopics.entries()) topics.push({ id: `agenda:${i}`, label, domain: "cross_domain", group: "strategy", origin: "questionnaire", priority: "normal" });
  return { version: KICKOFF_VERSION, clientName: q.snapshot.clientName, questionnaireId: q.id, questionnaireRevision: q.revision, questionnaireStatus: q.status,
    capturedAt, packageCode: client.packageCode, scope: structuredClone(client.commercialScope), services: [...q.snapshot.services], warnings: [...q.snapshot.warnings], topics };
}
export function allTopics(record: Pick<KickoffRecord, "snapshot" | "addedTopics">) { return [...record.snapshot.topics, ...record.addedTopics]; }
export function agenda(record: Pick<KickoffRecord, "snapshot" | "addedTopics" | "decisions">) {
  return allTopics(record).filter(topic => !topic.knownValue || topic.priority === "high" || record.decisions[topic.id]).sort((a, b) => {
    const rank = (t: Topic) => t.group === "conflict" ? 0 : t.priority === "high" ? 1 : t.group === "unknown" ? 2 : 3;
    return rank(a) - rank(b);
  });
}
function text(value: unknown, limit: number, required = false): string {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) throw new KickoffError("יש להזין טקסט תקין באורך המותר.");
  return value.trim();
}
export function expectedRevision(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new KickoffError("גרסת האפיון אינה תקינה.");
  return value;
}
export function parseDecision(body: Record<string, unknown>, topics: Topic[], actorId: string | null, updatedAt = new Date().toISOString()): { topicId: string; decision: Decision } {
  if (Object.keys(body).some(key => !["action", "revision", "topicId", "outcome", "value", "note"].includes(key))) throw new KickoffError("שדות ההחלטה אינם תקינים.");
  const topic = topics.find(t => t.id === body.topicId);
  if (!topic || typeof body.outcome !== "string" || !Object.hasOwn(KICKOFF_OUTCOMES, body.outcome)) throw new KickoffError("הנושא או התוצאה אינם תקינים.");
  const outcome = body.outcome as Outcome;
  let value = text(body.value ?? "", 4000);
  const note = text(body.note ?? "", 1000);
  if (outcome === "confirmed" && !value) value = topic.knownValue || (topic.answer?.state === "corrected" ? topic.answer.text : "") || topic.question?.suggestion || "";
  if (!["unresolved", "follow_up"].includes(outcome) && !value) throw new KickoffError("יש לתעד את המידע או ההחלטה שאושרו.");
  if (outcome === "follow_up" && !note) throw new KickoffError("יש לציין מה נדרש להמשך הטיפול.");
  return { topicId: topic.id, decision: { outcome, value, note, actorId, updatedAt } };
}
export function parseNewTopic(body: Record<string, unknown>, id: string): Topic {
  if (Object.keys(body).some(key => !["action", "revision", "label", "domain"].includes(key))) throw new KickoffError("שדות הנושא אינם תקינים.");
  if (typeof body.domain !== "string" || !CHARACTERIZATION_DOMAINS.some(d => d.id === body.domain)) throw new KickoffError("תחום האפיון אינו תקין.");
  return { id, label: text(body.label, 240, true), domain: body.domain as Domain, group: "strategy", origin: "kickoff", priority: "normal" };
}
export function characterization(record: Pick<KickoffRecord, "snapshot" | "addedTopics" | "decisions">) {
  const resolved: { topic: Topic; value: string; authority: "kickoff_decision" | "client_confirmed" | "client_statement"; decision?: Decision }[] = [];
  const unresolved: Topic[] = [], followUps: { topic: Topic; decision: Decision }[] = [];
  for (const topic of allTopics(record)) {
    const decision = record.decisions[topic.id];
    if (decision?.outcome === "follow_up") followUps.push({ topic, decision });
    else if (decision?.outcome === "unresolved") unresolved.push(topic);
    else if (decision) resolved.push({ topic, value: decision.value, authority: "kickoff_decision", decision });
    else if (topic.knownValue && topic.knownAuthority) resolved.push({ topic, value: topic.knownValue, authority: topic.knownAuthority });
    else unresolved.push(topic);
  }
  return { authority: "internal_characterization" as const, approvedBrandBrain: false as const,
    domains: CHARACTERIZATION_DOMAINS.map(domain => ({ ...domain, entries: resolved.filter(entry => entry.topic.domain === domain.id) })).filter(domain => domain.entries.length),
    resolved, unresolved, followUps };
}
