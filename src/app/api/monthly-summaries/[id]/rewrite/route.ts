import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { askOpenAiMonthlySummaryCopy } from "@/lib/ai";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { withMonthlySummaryShareLink, withoutMonthlySummaryShareLink } from "@/lib/monthly-summary";
import { monthlySummaries } from "@/lib/schema";

export async function POST(request: Request, context: RouteContext<"/api/monthly-summaries/[id]/rewrite">) {
  const authorization = await requireAdmin();
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  const row = await getDb().select().from(monthlySummaries)
    .where(eq(monthlySummaries.id, id)).limit(1).then((rows) => rows[0]);
  if (!row) return NextResponse.json({ success: false, message: "הסיכום לא נמצא." }, { status: 404 });
  const denied = assertClientAccess(authorization.access, row.clientId);
  if (denied) return denied;
  if (row.status !== "draft") {
    return NextResponse.json({ success: false, message: "אפשר לשפר ניסוח רק לפני אישור הסיכום." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  const originalText = withoutMonthlySummaryShareLink(String(body.text ?? row.whatsappText)).slice(0, 30_000);
  try {
    const rewritten = await askOpenAiMonthlySummaryCopy({
      accountName: row.snapshot.accountName,
      originalText,
      facts: {
        totals: row.snapshot.totals,
        channels: {
          email: row.snapshot.emailCampaigns,
          sms: row.snapshot.smsCampaigns,
          automations: row.snapshot.automations,
        },
        leaders: row.snapshot.leaders,
        popup: row.snapshot.popup,
      },
    });
    if (!rewritten) return NextResponse.json({ success: false, message: "OPENAI_API_KEY לא מוגדר בשרת." }, { status: 503 });
    await recordAudit({ actorUserId: authorization.access.userId, action: "monthly_summary.copy_rewritten", entityType: "monthly_summary", entityId: id });
    const shareUrl = `${new URL(request.url).origin}/summaries/${id}`;
    return NextResponse.json({ success: true, data: { text: withMonthlySummaryShareLink(rewritten, shareUrl) } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "שיפור הנוסח נכשל." }, { status: 502 });
  }
}
