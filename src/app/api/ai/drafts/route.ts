import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeAiDraftInput, validateAiDraftInput } from "@/lib/ai-drafts";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { aiContentDrafts, flashyAccounts } from "@/lib/schema";

function serialize(row: typeof aiContentDrafts.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

async function authorizeAccount(clientId: string, accountId: string) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const denied = assertClientAccess(access.access, clientId);
  if (denied) return { ok: false as const, response: denied };

  const account = await getDb().select({ id: flashyAccounts.id }).from(flashyAccounts).where(and(
    eq(flashyAccounts.id, accountId),
    eq(flashyAccounts.clientId, clientId),
  )).limit(1).then((rows) => rows[0]);
  if (!account) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "חשבון Flashy לא נמצא או אינו משויך ללקוח הזה." }, { status: 404 }) };
  }
  return access;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "שמירת טיוטות דורשת חיבור למסד הנתונים." }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim() ?? "";
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  if (!clientId || !accountId) {
    return NextResponse.json({ success: false, message: "חסרים לקוח או חשבון." }, { status: 400 });
  }

  const access = await authorizeAccount(clientId, accountId);
  if (!access.ok) return access.response;
  const rows = await getDb().select().from(aiContentDrafts).where(and(
    eq(aiContentDrafts.clientId, clientId),
    eq(aiContentDrafts.flashyAccountId, accountId),
  )).orderBy(desc(aiContentDrafts.updatedAt)).limit(100);
  return NextResponse.json({ success: true, data: rows.map(serialize) });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "שמירת טיוטות דורשת חיבור למסד הנתונים." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const clientId = String(body.clientId ?? "").trim();
  const accountId = String(body.accountId ?? "").trim();
  const input = normalizeAiDraftInput(body);
  const validationError = validateAiDraftInput(input);
  if (!clientId || !accountId || validationError) {
    return NextResponse.json({ success: false, message: validationError ?? "חסרים לקוח או חשבון." }, { status: 400 });
  }

  const access = await authorizeAccount(clientId, accountId);
  if (!access.ok) return access.response;
  const [created] = await getDb().insert(aiContentDrafts).values({
    clientId,
    flashyAccountId: accountId,
    createdByUserId: access.access.userId === "dev-admin" ? null : access.access.userId,
    kind: input.kind!,
    title: input.title!,
    content: input.content!,
    preheader: input.preheader ?? null,
    status: "draft",
    metadata: input.metadata ?? {},
  }).returning();
  await recordAudit({
    actorUserId: access.access.userId,
    action: "ai.draft.create",
    entityType: "ai_content_draft",
    entityId: created.id,
    metadata: { clientId, accountId, kind: created.kind },
  });
  return NextResponse.json({ success: true, data: serialize(created) }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "שמירת טיוטות דורשת חיבור למסד הנתונים." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ success: false, message: "חסר מזהה טיוטה." }, { status: 400 });

  const existing = await getDb().select().from(aiContentDrafts).where(eq(aiContentDrafts.id, id)).limit(1).then((rows) => rows[0]);
  if (!existing) return NextResponse.json({ success: false, message: "הטיוטה לא נמצאה." }, { status: 404 });
  const access = await authorizeAccount(existing.clientId, existing.flashyAccountId);
  if (!access.ok) return access.response;

    const editableFields: Record<string, unknown> = {};
    for (const key of ["title", "content", "preheader", "status"] as const) {
      if (key in body) {
        editableFields[key] = body[key];
      }
    }

    if (Object.keys(editableFields).length === 0) {
      return NextResponse.json({ error: "לא נשלחו שדות לעדכון" }, { status: 400 });
    }

    const input = normalizeAiDraftInput(editableFields, true);
  const validationError = validateAiDraftInput({
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
  });
  if (validationError) return NextResponse.json({ success: false, message: validationError }, { status: 400 });
  const nextStatus = input.status ?? (existing.status === "approved" ? "approved" : "draft");
  const [updated] = await getDb().update(aiContentDrafts).set({
    ...input,
    status: nextStatus,
    approvedAt: nextStatus === "approved" ? existing.approvedAt ?? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(aiContentDrafts.id, id)).returning();
  await recordAudit({
    actorUserId: access.access.userId,
    action: nextStatus === existing.status ? "ai.draft.update" : `ai.draft.${nextStatus}`,
    entityType: "ai_content_draft",
    entityId: id,
    metadata: { clientId: existing.clientId, accountId: existing.flashyAccountId, kind: existing.kind },
  });
  return NextResponse.json({ success: true, data: serialize(updated) });
}
