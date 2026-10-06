import type { IncludedService, PackageScope } from "../client-packages";

export const QUESTIONNAIRE_VERSION = "questionnaire-v1";
export const QUESTIONNAIRE_SECTIONS = [
  { id: "known", label: "מה שכבר למדנו" },
  { id: "priorities", label: "מה חשוב עכשיו" },
  { id: "audience", label: "הלקוחות שלכם" },
  { id: "reality", label: "צרכים וסיבות לרכישה" },
  { id: "brand", label: "המותג והשפה" },
  { id: "rules", label: "גבולות וכללים" },
  { id: "services", label: "דיוור וקשר עם לקוחות" },
  { id: "assets", label: "חומרים וגישה" },
] as const;
export type SectionId = typeof QUESTIONNAIRE_SECTIONS[number]["id"];
export type ValidationState = "confirmed" | "partial" | "corrected" | "rejected" | "answered" | "unknown" | "kickoff";
export const ANSWER_LABELS: Record<ValidationState, string> = {
  confirmed: "נכון", partial: "נכון חלקית", corrected: "צריך תיקון", rejected: "לא מתאים",
  answered: "נענה", unknown: "עדיין לא ידוע", kickoff: "נדבר בפגישה",
};
export const QUESTIONNAIRE_STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", ready: "מוכן לשיתוף", sent: "קישור נוצר", in_progress: "במילוי", submitted: "נשלח", reviewed: "נבדק",
};
export type QuestionSource = {
  authority: "website_observed" | "website_inferred";
  scanId: string; findingId: string; sourceId: string; url: string; pageType: string;
  evidence: string; locator: string | null; confidence: string; reviewDisposition: string;
  category: string; key: string; value: unknown;
};
export type QuestionItem = {
  id: string; section: SectionId; label: string; action: "ask" | "confirm";
  required: boolean; suggestion?: string; source?: QuestionSource; links?: boolean;
};
export type QuestionnaireSnapshot = {
  version: string; clientName: string; website: string | null; scanId: string | null;
  items: QuestionItem[]; kickoffTopics: string[]; services: string[]; warnings: string[];
};
export type QuestionnaireAnswer = {
  state: ValidationState; text: string; priority: "normal" | "high";
  links: string[]; updatedAt: string;
};
export type QuestionnaireAnswers = Record<string, QuestionnaireAnswer>;
export function editableQuestionnaireAnswer(answer?: Omit<QuestionnaireAnswer, "updatedAt"> | QuestionnaireAnswer): Omit<QuestionnaireAnswer, "updatedAt"> {
  return { state: answer?.state || "unknown", text: answer?.text || "", priority: answer?.priority || "normal", links: answer?.links || [] };
}
export type QuestionnaireRecord = {
  id: string; clientId: string; snapshot: QuestionnaireSnapshot; selectedIds: string[];
  answers: QuestionnaireAnswers; revision: number; status: string;
  linkExpiresAt: string | null; revokedAt: string | null; submittedAt: string | null;
};
export type FindingSeed = QuestionSource & { observationStatus: string };
export class QuestionnaireError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function questionnaireLinkUrl(origin: string, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new QuestionnaireError("הקישור אינו תקין.");
  return `${new URL(origin).origin}/questionnaire#${token}`;
}
export function safeReferenceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && value.length <= 2048 ? url.href : null;
  } catch { return null; }
}
function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const row = value as Record<string, unknown>;
  if (typeof row.summary === "string") return row.summary;
  if (typeof row.text === "string") return row.text;
  if (typeof row.name === "string") {
    return [row.name, row.price != null ? `${row.price} ${row.currency || ""}` : "", typeof row.description === "string" ? row.description : ""].filter(Boolean).join(" · ");
  }
  return "";
}
const KEY_LABELS: Record<string, string> = {
  product: "מוצר ומחיר", categories: "קבוצת מוצרים", brand_name: "שם המותג", description: "תיאור העסק",
  shipping_text: "משלוחים", returns_text: "החזרות וביטולים", contact_email: "כתובת שירות", contact_text: "שירות לקוחות", faq_text: "שאלות נפוצות",
  explicit_audience: "קהל שמופיע באתר", likely_audience: "קהל אפשרי", audiences: "קהל אפשרי", audience: "קהל אפשרי",
  pain_points: "צורך אפשרי", desires: "תוצאה רצויה אפשרית", tone: "השערה על שפת המותג", positioning: "השערה על המיצוב",
  differentiators: "סיבה לבחור במותג", benefits: "יתרון מוצר", use_cases: "מצב שימוש אפשרי",
  brand_description: "תיאור העסק", brand_story: "סיפור המותג", values: "השערה על ערכי המותג",
  audience_explicit: "קהל שמופיע באתר", audience_likely: "קהל אפשרי", stated_problems: "בעיה שמוזכרת באתר",
  pain_points_likely: "צורך אפשרי", desired_outcomes: "תוצאה רצויה אפשרית",
  vocabulary: "מילים חוזרות", cta_patterns: "אופן הפנייה ללקוחות", claims_language: "טענות המותג",
  shipping: "משלוחים", returns: "החזרות וביטולים", support: "שירות לקוחות",
};
function findingSection(finding: FindingSeed): SectionId {
  if (finding.category === "audience") return "audience";
  if (finding.category === "problems") return "reality";
  if (["voice", "differentiation"].includes(finding.category) || finding.key === "positioning") return "brand";
  return "known";
}
export function generateQuestionnaire(client: {
  name: string; website: string | null; includedServices: IncludedService[];
  commercialScope: PackageScope | null;
}, scanId: string | null, findings: FindingSeed[]): QuestionnaireSnapshot {
  const items: QuestionItem[] = [];
  const candidates = findings.filter(f => f.reviewDisposition !== "ignored" && f.key !== "page_title" && safeReferenceUrl(f.url));
  const groups = new Map<SectionId, FindingSeed[]>();
  for (const finding of candidates) {
    const group = findingSection(finding);
    groups.set(group, [...(groups.get(group) || []), finding]);
  }
  const known = groups.get("known") || [];
  const knownKeys = ["shipping_text", "returns_text", "contact_email", "contact_text", "product", "categories", "brand_name", "description", "faq_text"];
  const knownQueues = new Map<string, FindingSeed[]>();
  for (const finding of known) knownQueues.set(finding.key, [...(knownQueues.get(finding.key) || []), finding]);
  const keys = [...knownKeys.filter(key => knownQueues.has(key)), ...[...knownQueues.keys()].filter(key => !knownKeys.includes(key))];
  const balanced: FindingSeed[] = [];
  for (let i = 0; i < known.length; i++) for (const key of keys) {
    const finding = knownQueues.get(key)?.[i]; if (finding) balanced.push(finding);
  }
  groups.set("known", balanced);
  const seen = new Set<string>();
  // Round-robin domains prevents product catalog rows from crowding out policies/hypotheses.
  for (let round = 0; round < 8 && items.length < 20; round++) {
    for (const section of ["known", "audience", "reality", "brand"] as const) {
      if (items.length >= 20) break;
      const group = groups.get(section) || [];
      const finding = group[round];
      if (!finding) continue;
      const suggestion = displayValue(finding.value).trim();
      if (!suggestion || suggestion.length > 4500 || finding.evidence.length > 12000) continue;
      const identity = `${finding.key}:${suggestion.replace(/\s+/g, " ")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const { observationStatus: _status, ...source } = finding;
      void _status;
      items.push({ id: `finding:${finding.findingId}`, section, label: KEY_LABELS[finding.key] || ({ brand: "תיאור המותג", products: "מוצרים", commercial: "כלל מסחרי", operations: "תפעול ושירות" }[finding.category] ?? "מידע מהאתר"),
        action: "confirm", required: false, suggestion, source });
    }
  }
  const ask = (id: string, section: SectionId, label: string, required = false, links = false) => items.push({ id, section, label, action: "ask", required, ...(links ? { links: true } : {}) });
  ask("priorities", "priorities", "אילו מוצרים ומהלכים הכי חשוב לכם לקדם עכשיו?", true);
  ask("changes", "priorities", "מה עומד להשתנות בחודשים הקרובים שכדאי לנו לדעת?");
  ask("audience_priority", "audience", "מי הלקוחות החשובים ביותר כרגע? האם חסר קהל ברשימה?");
  ask("customer_reality", "reality", "מה לקוחות שואלים או חוששים ממנו לפני קנייה? מה חסר בהבנה שלנו?");
  ask("brand_correction", "brand", "מה חשוב לשמר בשפת המותג, ומה לא מרגיש כמוכם?");
  ask("red_lines", "rules", "אילו ניסוחים, הבטחות או טענות אסור לנו להשתמש בהם? אפשר לציין שאין מגבלות נוספות.", true);
  ask("approved_claims", "rules", "האם יש ניסוחים מאושרים, מגבלות משפטיות או שמות שחייבים לדייק?");
  if (!["shipping_text", "returns_text"].every(key => items.some(item => item.source?.key === key)) || !items.some(item => ["contact_text", "contact_email"].includes(item.source?.key || "")))
    ask("operations_gaps", "rules", "האם יש מידע תפעולי חשוב שלא ראינו באתר או שהשתנה — משלוחים, החזרות או שירות לקוחות?");
  const services = new Set(client.includedServices.map(s => s.code));
  if (client.commercialScope?.automationSetupTier) services.add("automations");
  if (client.commercialScope?.whatsappAddon) services.add("whatsapp");
  if (["newsletter", "sms", "automations", "whatsapp"].some(s => services.has(s as IncludedService["code"]))) {
    ask("discount_rules", "services", "מה מדיניות ההנחות והקופונים? האם יש מוצרים או לקוחות שצריך להחריג?");
    ask("vip", "services", "האם יש מועדון לקוחות או VIP, ואיך מזהים אותם?");
  }
  if (services.has("automations")) {
    ask("lifecycle", "services", "מתי לקוחות חוזרים לקנות? אילו אוטומציות כבר פועלות ומה חשוב לשמר?");
    if (client.commercialScope?.automationCodes.includes("birthday")) ask("birthday", "services", "האם נאספים תאריכי לידה ומה מותר להציע ביום ההולדת?");
  }
  if (services.has("whatsapp")) ask("whatsapp", "services", "מי מטפל בפניות WhatsApp, באילו שעות, ומה מצב הסכמות הלקוחות?");
  if (services.has("newsletter") || services.has("sms")) ask("calendar", "services", "אילו תאריכים והשקות כבר נקבעו ומה תדירות הקשר שמתאימה לכם?");
  ask("assets", "assets", "היכן נמצאים לוגו, תמונות, הנחיות מותג וחומרים קיימים?", false, true);
  ask("access", "assets", "מה מצב הגישה למערכות הרלוונטיות ומי יכול להסדיר אותה? אין להזין סיסמאות או מפתחות.");
  return { version: QUESTIONNAIRE_VERSION, clientName: client.name, website: client.website, scanId, items,
    services: [...services], warnings: [...(!scanId ? ["לא נמצאה סריקה שהושלמה לאתר הנוכחי; השאלון מתבסס על מידע קיים והשלמות."] : []), ...(!client.commercialScope ? ["לא נשמר scope חבילה מובנה; שאלות השירות נגזרו רק מקודי השירות הקיימים."] : [])],
    kickoffTopics: ["בחירת סדרי עדיפויות והכרעה בנקודות שנותרו פתוחות", "חידוד מיצוב, מסרים והנחות קהל על בסיס השיחה", "יישור ציפיות מסחרי ותפעולי לפני אסטרטגיה"] };
}
export function validateSelection(snapshot: QuestionnaireSnapshot, value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some(id => typeof id !== "string") || new Set(value).size !== value.length)
    throw new QuestionnaireError("בחירת השאלות אינה תקינה.");
  const ids = value as string[];
  if (ids.some(id => !snapshot.items.some(item => item.id === id)) || snapshot.items.some(item => item.required && !ids.includes(item.id)))
    throw new QuestionnaireError("יש לכלול את שאלות החובה ורק שאלות מהטיוטה.");
  return ids;
}
export function parseAnswers(snapshot: QuestionnaireSnapshot, selectedIds: string[], input: unknown, now = new Date()): QuestionnaireAnswers {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length > 50) throw new QuestionnaireError("התשובות אינן תקינות.");
  const answers: QuestionnaireAnswers = Object.create(null);
  for (const [id, value] of Object.entries(input)) {
    const question = snapshot.items.find(q => q.id === id && selectedIds.includes(id));
    if (!question || !value || typeof value !== "object" || Array.isArray(value)) throw new QuestionnaireError("התשובה אינה שייכת לשאלון.");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !["state", "text", "priority", "links"].includes(key))) throw new QuestionnaireError("שדות תשובה אינם תקינים.");
    const allowed = question.action === "confirm" ? ["confirmed", "partial", "corrected", "rejected", "unknown", "kickoff"] : ["answered", "unknown", "kickoff"];
    if (typeof row.state !== "string" || !allowed.includes(row.state) || typeof row.text !== "string" || row.text.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(row.text)) throw new QuestionnaireError("מצב או תוכן התשובה אינו תקין.");
    const text = row.text.trim();
    if (["corrected", "partial", "answered"].includes(String(row.state)) && !text) throw new QuestionnaireError("נדרש תוכן לתשובה או לתיקון.");
    const priority = row.priority ?? "normal";
    if (typeof priority !== "string" || !["normal", "high"].includes(priority)) throw new QuestionnaireError("העדיפות אינה תקינה.");
    const links = row.links ?? [];
    if (!Array.isArray(links) || links.length > 5 || (!question.links && links.length) || links.some(link => typeof link !== "string" || !safeReferenceUrl(link))) throw new QuestionnaireError("אפשר להוסיף עד חמישה קישורי http/https תקינים.");
    answers[id] = { state: row.state as ValidationState, text, priority: priority as "normal" | "high", links: links as string[], updatedAt: now.toISOString() };
  }
  return answers;
}
export function questionnaireProgress(snapshot: QuestionnaireSnapshot, selectedIds: string[], answers: QuestionnaireAnswers) {
  const answered = selectedIds.filter(id => Boolean(answers[id])).length;
  const missingRequired = snapshot.items.filter(item => selectedIds.includes(item.id) && item.required && !answers[item.id]).map(item => item.id);
  return { answered, total: selectedIds.length, percent: selectedIds.length ? Math.round(answered / selectedIds.length * 100) : 0, missingRequired };
}
export function preKickoff(snapshot: QuestionnaireSnapshot, selectedIds: string[], answers: QuestionnaireAnswers) {
  type Entry = { question: QuestionItem; answer: QuestionnaireAnswer | null };
  const groups: Record<"confirmed" | "corrected" | "new" | "conflicts" | "unknown" | "kickoff", Entry[]> = { confirmed: [], corrected: [], new: [], conflicts: [], unknown: [], kickoff: [] };
  for (const question of snapshot.items.filter(q => selectedIds.includes(q.id) || q.source?.reviewDisposition === "needs_review")) {
    const answer = answers[question.id] || null;
    const entry = { question, answer };
    if (!answer || answer.state === "unknown") groups.unknown.push(entry);
    else if (answer.state === "kickoff") groups.kickoff.push(entry);
    else if (answer.state === "confirmed") groups.confirmed.push(entry);
    else if (answer.state === "answered") groups.new.push(entry);
    else {
      if (["partial", "corrected"].includes(answer.state)) groups.corrected.push(entry);
      groups.conflicts.push(entry);
    }
    if (question.source?.reviewDisposition === "needs_review" && !groups.conflicts.some(e => e.question.id === question.id)) groups.conflicts.push(entry);
  }
  return { groups, topics: snapshot.kickoffTopics, authority: "pre_kickoff" as const };
}
export function publicProjection(record: QuestionnaireRecord) {
  return {
    clientName: record.snapshot.clientName, status: record.status, revision: record.revision,
    items: record.snapshot.items.filter(q => record.selectedIds.includes(q.id)).map(q => ({
      id: q.id, section: q.section, label: q.label, action: q.action, required: q.required,
      suggestion: q.suggestion, links: q.links,
      source: q.source ? { authority: q.source.authority, evidence: q.source.evidence, url: q.source.url, confidence: q.source.confidence, unresolved: q.source.reviewDisposition === "needs_review" } : undefined,
    })), answers: record.answers, submittedAt: record.submittedAt,
    progress: questionnaireProgress(record.snapshot, record.selectedIds, record.answers),
  };
}
