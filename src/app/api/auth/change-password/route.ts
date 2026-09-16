import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth/access";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";

export async function POST(request: Request) {
  const context = await getAccessContext();
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ success: false, message: "הסיסמה החדשה חייבת להיות שונה מהזמנית." }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, context.access.userId));
  if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ success: false, message: "הסיסמה הנוכחית אינה נכונה." }, { status: 400 });
  }

  await db.update(users).set({
    passwordHash: await hashPassword(newPassword),
    mustChangePassword: false,
    sessionVersion: sql`${users.sessionVersion} + 1`,
    loginAttempts: 0,
    loginWindowStart: null,
  }).where(eq(users.id, user.id));
  await recordAudit({ actorUserId: user.id, action: "password.changed", entityType: "user", entityId: user.id });

  return NextResponse.json({ success: true, reauthenticate: true });
}
