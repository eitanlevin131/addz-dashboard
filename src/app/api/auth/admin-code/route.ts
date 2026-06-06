import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  createAdminSessionToken,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
} from "@/lib/auth/admin-session";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientUsers, users } from "@/lib/schema";

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST(request: Request) {
  const { email, code } = (await request.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
  };
  const normalizedEmail = email?.trim().toLowerCase();
  const submittedCode = code?.trim();
  const expectedAdminCode = process.env.ADMIN_LOGIN_CODE?.trim();
  const expectedClientCode = process.env.CLIENT_LOGIN_CODE?.trim();
  if (!normalizedEmail || !submittedCode) {
    return NextResponse.json(
      { success: false, message: "האימייל או קוד הכניסה לא תקינים." },
      { status: 401 },
    );
  }

  const isConfiguredAdmin =
    Boolean(expectedAdminCode) &&
    submittedCode === expectedAdminCode &&
    getAdminEmails().has(normalizedEmail);

  if (!isConfiguredAdmin) {
    if (!expectedClientCode || submittedCode !== expectedClientCode || !isDatabaseConfigured()) {
      return NextResponse.json(
        { success: false, message: "האימייל או קוד הכניסה לא תקינים." },
        { status: 401 },
      );
    }

    const db = getDb();
    const user = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .then((rows) => rows[0]);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "המשתמש לא קיים במערכת. צריך להוסיף אותו באדמין." },
        { status: 401 },
      );
    }

    if (user.role !== "admin") {
      const links = await db
        .select({ id: clientUsers.id })
        .from(clientUsers)
        .where(eq(clientUsers.userId, user.id));

      if (!links.length) {
        return NextResponse.json(
          { success: false, message: "המשתמש לא משויך עדיין לאף לקוח." },
          { status: 401 },
        );
      }
    }
  }

  const response = NextResponse.json({ success: true, message: "התחברת בהצלחה." });
  response.cookies.set(getAdminSessionCookieName(), createAdminSessionToken(normalizedEmail), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: getAdminSessionMaxAge(),
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "יצאת מהמערכת." });
  response.cookies.set(getAdminSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
