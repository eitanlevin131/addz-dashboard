import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientUsers, users } from "@/lib/schema";
import { authOptions } from "./options";

export type AccessContext = {
  userId: string;
  email: string;
  role: string;
  clientIds: string[] | null;
};

export function isAdminRole(role: string) {
  return role === "admin" || role === "agency";
}

export async function getAccessContext(): Promise<
  | { ok: true; access: AccessContext }
  | { ok: false; response: NextResponse }
> {
  if (!isDatabaseConfigured() || process.env.AUTH_DEV_BYPASS === "true") {
    return {
      ok: true,
      access: {
        userId: "dev-admin",
        email: "dev@local",
        role: "admin",
        clientIds: null,
      },
    };
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "צריך להתחבר כדי לגשת לנתונים." },
        { status: 401 },
      ),
    };
  }

  const db = getDb();
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1).then((rows) => rows[0]);

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "המשתמש לא נמצא במערכת." },
        { status: 403 },
      ),
    };
  }

  if (isAdminRole(user.role)) {
    return {
      ok: true,
      access: {
        userId: user.id,
        email: user.email,
        role: user.role,
        clientIds: null,
      },
    };
  }

  const rows = await db.select().from(clientUsers).where(eq(clientUsers.userId, user.id));

  return {
    ok: true,
    access: {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientIds: rows.map((row) => row.clientId).filter(Boolean) as string[],
    },
  };
}

export async function requireAdmin() {
  const context = await getAccessContext();
  if (!context.ok) return context;

  if (!isAdminRole(context.access.role)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: "רק אדמין יכול לבצע את הפעולה הזו." },
        { status: 403 },
      ),
    };
  }

  return context;
}

export function canAccessClient(access: AccessContext, clientId: string) {
  return isAdminRole(access.role) || access.clientIds?.includes(clientId);
}

export function assertClientAccess(access: AccessContext, clientId: string) {
  if (canAccessClient(access, clientId)) return null;

  return NextResponse.json(
    { success: false, message: "אין הרשאה ללקוח הזה." },
    { status: 403 },
  );
}

