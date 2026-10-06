import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditInsert } from "@/lib/audit";
import { requireClient } from "@/lib/clients";
import { clientCharacterizations } from "@/lib/schema";
import { questionnaireDetails } from "@/lib/questionnaire/repository";
import { allTopics, agenda, characterization, expectedRevision, KickoffError, parseDecision, parseNewTopic, prepareKickoff, type KickoffRecord } from "./core";

type Row = typeof clientCharacterizations.$inferSelect;
function view(row: Row) {
  const record: KickoffRecord = { ...row, status: row.status as KickoffRecord["status"], completedAt: row.completedAt?.toISOString() || null,
    updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString() };
  return { ...record, agenda: agenda(record), summary: characterization(record) };
}
export async function kickoffDetails(clientId: string) {
  await requireClient(clientId);
  const [row] = await getDb().select().from(clientCharacterizations).where(eq(clientCharacterizations.clientId, clientId));
  return row ? view(row) : null;
}
export async function createKickoff(clientId: string, actorId: string) {
  const client = await requireClient(clientId);
  const q = await questionnaireDetails(clientId);
  if (!q) throw new KickoffError("יש להשלים שאלון לפני הכנת פגישת האפיון.", 409);
  const snapshot = prepareKickoff(q, client);
  const id = crypto.randomUUID(), db = getDb();
  await db.batch([
    db.execute(sql`select 1 / (case when exists (select 1 from client_questionnaires where id=${q.id}::uuid and client_id=${clientId}::uuid and revision=${q.revision} and status in ('submitted','reviewed') for update) then 1 else 0 end) as fence`),
    db.insert(clientCharacterizations).values({ id, clientId, questionnaireId: q.id, createdBy: actorId === "dev-admin" ? null : actorId, snapshot }),
    auditInsert({ actorUserId: actorId, clientId, action: "kickoff.prepared", entityType: "characterization", entityId: id, metadata: { version: snapshot.version, questionnaireId: q.id, questionnaireRevision: q.revision } }),
  ]).catch(error => { throwConflict(error); });
  return kickoffDetails(clientId);
}
function throwConflict(error: unknown): never {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  if (cause && typeof cause === "object" && "code" in cause && ["22012", "23505"].includes(String(cause.code))) throw new KickoffError("האפיון עודכן במקביל. יש לרענן לפני ניסיון נוסף.", 409);
  throw error;
}
export async function changeKickoff(clientId: string, body: Record<string, unknown>, actorId: string) {
  await requireClient(clientId);
  const db = getDb();
  const [row] = await db.select().from(clientCharacterizations).where(eq(clientCharacterizations.clientId, clientId));
  if (!row) throw new KickoffError("טרם הוכן אפיון.", 404);
  const revision = expectedRevision(body.revision);
  if (row.revision !== revision) throw new KickoffError("האפיון עודכן במקביל. יש לרענן לפני ניסיון נוסף.", 409);
  let patch: Partial<typeof clientCharacterizations.$inferInsert> = {};
  let action = "", metadata: Record<string, unknown> = {};
  if (body.action !== "reopen" && row.status === "completed") throw new KickoffError("הפגישה סוכמה. יש לפתוח מחדש לפני עריכה.", 409);
  if (body.action === "decision") {
    const parsed = parseDecision(body, allTopics(row), actorId === "dev-admin" ? null : actorId);
    patch = { decisions: { ...row.decisions, [parsed.topicId]: parsed.decision } };
    action = "kickoff.decision_saved";
    metadata = { topicId: parsed.topicId, previous: row.decisions[parsed.topicId] || null, decision: parsed.decision };
  } else if (body.action === "add_topic") {
    if (row.addedTopics.length >= 40) throw new KickoffError("אפשר להוסיף עד 40 נושאים לפגישה.");
    const topic = parseNewTopic(body, `kickoff:${crypto.randomUUID()}`);
    patch = { addedTopics: [...row.addedTopics, topic] }; action = "kickoff.topic_added"; metadata = { topic };
  } else if (body.action === "complete" || body.action === "reopen") {
    if (Object.keys(body).some(key => !["action", "revision"].includes(key))) throw new KickoffError("שדות הבקשה אינם תקינים.");
    if (body.action === "reopen" && row.status !== "completed") throw new KickoffError("הפגישה כבר פתוחה.", 409);
    if (body.action === "complete" && !Object.keys(row.decisions).length) throw new KickoffError("יש לתעד לפחות החלטה אחת לפני סיכום הפגישה.");
    patch = { status: body.action === "complete" ? "completed" : "in_progress", completedAt: body.action === "complete" ? new Date() : null };
    action = body.action === "complete" ? "kickoff.completed" : "kickoff.reopened";
    const summary = characterization(row); metadata = { resolved: summary.resolved.length, unresolved: summary.unresolved.length, followUps: summary.followUps.length };
  } else throw new KickoffError("הפעולה אינה תקינה.");
  try {
    await db.batch([
      db.execute(sql`select 1 / (case when exists (select 1 from client_characterizations where id=${row.id}::uuid and client_id=${clientId}::uuid and revision=${revision} and status=${row.status} for update) then 1 else 0 end) as fence`),
      db.update(clientCharacterizations).set({ ...patch, revision: revision + 1, updatedAt: new Date() }).where(eq(clientCharacterizations.id, row.id)),
      auditInsert({ actorUserId: actorId, clientId, action, entityType: "characterization", entityId: row.id, metadata: { ...metadata, revision: revision + 1 } }),
    ]);
  } catch (error) { throwConflict(error); }
  return kickoffDetails(clientId);
}
