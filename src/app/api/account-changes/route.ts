import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { recordAudit } from "@/lib/audit";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { accountChangeEvents, flashyAccounts, users } from "@/lib/schema";
import type { AccountChangeArea, AccountChangeEvent } from "@/lib/types";

const allowedAreas = new Set<AccountChangeArea>([
  "popup",
  "automation",
  "email",
  "sms",
  "offer",
  "tracking",
  "strategy",
  "account",
  "other",
]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanAreas(value: unknown): AccountChangeArea[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is AccountChangeArea => allowedAreas.has(item as AccountChangeArea))));
}

function cleanOccurredAt(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapRow(row: {
  event: typeof accountChangeEvents.$inferSelect;
  userName: string | null;
  userEmail: string | null;
}): AccountChangeEvent {
  return {
    id: row.event.id,
    clientId: row.event.clientId,
    accountId: row.event.flashyAccountId,
    title: row.event.title,
    details: row.event.details,
    reason: row.event.reason ?? "",
    areas: cleanAreas(row.event.areas),
    occurredAt: row.event.occurredAt.toISOString(),
    createdAt: row.event.createdAt.toISOString(),
    updatedAt: row.event.updatedAt.toISOString(),
    createdBy: {
      id: row.event.createdByUserId,
      name: row.userName?.trim() || row.userEmail?.trim() || "צוות addz",
      email: row.userEmail ?? "",
    },
  };
}

async function verifyAccount(clientId: string, accountId: string) {
  return getDb()
    .select({ id: flashyAccounts.id })
    .from(flashyAccounts)
    .where(and(eq(flashyAccounts.id, accountId), eq(flashyAccounts.clientId, clientId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function loadEvent(id: string) {
  return getDb()
    .select()
    .from(accountChangeEvents)
    .where(eq(accountChangeEvents.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "מסד הנתונים אינו מחובר." }, { status: 503 });
  }

  const accessContext = await requireAdmin();
  if (!accessContext.ok) return accessContext.response;

  const params = new URL(request.url).searchParams;
  const clientId = cleanText(params.get("clientId"), 80);
  const accountId = cleanText(params.get("accountId"), 80);
  if (!clientId || !accountId) {
    return NextResponse.json({ success: false, message: "חסרים פרטי הלקוח או החשבון." }, { status: 400 });
  }

  const denied = assertClientAccess(accessContext.access, clientId);
  if (denied) return denied;
  if (!await verifyAccount(clientId, accountId)) {
    return NextResponse.json({ success: false, message: "החשבון לא נמצא עבור הלקוח שנבחר." }, { status: 404 });
  }

  const rows = await getDb()
    .select({
      event: accountChangeEvents,
      userName: users.name,
      userEmail: users.email,
    })
    .from(accountChangeEvents)
    .leftJoin(users, eq(accountChangeEvents.createdByUserId, users.id))
    .where(and(
      eq(accountChangeEvents.clientId, clientId),
      eq(accountChangeEvents.flashyAccountId, accountId),
    ))
    .orderBy(desc(accountChangeEvents.occurredAt), desc(accountChangeEvents.createdAt));

  return NextResponse.json({ success: true, data: rows.map(mapRow) });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "מסד הנתונים אינו מחובר." }, { status: 503 });
  }

  const accessContext = await requireAdmin();
  if (!accessContext.ok) return accessContext.response;
  const body = await request.json().catch(() => ({}));
  const clientId = cleanText(body.clientId, 80);
  const accountId = cleanText(body.accountId, 80);
  const title = cleanText(body.title, 160);
  const details = cleanText(body.details, 4_000);
  const reason = cleanText(body.reason, 2_000);
  const areas = cleanAreas(body.areas);
  const occurredAt = cleanOccurredAt(body.occurredAt);

  if (!clientId || !accountId || !title || !details || !occurredAt) {
    return NextResponse.json(
      { success: false, message: "צריך למלא כותרת, פירוט ומועד שינוי תקין." },
      { status: 400 },
    );
  }

  const denied = assertClientAccess(accessContext.access, clientId);
  if (denied) return denied;
  if (!await verifyAccount(clientId, accountId)) {
    return NextResponse.json({ success: false, message: "החשבון לא נמצא עבור הלקוח שנבחר." }, { status: 404 });
  }

  const [event] = await getDb().insert(accountChangeEvents).values({
    clientId,
    flashyAccountId: accountId,
    title,
    details,
    reason: reason || null,
    areas,
    occurredAt,
    createdByUserId: accessContext.access.userId === "dev-admin" ? null : accessContext.access.userId,
  }).returning();

  await recordAudit({
    actorUserId: accessContext.access.userId,
    action: "account.change.created",
    entityType: "account_change_event",
    entityId: event.id,
    metadata: { clientId, accountId, title, areas, occurredAt: occurredAt.toISOString() },
  });

  return NextResponse.json({ success: true, id: event.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "מסד הנתונים אינו מחובר." }, { status: 503 });
  }

  const accessContext = await requireAdmin();
  if (!accessContext.ok) return accessContext.response;
  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id, 80);
  const title = cleanText(body.title, 160);
  const details = cleanText(body.details, 4_000);
  const reason = cleanText(body.reason, 2_000);
  const areas = cleanAreas(body.areas);
  const occurredAt = cleanOccurredAt(body.occurredAt);
  const existing = id ? await loadEvent(id) : null;

  if (!existing) {
    return NextResponse.json({ success: false, message: "רשומת השינוי לא נמצאה." }, { status: 404 });
  }
  const denied = assertClientAccess(accessContext.access, existing.clientId);
  if (denied) return denied;
  if (!title || !details || !occurredAt) {
    return NextResponse.json(
      { success: false, message: "צריך למלא כותרת, פירוט ומועד שינוי תקין." },
      { status: 400 },
    );
  }

  await getDb().update(accountChangeEvents).set({
    title,
    details,
    reason: reason || null,
    areas,
    occurredAt,
    updatedAt: new Date(),
  }).where(eq(accountChangeEvents.id, id));

  await recordAudit({
    actorUserId: accessContext.access.userId,
    action: "account.change.updated",
    entityType: "account_change_event",
    entityId: id,
    metadata: { clientId: existing.clientId, accountId: existing.flashyAccountId, title, areas, occurredAt: occurredAt.toISOString() },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "מסד הנתונים אינו מחובר." }, { status: 503 });
  }

  const accessContext = await requireAdmin();
  if (!accessContext.ok) return accessContext.response;
  const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
  const existing = id ? await loadEvent(id) : null;
  if (!existing) {
    return NextResponse.json({ success: false, message: "רשומת השינוי לא נמצאה." }, { status: 404 });
  }
  const denied = assertClientAccess(accessContext.access, existing.clientId);
  if (denied) return denied;

  await getDb().delete(accountChangeEvents).where(eq(accountChangeEvents.id, id));
  await recordAudit({
    actorUserId: accessContext.access.userId,
    action: "account.change.deleted",
    entityType: "account_change_event",
    entityId: id,
    metadata: { clientId: existing.clientId, accountId: existing.flashyAccountId, title: existing.title },
  });

  return NextResponse.json({ success: true });
}
