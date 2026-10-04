import { getDb, isDatabaseConfigured } from "@/lib/db";
import { auditLogs } from "@/lib/schema";

export function auditInsert(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  clientId?: string | null;
  actorType?: "user" | "client" | "ai" | "system";
}) {
  return getDb().insert(auditLogs).values({
    actorUserId: input.actorUserId && input.actorUserId !== "dev-admin" ? input.actorUserId : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    clientId: input.clientId ?? null,
    actorType: input.actorType ?? null,
  });
}

export async function recordAudit(input: Parameters<typeof auditInsert>[0]) {
  if (!isDatabaseConfigured()) return;
  await auditInsert(input);
}
