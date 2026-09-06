import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientUsers, users } from "@/lib/schema";
import { authOptions } from "@/lib/auth/options";
import { requireOwner } from "@/lib/auth/access";

function hostFromUrl(value?: string) {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function GET(request: Request) {
  const context = await requireOwner();
  if (!context.ok) return context.response;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() ?? null;
  const adminEmails = getAdminEmails();
  let dbUser: { id: string; role: string } | null = null;
  let clientAccessCount = 0;

  if (email && isDatabaseConfigured()) {
    const db = getDb();
    const user = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0]);

    if (user) {
      dbUser = user;
      clientAccessCount = await db
        .select({ id: clientUsers.id })
        .from(clientUsers)
        .where(eq(clientUsers.userId, user.id))
        .then((rows) => rows.length);
    }
  }

  return NextResponse.json({
    success: true,
    requestHost: new URL(request.url).host,
    auth: {
      hasSession: Boolean(email),
      sessionEmail: email,
      nextAuthUrlHost: hostFromUrl(process.env.NEXTAUTH_URL),
      authUrlHost: hostFromUrl(process.env.AUTH_URL),
      adminEmailMatched: email ? adminEmails.has(email) : false,
      adminEmailsConfigured: adminEmails.size,
      bootstrapAdminPasswordConfigured: Boolean(
        process.env.ADMIN_PASSWORD || process.env.ADMIN_LOGIN_CODE,
      ),
    },
    database: {
      configured: isDatabaseConfigured(),
      userFound: Boolean(dbUser),
      userRole: email && adminEmails.has(email) ? "admin" : (dbUser?.role ?? null),
      clientAccessCount,
    },
  });
}
