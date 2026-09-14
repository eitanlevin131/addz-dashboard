import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { auditLogs, users } from "@/lib/schema";

export async function GET() {
  const context = await requireOwner();
  if (!context.ok) return context.response;
  const rows = await getDb().select({
    id: auditLogs.id,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
    actorName: users.name,
    actorEmail: users.email,
  }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(100);

  return NextResponse.json({ success: true, data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) });
}
