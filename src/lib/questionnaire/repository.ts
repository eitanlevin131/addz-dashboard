import { and, desc, eq, sql } from "drizzle-orm";
import { questionnaireCatalogContext } from "../website-intelligence/catalog";
import { getDb } from "@/lib/db";
import { auditInsert } from "@/lib/audit";
import { requireClient } from "@/lib/clients";
import { clientQuestionnaires, websiteFindings, websiteScans, websiteScanSources } from "@/lib/schema";
import { generateQuestionnaire, parseAnswers, preKickoff, publicProjection, questionnaireProgress, QuestionnaireError, validateSelection, type FindingSeed, type QuestionnaireRecord } from "./core";
import { createQuestionnaireToken, isLiveQuestionnaireLink, questionnaireTokenHash } from "./security";
import { validAttachmentReceipt } from "./attachment-security";

type Row = typeof clientQuestionnaires.$inferSelect;
function record(row: Row): QuestionnaireRecord {
  return { id: row.id, clientId: row.clientId, snapshot: row.snapshot, selectedIds: row.selectedIds,
    answers: row.answers, status: row.status, revision: row.revision,
    linkExpiresAt: row.linkExpiresAt?.toISOString() || null, revokedAt: row.revokedAt?.toISOString() || null, submittedAt: row.submittedAt?.toISOString() || null };
}
function teamView(row: Row) {
  const data = record(row);
  return { ...data, progress: questionnaireProgress(row.snapshot, row.selectedIds, row.answers),
    preparation: ["submitted", "reviewed"].includes(row.status) ? preKickoff(row.snapshot, row.selectedIds, row.answers) : null };
}
async function teamRow(clientId: string) {
  await requireClient(clientId);
  const [row] = await getDb().select().from(clientQuestionnaires).where(eq(clientQuestionnaires.clientId, clientId));
  if (!row) throw new QuestionnaireError("השאלון לא נמצא.", 404);
  return row;
}
function expectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new QuestionnaireError("גרסת השאלון אינה תקינה.");
  return value;
}
async function commit(row: Row, expected: number, patch: Partial<typeof clientQuestionnaires.$inferInsert>, action: string, actorId: string | null, publicRequest = false) {
  const db = getDb();
  // Lock + fail-fast fence + write + event are one Neon HTTP transaction.
  // The public token is fenced too, so revocation/rotation cannot race a save.
  const fence = db.execute(sql`select 1 / (case when exists (
    select 1 from client_questionnaires where id=${row.id}::uuid and client_id=${row.clientId}::uuid
    and revision=${expected} and status=${row.status}
    and (${!publicRequest} or (token_hash=${row.tokenHash} and revoked_at is null and link_expires_at>now())) for update
  ) then 1 else 0 end) as fence`);
  try {
    await db.batch([fence, db.update(clientQuestionnaires).set({ ...patch, revision: expected + 1, updatedAt: new Date() }).where(eq(clientQuestionnaires.id, row.id)),
      auditInsert({ actorUserId: actorId, actorType: publicRequest ? "client" : "user", clientId: row.clientId, action, entityType: "questionnaire", entityId: row.id,
        metadata: { revision: expected + 1 } })]);
  } catch (error) {
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "22012") throw new QuestionnaireError("השאלון עודכן במקביל. יש לרענן לפני ניסיון נוסף.", 409);
    throw error;
  }
}
export async function questionnaireDetails(clientId: string) {
  await requireClient(clientId);
  const [row] = await getDb().select().from(clientQuestionnaires).where(eq(clientQuestionnaires.clientId, clientId));
  return row ? teamView(row) : null;
}
export async function createQuestionnaire(clientId: string, actorId: string) {
  const client = await requireClient(clientId);
  const [scan] = await getDb().select().from(websiteScans).where(and(eq(websiteScans.clientId, clientId), sql`${websiteScans.status} in ('completed','completed_with_warnings')`)).orderBy(desc(websiteScans.createdAt)).limit(1);
  const currentSite = (value: string | null) => { try { const url = new URL(value || ""); return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`; } catch { return null; } };
  const usableScan = scan && currentSite(client.website) === currentSite(scan.websiteUrl) ? scan : null;
  const rows = usableScan ? await getDb().select({ finding: websiteFindings, url: websiteScanSources.url, pageType: websiteScanSources.pageType }).from(websiteFindings)
    .innerJoin(websiteScanSources, and(eq(websiteScanSources.id, websiteFindings.sourceId), eq(websiteScanSources.scanId, websiteFindings.scanId)))
    .where(eq(websiteFindings.scanId, usableScan.id)).orderBy(websiteFindings.category, websiteFindings.key, websiteFindings.createdAt).limit(1200) : [];
  const findings: FindingSeed[] = rows.map(({ finding, url, pageType }) => ({ authority: finding.value && typeof finding.value === "object" && "classification" in finding.value && finding.value.classification === "HYPOTHESIS" ? "website_hypothesis" : finding.observationStatus === "observed" ? "website_observed" : "website_inferred",
    scanId: finding.scanId, findingId: finding.id, sourceId: finding.sourceId, url, pageType,
    evidence: finding.evidence, locator: finding.locator, confidence: finding.confidence, reviewDisposition: finding.reviewDisposition,
    category: finding.category, key: finding.key, value: finding.value, observationStatus: finding.observationStatus }));
  const sources = usableScan ? await getDb().select().from(websiteScanSources).where(eq(websiteScanSources.scanId, usableScan.id)) : [];
  const catalogContext = usableScan ? questionnaireCatalogContext(usableScan.state.candidates || [], sources) : undefined;
  const snapshot = generateQuestionnaire(client, usableScan?.id || null, findings, catalogContext);
  const id = crypto.randomUUID();
  const selectedIds = snapshot.items.filter(item => item.source?.reviewDisposition !== "needs_review").map(item => item.id);
  await getDb().batch([
    getDb().insert(clientQuestionnaires).values({ id, clientId, createdBy: actorId === "dev-admin" ? null : actorId, snapshot, selectedIds }),
    auditInsert({ actorUserId: actorId, clientId, action: "questionnaire.generated", entityType: "questionnaire", entityId: id, metadata: { version: snapshot.version, scanId: snapshot.scanId } }),
  ]);
  return questionnaireDetails(clientId);
}
export async function changeQuestionnaire(clientId: string, body: Record<string, unknown>, actorId: string) {
  if (Object.keys(body).some(key => !["action", "revision", "selectedIds"].includes(key))) throw new QuestionnaireError("שדות הבקשה אינם תקינים.");
  const row = await teamRow(clientId);
  const revision = expectedRevision(body.revision);
  if (body.action === "ready") {
    if (row.status !== "draft") throw new QuestionnaireError("אפשר לאשר רק טיוטה.", 409);
    const selectedIds = validateSelection(row.snapshot, body.selectedIds);
    await commit(row, revision, { selectedIds, status: "ready", readyAt: new Date() }, "questionnaire.ready", actorId);
  } else if (body.action === "share") {
    if (!["ready", "sent", "in_progress", "submitted", "reviewed"].includes(row.status)) throw new QuestionnaireError("יש לבדוק ולאשר את הטיוטה לפני שיתוף.", 409);
    const token = createQuestionnaireToken();
    await commit(row, revision, { tokenHash: questionnaireTokenHash(token), linkExpiresAt: new Date(Date.now() + 90 * 86400000), revokedAt: null,
      status: row.status === "ready" ? "sent" : row.status, sharedAt: new Date() }, "questionnaire.link_issued", actorId);
    return { questionnaire: await questionnaireDetails(clientId), token };
  } else if (body.action === "revoke") {
    if (!row.tokenHash) throw new QuestionnaireError("לא נוצר קישור לשאלון.");
    await commit(row, revision, { revokedAt: new Date() }, "questionnaire.link_revoked", actorId);
  } else if (body.action === "reviewed") {
    if (row.status !== "submitted") throw new QuestionnaireError("אפשר לסמן נבדק רק לאחר שליחה.", 409);
    await commit(row, revision, { status: "reviewed", reviewedAt: new Date() }, "questionnaire.reviewed", actorId);
  } else throw new QuestionnaireError("הפעולה אינה תקינה.");
  return { questionnaire: await questionnaireDetails(clientId) };
}
export async function publicQuestionnaire(token: unknown) {
  const hash = questionnaireTokenHash(token);
  if (!hash) throw new QuestionnaireError("הקישור אינו זמין.", 404);
  const [row] = await getDb().select().from(clientQuestionnaires).where(eq(clientQuestionnaires.tokenHash, hash));
  if (!row || !isLiveQuestionnaireLink(row)) throw new QuestionnaireError("הקישור אינו זמין.", 404);
  return row;
}
export async function loadPublicQuestionnaire(token: unknown) { return publicProjection(record(await publicQuestionnaire(token)), Boolean(process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN)); }
export async function savePublicQuestionnaire(token: unknown, body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !["revision", "answers", "submit"].includes(key)) || (body.submit !== undefined && typeof body.submit !== "boolean")) throw new QuestionnaireError("הבקשה אינה תקינה.");
  const row = await publicQuestionnaire(token);
  if (["submitted", "reviewed"].includes(row.status)) {
    if (body.submit === true) return publicProjection(record(row), Boolean(process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN));
    throw new QuestionnaireError("השאלון כבר נשלח ואינו פתוח לעריכה.", 409);
  }
  const revision = expectedRevision(body.revision);
  const changes = parseAnswers(row.snapshot, row.selectedIds, body.answers);
  for (const answer of Object.values(changes)) for (const attachment of answer.attachments || []) {
    if (!process.env.AUTH_SECRET || !validAttachmentReceipt(attachment, row.id, process.env.AUTH_SECRET)) throw new QuestionnaireError("הקובץ אינו שייך לשאלון או שלא הושלמה העלאתו.");
  }
  const answers = { ...row.answers, ...changes };
  if (body.submit && questionnaireProgress(row.snapshot, row.selectedIds, answers).missingRequired.length) throw new QuestionnaireError("יש להשלים את שאלות החובה או לבחור שלא ידוע / נדבר בפגישה.");
  await commit(row, revision, { answers, status: body.submit ? "submitted" : "in_progress", ...(body.submit ? { submittedAt: new Date() } : {}) }, body.submit ? "questionnaire.completed" : "questionnaire.saved", null, true);
  const [updated] = await getDb().select().from(clientQuestionnaires).where(eq(clientQuestionnaires.id, row.id));
  return publicProjection(record(updated), Boolean(process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN));
}
