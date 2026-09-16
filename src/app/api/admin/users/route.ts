import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/access";
import { parseManagedRole, resolveEffectiveRole } from "@/lib/auth/access-policy";
import { isOwnerEmail } from "@/lib/auth/owner";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientUsers, clients, loginCodes, users } from "@/lib/schema";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function revokeAuthentication(userId: string) {
  const db = getDb();
  const now = new Date();
  await Promise.all([
    db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId)),
    db.update(loginCodes).set({ status: "revoked", consumedAt: now }).where(and(
      eq(loginCodes.userId, userId),
      isNull(loginCodes.consumedAt),
    )),
  ]);
}

async function ownerAccess() {
  if (!isDatabaseConfigured()) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 }) };
  }
  return requireOwner();
}

export async function GET() {
  const context = await ownerAccess();
  if (!context.ok) return context.response;
  const db = getDb();
  const [userRows, linkRows] = await Promise.all([
    db.select().from(users),
    db.select({ id: clientUsers.id, userId: clientUsers.userId, clientId: clientUsers.clientId, clientName: clients.name, createdAt: clientUsers.createdAt })
      .from(clientUsers).leftJoin(clients, eq(clientUsers.clientId, clients.id)),
  ]);

  return NextResponse.json({
    success: true,
    data: userRows.map((user) => ({
      id: user.id,
      name: user.name ?? "",
      email: user.email,
      role: resolveEffectiveRole(user.role, isOwnerEmail(user.email)),
      status: user.status,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      isOwner: isOwnerEmail(user.email),
      createdAt: user.createdAt.toISOString(),
      clients: linkRows.filter((link) => link.userId === user.id).map((link) => ({
        linkId: link.id,
        clientId: link.clientId,
        clientName: link.clientName ?? "לקוח לא קיים",
        createdAt: link.createdAt.toISOString(),
      })),
    })),
  });
}

export async function POST(request: Request) {
  const context = await ownerAccess();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const name = String(body.name ?? "").trim();
  const role = parseManagedRole(body.role);
  const clientId = String(body.clientId ?? "").trim();

  if (!role) {
    return NextResponse.json({ success: false, message: "תפקיד המשתמש אינו תקין." }, { status: 400 });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, message: "חסר אימייל משתמש תקין." }, { status: 400 });
  }
  if (role === "client" && !clientId) {
    return NextResponse.json({ success: false, message: "צריך לבחור לקוח עבור משתמש לקוח." }, { status: 400 });
  }

  const db = getDb();
  if (role === "client") {
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
    if (!client) return NextResponse.json({ success: false, message: "הלקוח שנבחר לא נמצא." }, { status: 404 });
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return NextResponse.json({ success: false, message: "המשתמש כבר קיים." }, { status: 409 });

  const userId = crypto.randomUUID();
  const insertUser = db.insert(users).values({ id: userId, email, name: name || email, role, status: "active", mustChangePassword: false });
  try {
    if (role === "client") {
      await db.batch([insertUser, db.insert(clientUsers).values({ clientId, userId })]);
    } else {
      await insertUser;
    }
  } catch {
    return NextResponse.json({ success: false, message: "יצירת המשתמש נכשלה. בדוק אם האימייל כבר קיים." }, { status: 409 });
  }
  await recordAudit({ actorUserId: context.access.userId, action: "user.created", entityType: "user", entityId: userId, metadata: { role, clientId: role === "client" ? clientId : null } });
  return NextResponse.json({ success: true, data: { userId } }, { status: 201 });
}

export async function PUT(request: Request) {
  const context = await ownerAccess();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const clientId = String(body.clientId ?? "");
  const db = getDb();
  const [[user], [client]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(clients).where(eq(clients.id, clientId)),
  ]);
  if (!user || !client) return NextResponse.json({ success: false, message: "המשתמש או הלקוח לא נמצאו." }, { status: 404 });
  if (isOwnerEmail(user.email)) return NextResponse.json({ success: false, message: "לא ניתן לשנות את הרשאות בעל המערכת." }, { status: 400 });
  if (user.role !== "client") return NextResponse.json({ success: false, message: "שיוך לקוח זמין רק למשתמש מסוג לקוח." }, { status: 400 });
  await db.insert(clientUsers).values({ userId, clientId }).onConflictDoNothing();
  await revokeAuthentication(userId);
  await recordAudit({ actorUserId: context.access.userId, action: "user.client_assigned", entityType: "user", entityId: userId, metadata: { clientId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const context = await ownerAccess();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  if (!userId) return NextResponse.json({ success: false, message: "חסר מזהה משתמש." }, { status: 400 });
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return NextResponse.json({ success: false, message: "המשתמש לא נמצא." }, { status: 404 });
  const targetIsOwner = isOwnerEmail(target.email);

  if (body.action === "revoke_sessions") {
    if (targetIsOwner) return NextResponse.json({ success: false, message: "לא ניתן לנתק את בעל המערכת דרך המסך הזה." }, { status: 400 });
    await revokeAuthentication(userId);
    await recordAudit({ actorUserId: context.access.userId, action: "user.sessions_revoked", entityType: "user", entityId: userId });
    return NextResponse.json({ success: true });
  }

  if (body.status !== undefined) {
    if (targetIsOwner) return NextResponse.json({ success: false, message: "לא ניתן להשעות את בעל המערכת." }, { status: 400 });
    if (body.status !== "active" && body.status !== "suspended") {
      return NextResponse.json({ success: false, message: "סטטוס המשתמש אינו תקין." }, { status: 400 });
    }
    const status = body.status;
    await db.update(users).set({ status }).where(eq(users.id, userId));
    await revokeAuthentication(userId);
    await recordAudit({ actorUserId: context.access.userId, action: `user.${status}`, entityType: "user", entityId: userId, metadata: { previousStatus: target.status, status } });
    return NextResponse.json({ success: true });
  }

  const role = parseManagedRole(body.role);
  if (!role) return NextResponse.json({ success: false, message: "תפקיד לא תקין." }, { status: 400 });
  if (targetIsOwner) return NextResponse.json({ success: false, message: "לא ניתן לשנות את תפקיד בעל המערכת." }, { status: 400 });
  if (role === "client") {
    const clientId = String(body.clientId ?? "").trim();
    if (!clientId) return NextResponse.json({ success: false, message: "צריך לבחור לקוח לפני שינוי התפקיד ללקוח." }, { status: 400 });
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
    if (!client) return NextResponse.json({ success: false, message: "הלקוח שנבחר לא נמצא." }, { status: 404 });
    await db.batch([
      db.insert(clientUsers).values({ userId, clientId }).onConflictDoNothing(),
      db.update(users).set({ role }).where(eq(users.id, userId)),
    ]);
  } else {
    await db.batch([
      db.delete(clientUsers).where(eq(clientUsers.userId, userId)),
      db.update(users).set({ role }).where(eq(users.id, userId)),
    ]);
  }
  await revokeAuthentication(userId);
  await recordAudit({ actorUserId: context.access.userId, action: "user.role_changed", entityType: "user", entityId: userId, metadata: { previousRole: target.role, role } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const context = await ownerAccess();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const clientId = String(body.clientId ?? "");
  if (!userId || !clientId) return NextResponse.json({ success: false, message: "חסרים משתמש או לקוח להסרת הרשאה." }, { status: 400 });
  const [target] = await getDb().select().from(users).where(eq(users.id, userId));
  if (!target || isOwnerEmail(target.email)) return NextResponse.json({ success: false, message: "לא ניתן לשנות את הרשאות בעל המערכת." }, { status: 400 });
  await getDb().delete(clientUsers).where(and(eq(clientUsers.userId, userId), eq(clientUsers.clientId, clientId)));
  await revokeAuthentication(userId);
  await recordAudit({ actorUserId: context.access.userId, action: "user.client_unassigned", entityType: "user", entityId: userId, metadata: { clientId } });
  return NextResponse.json({ success: true });
}
