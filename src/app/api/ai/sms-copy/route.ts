import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { askOpenAiSmsCopy, getConfiguredOpenAiModel, type AiAccountMemory, type SmsCopyBrief } from "@/lib/ai";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { aiAccountMemory, flashyAccounts, smsCampaignReports } from "@/lib/schema";

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = text(body.clientId, 80);
  const accountId = text(body.accountId, 80);
  const brief: SmsCopyBrief = {
    objective: text(body.objective, 500),
    audience: text(body.audience, 500),
    offer: text(body.offer, 800),
    mustInclude: text(body.mustInclude, 500),
  };

  if (!clientId || !accountId || !brief.objective || !brief.audience || !brief.offer) {
    return NextResponse.json({ success: false, message: "צריך למלא מטרה, קהל והצעה לפני יצירת הטיוטות." }, { status: 400 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "יצירת SMS דורשת חיבור למסד הנתונים." }, { status: 503 });
  }

  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const denied = assertClientAccess(access.access, clientId);
  if (denied) return denied;

  const db = getDb();
  const [account] = await db
    .select()
    .from(flashyAccounts)
    .where(and(eq(flashyAccounts.id, accountId), eq(flashyAccounts.clientId, clientId)))
    .limit(1);
  if (!account) {
    return NextResponse.json({ success: false, message: "חשבון Flashy לא נמצא או אינו משויך ללקוח הזה." }, { status: 404 });
  }

  const [memoryRow, reportRows] = await Promise.all([
    db.select().from(aiAccountMemory).where(eq(aiAccountMemory.clientId, clientId)).limit(1),
    db
      .select()
      .from(smsCampaignReports)
      .where(eq(smsCampaignReports.flashyAccountId, accountId))
      .orderBy(desc(smsCampaignReports.sentAt))
      .limit(160),
  ]);
  const memory: AiAccountMemory = memoryRow[0]
    ? {
        brandVoice: memoryRow[0].brandVoice ?? "",
        audiences: memoryRow[0].audiences ?? "",
        products: memoryRow[0].products ?? "",
        learnings: memoryRow[0].learnings ?? "",
        constraints: memoryRow[0].constraints ?? "",
        documents: memoryRow[0].documents ?? [],
      }
    : {};
  const smsCost = Number(account.smsCreditPriceUsd) * Number(account.usdIlsRate);
  const examples = reportRows
    .map((report) => {
      const raw = report.raw as Record<string, unknown>;
      const message = text(raw.campaign_message, 600);
      const revenue = Number(report.revenueGenerated) || 0;
      const cost = report.totalRecipients * smsCost;
      return {
        campaignId: report.campaignId,
        name: report.campaignName ?? `SMS ${report.campaignId}`,
        message,
        revenue,
        purchases: report.purchases,
        roas: cost > 0 ? revenue / cost : null,
      };
    })
    .filter((item) => item.message)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue)
    .slice(0, 12);

  if (!examples.length) {
    return NextResponse.json({ success: false, message: "לא נמצאו טקסטים היסטוריים בחשבון הזה. בצע סנכרון ונסה שוב." }, { status: 409 });
  }

  try {
    const result = await askOpenAiSmsCopy({ accountName: account.name, brief, memory, examples });
    if (!result) {
      return NextResponse.json({ success: false, message: "OPENAI_API_KEY לא מוגדר בשרת." }, { status: 503 });
    }
    return NextResponse.json({
      success: true,
      provider: "openai",
      model: getConfiguredOpenAiModel(),
      evidence: examples.map(({ campaignId, name, revenue, purchases, roas }) => ({ campaignId, name, revenue, purchases, roas })),
      ...result,
    });
  } catch (error) {
    console.error("Failed to generate SMS copy", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "יצירת טיוטות SMS נכשלה." }, { status: 502 });
  }
}
