import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { askOpenAiSubjectLines, getConfiguredOpenAiModel, type AiAccountMemory, type SubjectLineBrief } from "@/lib/ai";
import { assertClientAccess, requireAdmin } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { aiAccountMemory, emailCampaignReports, flashyAccounts } from "@/lib/schema";
import { buildSubjectLineEvidence } from "@/lib/subject-line-analysis";

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function rawNumber(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = text(body.clientId, 80);
  const accountId = text(body.accountId, 80);
  const tone = body.tone === "curious" || body.tone === "promotional" || body.tone === "brand" ? body.tone : "direct";
  const brief: SubjectLineBrief = {
    objective: text(body.objective, 500),
    audience: text(body.audience, 500),
    offer: text(body.offer, 800),
    mustInclude: text(body.mustInclude, 500),
    tone,
  };

  if (!clientId || !accountId || !brief.objective || !brief.audience || !brief.offer) {
    return NextResponse.json({ success: false, message: "צריך למלא מטרה, קהל והצעה לפני יצירת שורות הנושא." }, { status: 400 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "יצירת שורות נושא דורשת חיבור למסד הנתונים." }, { status: 503 });
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

  const [memoryRows, reports] = await Promise.all([
    db.select().from(aiAccountMemory).where(eq(aiAccountMemory.clientId, clientId)).limit(1),
    db
      .select()
      .from(emailCampaignReports)
      .where(eq(emailCampaignReports.flashyAccountId, accountId))
      .orderBy(desc(emailCampaignReports.sentAt))
      .limit(240),
  ]);
  const memoryRow = memoryRows[0];
  const memory: AiAccountMemory = memoryRow
    ? {
        brandVoice: memoryRow.brandVoice ?? "",
        audiences: memoryRow.audiences ?? "",
        products: memoryRow.products ?? "",
        learnings: memoryRow.learnings ?? "",
        constraints: memoryRow.constraints ?? "",
        documents: memoryRow.documents ?? [],
      }
    : {};
  const evidenceSet = buildSubjectLineEvidence(reports.map((report) => {
    const raw = report.raw as Record<string, unknown>;
    return {
      campaignId: report.campaignId,
      name: report.campaignName ?? `Email ${report.campaignId}`,
      subject: report.subjectLine ?? "",
      sentAt: report.sentAt.toISOString(),
      delivered: report.totalDelivered,
      opens: report.totalOpens,
      clicks: rawNumber(raw, ["unique_clicks", "total_clicks", "clicks"]) || report.totalClicks,
      purchases: report.purchases,
      revenue: Number(report.revenueGenerated) || 0,
    };
  }));

  if (evidenceSet.examples.length < 2) {
    return NextResponse.json({ success: false, message: "אין מספיק קמפייני אימייל עם שורות נושא ומדגם תקין בחשבון הזה." }, { status: 409 });
  }

  try {
    const result = await askOpenAiSubjectLines({ accountName: account.name, brief, memory, examples: evidenceSet.examples });
    if (!result) {
      return NextResponse.json({ success: false, message: "OPENAI_API_KEY לא מוגדר בשרת." }, { status: 503 });
    }
    return NextResponse.json({
      success: true,
      provider: "openai",
      model: getConfiguredOpenAiModel(),
      coverage: {
        totalCampaigns: evidenceSet.totalCampaigns,
        eligibleCampaigns: evidenceSet.eligibleCampaigns,
        minimumDelivered: evidenceSet.minimumDelivered,
      },
      evidence: evidenceSet.examples,
      ...result,
    });
  } catch (error) {
    console.error("Failed to generate subject lines", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "יצירת שורות הנושא נכשלה." }, { status: 502 });
  }
}
