import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { buildMonthlySummaryEmailHtml, withMonthlySummaryShareLink } from "@/lib/monthly-summary";
import { monthlySummaries, monthlySummaryDeliveries } from "@/lib/schema";

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request, context: RouteContext<"/api/monthly-summaries/[id]/send">) {
  const authorization = await requireAdmin();
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  const db = getDb();
  const row = await db.select().from(monthlySummaries).where(eq(monthlySummaries.id, id)).limit(1).then((rows) => rows[0]);
  if (!row) return NextResponse.json({ success: false, message: "הסיכום לא נמצא." }, { status: 404 });
  const denied = assertClientAccess(authorization.access, row.clientId);
  if (denied) return denied;
  if (row.status !== "approved" && row.status !== "sent") {
    return NextResponse.json({ success: false, message: "צריך לאשר את הסיכום לפני שליחה." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  const recipients: string[] = [...new Set<string>((Array.isArray(body.recipients) ? body.recipients : [])
    .map((value: unknown) => String(value).trim().toLowerCase())
    .filter(validEmail) as string[])].slice(0, 10);
  if (!recipients.length) return NextResponse.json({ success: false, message: "צריך להזין כתובת מייל תקינה." }, { status: 400 });
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return NextResponse.json({ success: false, message: "RESEND_API_KEY או EMAIL_FROM לא מוגדרים." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const shareUrl = `${origin}/summaries/${row.id}`;
  const note = String(body.note ?? "").trim().slice(0, 2000);
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const baseUrl = process.env.RESEND_API_BASE_URL?.trim() || "https://api.resend.com";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: row.emailSubject,
        text: withMonthlySummaryShareLink(row.whatsappText, shareUrl),
        html: buildMonthlySummaryEmailHtml(row.snapshot, shareUrl, note),
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok || !payload?.id) throw new Error(payload?.message || `Resend returned ${response.status}`);
    providerMessageId = payload.id;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "שליחת המייל נכשלה.";
  }
  const now = new Date();
  await db.insert(monthlySummaryDeliveries).values({
    monthlySummaryId: id,
    recipients,
    providerMessageId,
    status: errorMessage ? "failed" : "sent",
    errorMessage,
    sentByUserId: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
    sentAt: errorMessage ? null : now,
  });
  if (errorMessage) {
    await recordAudit({ actorUserId: authorization.access.userId, action: "monthly_summary.send_failed", entityType: "monthly_summary", entityId: id, metadata: { recipients, errorMessage } });
    return NextResponse.json({ success: false, message: `השליחה נכשלה: ${errorMessage}` }, { status: 502 });
  }
  await db.update(monthlySummaries).set({ status: "sent", sentAt: now, updatedAt: now }).where(eq(monthlySummaries.id, id));
  await recordAudit({ actorUserId: authorization.access.userId, action: "monthly_summary.sent", entityType: "monthly_summary", entityId: id, metadata: { recipients, providerMessageId } });
  return NextResponse.json({ success: true, data: { providerMessageId, recipients, sentAt: now.toISOString() } });
}
