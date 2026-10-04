import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiRuns, clients, websiteFindings, websiteScans, websiteScanSources } from "@/lib/schema";
import { auditInsert } from "@/lib/audit";
import { ClientInputError, requireUuid } from "@/lib/client-foundation";
import { SCAN_LIMITS, SCAN_VERSION, REVIEW_DISPOSITIONS, type FindingInput } from "./config";
import { initialScanState } from "./state";
import { safeWebsiteUrl } from "./safe-fetch";
import { checksum } from "./extraction";
import { WEBSITE_AI_VERSION } from "./ai";

export function initialScanStatements(clientId: string, website: string | null | undefined, actorId: string, previousScanId: string | null = null) {
  if (!website) return null;
  let url: string;
  try { url = safeWebsiteUrl(website).href; } catch { return null; }
  const id = crypto.randomUUID();
  const db = getDb();
  return { id, statements: [db.insert(websiteScans).values({ id, clientId, websiteUrl: url, previousScanId, requestedBy: actorId === "dev-admin" ? null : actorId, version: SCAN_VERSION,
    configuration: { limits: SCAN_LIMITS, ai: WEBSITE_AI_VERSION, model: process.env.OPENAI_MODEL || "gpt-5-mini" }, state: initialScanState() }),
    auditInsert({ clientId, actorUserId: actorId === "dev-admin" ? null : actorId, actorType: "user", action: "website_scan.requested", entityType: "website_scan", entityId: id, metadata: { websiteUrl: url, version: SCAN_VERSION } })] };
}
export async function requireScan(clientId: string, scanId: string) {
  requireUuid(clientId); requireUuid(scanId);
  const [scan] = await getDb().select().from(websiteScans).where(and(eq(websiteScans.id, scanId), eq(websiteScans.clientId, clientId)));
  if (!scan) throw new ClientInputError("הסריקה לא נמצאה.", 404);
  return scan;
}
export async function requestScan(clientId: string, actorId: string) {
  requireUuid(clientId);
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new ClientInputError("הלקוח לא נמצא.", 404);
  const [previous] = await db.select({ id: websiteScans.id }).from(websiteScans).where(eq(websiteScans.clientId, clientId)).orderBy(desc(websiteScans.createdAt)).limit(1);
  const draft = initialScanStatements(clientId, client.website, actorId, previous?.id || null);
  if (!draft) throw new ClientInputError("יש להגדיר כתובת אתר ציבורית תקינה בפרטי הלקוח.");
  await db.batch(draft.statements as [typeof draft.statements[number], ...typeof draft.statements]);
  return requireScan(clientId, draft.id);
}
export async function scanHistory(clientId: string) {
  requireUuid(clientId);
  const [client] = await getDb().select({ website: clients.website }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new ClientInputError("הלקוח לא נמצא.", 404);
  const scans = await getDb().select().from(websiteScans).where(eq(websiteScans.clientId, clientId)).orderBy(desc(websiteScans.createdAt)).limit(30);
  return { website: client.website, scans };
}
export async function scanDetails(clientId: string, scanId: string, category?: string, disposition?: string) {
  const scan = await requireScan(clientId, scanId);
  const db = getDb();
  const sources = await db.select({ id: websiteScanSources.id, url: websiteScanSources.url, canonicalUrl: websiteScanSources.canonicalUrl, title: websiteScanSources.title,
    pageType: websiteScanSources.pageType, status: websiteScanSources.status, attempts: websiteScanSources.attempts, errorCode: websiteScanSources.errorCode, fetchedAt: websiteScanSources.fetchedAt,
    extracted: sql<{ redirects?: string[] }>`jsonb_build_object('redirects', ${websiteScanSources.extracted}->'redirects')`,
  }).from(websiteScanSources).where(eq(websiteScanSources.scanId, scanId)).orderBy(websiteScanSources.url).limit(20);
  const conditions = [eq(websiteFindings.scanId, scanId)];
  if (category) conditions.push(eq(websiteFindings.category, category));
  if (disposition && REVIEW_DISPOSITIONS.includes(disposition as typeof REVIEW_DISPOSITIONS[number])) conditions.push(eq(websiteFindings.reviewDisposition, disposition));
  const findings = await db.select().from(websiteFindings).where(and(...conditions)).orderBy(websiteFindings.category, websiteFindings.createdAt).limit(400);
  const runs = await db.select({ id: aiRuns.id, task: aiRuns.task, model: aiRuns.model, status: aiRuns.status, errorCode: aiRuns.errorCode, durationMs: aiRuns.durationMs, inputTokens: aiRuns.inputTokens, outputTokens: aiRuns.outputTokens,
    skillName: aiRuns.skillName, skillVersion: aiRuns.skillVersion, promptVersion: aiRuns.promptVersion, schemaVersion: aiRuns.schemaVersion, sourceIds: aiRuns.sourceIds, inputHash: aiRuns.inputHash, createdAt: aiRuns.createdAt,
  }).from(aiRuns).where(eq(aiRuns.scanId, scanId)).orderBy(aiRuns.createdAt).limit(20);
  return { scan, sources, findings, runs };
}
export function findingsInsert(scanId: string, inputs: FindingInput[], aiRunId: string | null = null) {
  return getDb().insert(websiteFindings).values(inputs.map(finding => ({ ...finding, scanId, aiRunId,
    findingHash: checksum(JSON.stringify([finding.sourceId, finding.category, finding.key, finding.value, finding.observationStatus])) }))).onConflictDoNothing();
}
export async function cancelScan(clientId: string, scanId: string, actorId: string) {
  await requireScan(clientId, scanId);
  const db = getDb();
  const actor = actorId === "dev-admin" ? null : actorId;
  const changed = db.execute(sql`with changed as (update website_scans set status='cancelled', lease_token=null, lease_until=null, completed_at=now(), updated_at=now() where id=${scanId}::uuid and status in ('pending','running','processing') returning id)
    insert into audit_logs (client_id,actor_user_id,actor_type,action,entity_type,entity_id,metadata) select ${clientId}::uuid,${actor},'user','website_scan.cancelled','website_scan',id::text,'{}'::jsonb from changed`);
  await changed;
  return requireScan(clientId, scanId);
}
export async function reviewFinding(clientId: string, findingId: string, disposition: unknown, actorId: string) {
  requireUuid(clientId); requireUuid(findingId);
  if (typeof disposition !== "string" || !REVIEW_DISPOSITIONS.includes(disposition as typeof REVIEW_DISPOSITIONS[number])) throw new ClientInputError("תיוג הממצא אינו תקין.");
  const db = getDb();
  const [finding] = await db.select({ id: websiteFindings.id }).from(websiteFindings).innerJoin(websiteScans, eq(websiteFindings.scanId, websiteScans.id)).where(and(eq(websiteFindings.id, findingId), eq(websiteScans.clientId, clientId)));
  if (!finding) throw new ClientInputError("הממצא לא נמצא.", 404);
  await db.batch([
    db.update(websiteFindings).set({ reviewDisposition: disposition, reviewedBy: actorId === "dev-admin" ? null : actorId, reviewedAt: new Date() }).where(eq(websiteFindings.id, findingId)),
    auditInsert({ clientId, actorUserId: actorId, actorType: "user", action: "website_scan.review_tagged", entityType: "website_finding", entityId: findingId, metadata: { disposition } }),
  ]);
  return { id: findingId, reviewDisposition: disposition };
}
