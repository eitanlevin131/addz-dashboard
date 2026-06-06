import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
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

  const adminContext = await requireAdmin();
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

  const adminContext = await requireAdmin();
  if (!adminContext.ok) return adminContext.response;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const name = String(body.name ?? "").trim();
  const role = normalizeRole(body.role);
  const clientId = String(body.clientId ?? "").trim();

  if (!email) {
    return NextResponse.json(
      { success: false, message: "חסר אימייל משתמש." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then((rows) => rows[0]);
  const user =
    existingUser ??
    (await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email,
        name: name || email,
        role,
      })
      .returning()
      .then((rows) => rows[0]));

  if (existingUser) {
    await db
      .update(users)
      .set({ name: name || existingUser.name, role })
      .where(eq(users.id, existingUser.id));
  }

  if (clientId && role === "client") {
    const client = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .then((rows) => rows[0]);

    if (!client) {
      return NextResponse.json(
        { success: false, message: "הלקוח שנבחר לא נמצא." },
        { status: 404 },
      );
    }

    await db
      .insert(clientUsers)
      .values({ clientId, userId: user.id })
      .onConflictDoNothing();
  }

  return NextResponse.json({ success: true, data: { userId: user.id } }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireAdmin();
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

  const adminContext = await requireAdmin();
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
