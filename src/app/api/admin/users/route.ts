import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/access";
import { isOwnerEmail } from "@/lib/auth/owner";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientUsers, clients, users } from "@/lib/schema";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value: unknown) {
  return String(value ?? "client").trim() === "admin" ? "admin" : "client";
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireOwner();
  if (!adminContext.ok) return adminContext.response;

  const db = getDb();
  const [userRows, linkRows] = await Promise.all([
    db.select().from(users),
    db
      .select({
        id: clientUsers.id,
        userId: clientUsers.userId,
        clientId: clientUsers.clientId,
        clientName: clients.name,
        createdAt: clientUsers.createdAt,
      })
      .from(clientUsers)
      .leftJoin(clients, eq(clientUsers.clientId, clients.id)),
  ]);

  return NextResponse.json({
    success: true,
    data: userRows.map((user) => ({
      id: user.id,
      name: user.name ?? "",
      email: user.email,
      role: user.role,
      hasPassword: Boolean(user.passwordHash),
      isOwner: isOwnerEmail(user.email),
      createdAt: user.createdAt.toISOString(),
      clients: linkRows
        .filter((link) => link.userId === user.id)
        .map((link) => ({
          linkId: link.id,
          clientId: link.clientId,
          clientName: link.clientName ?? "לקוח לא קיים",
          createdAt: link.createdAt.toISOString(),
        })),
    })),
  });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireOwner();
  if (!adminContext.ok) return adminContext.response;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);
  const clientId = String(body.clientId ?? "").trim();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, message: "חסר אימייל משתמש." },
      { status: 400 },
    );
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
  }

  if (role === "client" && !clientId) {
    return NextResponse.json(
      { success: false, message: "צריך לבחור לקוח עבור משתמש לקוח." },
      { status: 400 },
    );
  }

  const db = getDb();
  if (clientId && role === "client") {
    if (!/^[a-f0-9-]{36}$/i.test(clientId)) return NextResponse.json({ success: false, message: "הלקוח שנבחר אינו תקין." }, { status: 400 });
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
    if (!client) return NextResponse.json({ success: false, message: "הלקוח שנבחר לא נמצא." }, { status: 404 });
  }
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then((rows) => rows[0]);
  if (existingUser) {
    return NextResponse.json(
      { success: false, message: "המשתמש כבר קיים. ניתן לשנות סיסמה ברשימת המשתמשים." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const insertUser = db
      .insert(users)
      .values({
        id: userId,
        email,
        name: name || email,
        passwordHash,
        role,
      })
      .returning();
  try {
    if (role === "client") {
      await db.batch([insertUser, db.insert(clientUsers).values({ clientId, userId })]);
    } else {
      await insertUser;
    }
  } catch {
    return NextResponse.json({ success: false, message: "יצירת המשתמש נכשלה. בדוק אם האימייל כבר קיים." }, { status: 409 });
  }

  return NextResponse.json({ success: true, data: { userId } }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireOwner();
  if (!adminContext.ok) return adminContext.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  const role = normalizeRole(body.role);

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "חסר מזהה משתמש." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return NextResponse.json({ success: false, message: "המשתמש לא נמצא." }, { status: 404 });

  if (body.password !== undefined) {
    const password = typeof body.password === "string" ? body.password : "";
    const error = validatePassword(password);
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });
    await db.update(users).set({
      passwordHash: await hashPassword(password),
      sessionVersion: sql`${users.sessionVersion} + 1`,
      loginAttempts: 0,
      loginWindowStart: null,
    }).where(eq(users.id, userId));
    return NextResponse.json({ success: true, reauthenticate: target.email === adminContext.access.email });
  }

  if (body.role !== "admin" && body.role !== "client") return NextResponse.json({ success: false, message: "תפקיד לא תקין." }, { status: 400 });
  if (isOwnerEmail(target.email)) return NextResponse.json({ success: false, message: "לא ניתן לשנות את תפקיד בעל המערכת." }, { status: 400 });
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, message: "המשתמש לא נמצא." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireOwner();
  if (!adminContext.ok) return adminContext.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  const clientId = String(body.clientId ?? "").trim();

  if (!userId || !clientId) {
    return NextResponse.json(
      { success: false, message: "חסרים משתמש או לקוח להסרת הרשאה." },
      { status: 400 },
    );
  }

  await getDb()
    .delete(clientUsers)
    .where(and(eq(clientUsers.userId, userId), eq(clientUsers.clientId, clientId)));

  return NextResponse.json({ success: true });
}
