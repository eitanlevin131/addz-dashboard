import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, getAccessContext, isAdminRole, requireAdmin } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { withoutMonthlySummaryShareLink } from "@/lib/monthly-summary";
import { monthlySummaryResponse } from "@/lib/monthly-summary-service";
import { monthlySummaries, monthlySummaryDeliveries } from "@/lib/schema";

async function loadAuthorized(id: string, adminOnly = false) {
  const context = adminOnly ? await requireAdmin() : await getAccessContext();
  if (!context.ok) return context;
  const row = await getDb().select().from(monthlySummaries).where(eq(monthlySummaries.id, id)).limit(1).then((rows) => rows[0]);
  if (!row) return { ok: false as const, response: NextResponse.json({ success: false, message: "הסיכום לא נמצא." }, { status: 404 }) };
  const denied = assertClientAccess(context.access, row.clientId);
  if (denied) return { ok: false as const, response: denied };
  if (!isAdminRole(context.access.role) && row.status === "draft") {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "הסיכום עדיין לא אושר לצפייה." }, { status: 403 }) };
  }
  return { ok: true as const, access: context.access, row };
}

export async function GET(request: Request, context: RouteContext<"/api/monthly-summaries/[id]">) {
  const { id } = await context.params;
  const authorization = await loadAuthorized(id);
  if (!authorization.ok) return authorization.response;
  const deliveries = isAdminRole(authorization.access.role)
    ? await getDb().select().from(monthlySummaryDeliveries)
      .where(eq(monthlySummaryDeliveries.monthlySummaryId, id))
      .orderBy(desc(monthlySummaryDeliveries.createdAt))
    : [];
  return NextResponse.json({
    success: true,
    data: monthlySummaryResponse(authorization.row, new URL(request.url).origin),
    deliveries: deliveries.map((item) => ({
      id: item.id,
      recipients: item.recipients,
      status: item.status,
      errorMessage: item.errorMessage,
      sentAt: item.sentAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext<"/api/monthly-summaries/[id]">) {
  const { id } = await context.params;
  const authorization = await loadAuthorized(id, true);
  if (!authorization.ok) return authorization.response;
  const body = await request.json().catch(() => ({}));
  const now = new Date();
  if (body.action === "approve") {
    if (authorization.row.status !== "draft") {
      return NextResponse.json({ success: false, message: "רק טיוטה ניתנת לאישור." }, { status: 409 });
    }
    if (authorization.row.snapshot.completeness.missing.length > 0) {
      return NextResponse.json({
        success: false,
        message: `לפני האישור צריך להשלים: ${authorization.row.snapshot.completeness.missing.join(", ")}.`,
      }, { status: 409 });
    }
    if (authorization.row.snapshot.completeness.warnings.length > 0) {
      return NextResponse.json({
        success: false,
        message: `אי אפשר לאשר לפני בדיקת הנתונים: ${authorization.row.snapshot.completeness.warnings.join(" ")}`,
      }, { status: 409 });
    }
    const [saved] = await getDb().update(monthlySummaries).set({
      status: "approved",
      approvedByUserId: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
      approvedAt: now,
      updatedAt: now,
    }).where(eq(monthlySummaries.id, id)).returning();
    await recordAudit({ actorUserId: authorization.access.userId, action: "monthly_summary.approved", entityType: "monthly_summary", entityId: id });
    return NextResponse.json({ success: true, data: monthlySummaryResponse(saved, new URL(request.url).origin) });
  }
  if (body.action === "save") {
    if (authorization.row.status !== "draft") {
      return NextResponse.json({ success: false, message: "סיכום שאושר נעול לעריכה. אפשר ליצור גרסה חדשה." }, { status: 409 });
    }
    const whatsappText = withoutMonthlySummaryShareLink(String(body.whatsappText ?? "").trim()).slice(0, 30000);
    const emailSubject = String(body.emailSubject ?? authorization.row.emailSubject).trim().slice(0, 180);
    const internalNote = String(body.internalNote ?? "").trim().slice(0, 4000);
    if (!whatsappText) return NextResponse.json({ success: false, message: "נוסח WhatsApp לא יכול להיות ריק." }, { status: 400 });
    if (!emailSubject) return NextResponse.json({ success: false, message: "נושא המייל לא יכול להיות ריק." }, { status: 400 });
    const [saved] = await getDb().update(monthlySummaries).set({ whatsappText, emailSubject, internalNote: internalNote || null, updatedAt: now })
      .where(eq(monthlySummaries.id, id)).returning();
    await recordAudit({ actorUserId: authorization.access.userId, action: "monthly_summary.edited", entityType: "monthly_summary", entityId: id });
    return NextResponse.json({ success: true, data: monthlySummaryResponse(saved, new URL(request.url).origin) });
  }
  return NextResponse.json({ success: false, message: "פעולה לא מוכרת." }, { status: 400 });
}
