import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, users, websiteScans } from "@/lib/schema";
import { notificationClaimable, notificationRecipient, websiteScanEmail, websiteScanLink, websiteScanEmailEnabled, type ScanNotification } from "./notification-core";

async function deliver(scanId: string) {
  const db = getDb();
  const [scan] = await db.select().from(websiteScans).where(eq(websiteScans.id, scanId));
  if (!scan || !["completed", "completed_with_warnings", "failed"].includes(scan.status) || !notificationClaimable(scan.state.notification, scan.completedAt)) return;
  const notification: ScanNotification = { status: "sending", attempts: scan.state.notification!.attempts + 1, token: crypto.randomUUID(), leaseUntil: Date.now() + 30000 };
  // CAS the outbox separately from scan processing; terminal results stay immutable.
  const { rows } = await db.execute(sql`update website_scans set state=jsonb_set(state,'{notification}',${JSON.stringify(notification)}::jsonb)
    where id=${scanId}::uuid and status in ('completed','completed_with_warnings','failed')
    and state->'notification'=${JSON.stringify(scan.state.notification)}::jsonb returning id`);
  if (!rows.length) return;
  const save = (value: ScanNotification) => db.execute(sql`update website_scans set state=jsonb_set(state,'{notification}',${JSON.stringify(value)}::jsonb)
    where id=${scanId}::uuid and state->'notification'->>'token'=${notification.token}`);
  const attempts = notification.attempts;
  try {
    // Preview must never send through a shared/live email provider.
    if (!websiteScanEmailEnabled(process.env)) {
      await save({ status: "disabled", attempts }); return;
    }
    const [user] = scan.requestedBy ? await db.select({ email: users.email, role: users.role, status: users.status }).from(users).where(eq(users.id, scan.requestedBy)) : [];
    const to = notificationRecipient(user);
    if (!to) { await save({ status: "skipped", attempts }); return; }
    const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, scan.clientId));
    if (!client) { await save({ status: "skipped", attempts }); return; }
    const origin = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
    if (!origin) { await save({ status: "disabled", attempts, errorCode: "missing_application_url" }); return; }
    const content = websiteScanEmail(client.name, scan.status, websiteScanLink(origin, scan.clientId, scan.id));
    const base = process.env.RESEND_API_BASE_URL?.replace(/\/$/, "") || "https://api.resend.com";
    const response = await fetch(`${base}/emails`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000), redirect: "error",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": `website-scan-${scan.id}-${scan.status}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], ...content }),
    });
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!response.ok || typeof result?.id !== "string") throw Error("delivery_failed");
    await save({ status: "sent", attempts, sentAt: new Date().toISOString() });
  } catch {
    await save({ status: "failed", attempts, retryAt: Date.now() + 60000, errorCode: "delivery_failed" });
  }
}

export async function notifyScanRequester(scanId: string) {
  try { await deliver(scanId); } catch { /* An email/DB delivery error must not fail or overwrite a completed scan. */ }
}
