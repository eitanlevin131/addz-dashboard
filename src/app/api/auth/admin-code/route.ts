import { NextResponse } from "next/server";
import {
  createAdminSessionToken,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
} from "@/lib/auth/admin-session";

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
  const expectedCode = process.env.ADMIN_LOGIN_CODE?.trim();

  if (
    !normalizedEmail ||
    !code?.trim() ||
    !expectedCode ||
    code.trim() !== expectedCode ||
    !getAdminEmails().has(normalizedEmail)
  ) {
    return NextResponse.json(
      { success: false, message: "האימייל או קוד האדמין לא תקינים." },
      { status: 401 },
    );
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
