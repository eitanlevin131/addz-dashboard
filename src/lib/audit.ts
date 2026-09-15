import { getDb, isDatabaseConfigured } from "@/lib/db";
import { auditLogs } from "@/lib/schema";

export async function recordAudit(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) return;

  await getDb().insert(auditLogs).values({
    actorUserId: input.actorUserId && input.actorUserId !== "dev-admin" ? input.actorUserId : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}
