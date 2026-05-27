import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/access";
import { encryptSecret } from "@/lib/crypto";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { getFlashyReports, validateFlashyAccount } from "@/lib/flashy";
import {
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  type RawFlashyRow,
} from "@/lib/flashy-normalize";
import {
  automationReports,
  clientUsers,
  clients,
  emailCampaignReports,
  flashyAccounts,
  smsCampaignReports,
  syncRuns,
  users,
} from "@/lib/schema";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        success: false,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Neon עדיין לא מחובר. הוסף DATABASE_URL ל-.env.local והריץ migration.",
      },
      { status: 409 },
    );
  }

  const adminContext = await requireAdmin();
  if (!adminContext.ok) return adminContext.response;

  const apiKey = String(body.apiKey ?? "").trim();
  const clientName = String(body.clientName ?? "").trim();
  const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
  if (!apiKey || !clientName) {
    return NextResponse.json(
      { success: false, message: "חסרים שם לקוח או API key." },
      { status: 400 },
    );
  }

  const flashyAccount = await validateFlashyAccount(apiKey).then((response) => response.data);
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 30;
  const reports = await getFlashyReports(apiKey, from, to);

  const db = getDb();
  const [client] = await db
    .insert(clients)
    .values({
      name: clientName,
      owner: clientEmail || null,
      industry: "לקוח Flashy חי",
      visibleModules: ["reports", "planner", "ai"],
    })
    .returning();

  let userId: string | null = null;
  if (clientEmail) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, clientEmail))
      .then((rows) => rows[0]);

    const user =
      existingUser ??
      (await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: clientEmail,
          name: clientName,
          role: "client",
        })
        .returning()
        .then((rows) => rows[0]));

    userId = user.id;
    await db
      .insert(clientUsers)
      .values({ clientId: client.id, userId })
      .onConflictDoNothing();
  }

  const [account] = await db
    .insert(flashyAccounts)
    .values({
      clientId: client.id,
      flashyAccountId: flashyAccount.id,
      name: flashyAccount.name || flashyAccount.account || clientName,
      website: flashyAccount.website || null,
      currency: flashyAccount.currency || "ILS",
      timezone: flashyAccount.timezone || "Asia/Jerusalem",
      encryptedApiKey: encryptSecret(apiKey),
      usdIlsRate: String(Number(body.usdIlsRate) || 3.7),
      smsCreditPriceUsd: String(Number(body.smsCreditPriceUsd) || 0),
      monthlySubscriptionCostUsd: String(Number(body.monthlySubscriptionCostUsd) || 0),
      agencyRetainerCostIls: String(Number(body.agencyRetainerCostIls) || 0),
      active: true,
      lastSyncAt: new Date(),
    })
    .returning();

  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      flashyAccountId: account.id,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const emailRows = reports.emails as RawFlashyRow[];
    const smsRows = reports.sms as RawFlashyRow[];
    const automationRows = reports.automations as RawFlashyRow[];
    const normalizedEmails = normalizeEmailReports(emailRows, account.id);
    const normalizedSms = normalizeSmsReports(smsRows, account.id);
    const normalizedAutomations = normalizeAutomationReports(automationRows, account.id);

    if (normalizedEmails.length) {
      await db
        .insert(emailCampaignReports)
        .values(
          normalizedEmails.map((report, index) => ({
            flashyAccountId: account.id,
            campaignId: report.campaignId,
            sentAt: new Date(report.sentAt),
            campaignName: report.campaignName,
            subjectLine: report.subjectLine,
            totalRecipients: report.totalRecipients,
            totalDelivered: report.totalDelivered,
            totalOpens: report.totalOpens,
            totalClicks: report.totalClicks,
            purchases: report.purchases,
            revenueGenerated: String(report.revenueGenerated),
            raw: emailRows[index] ?? {},
          })),
        )
        .onConflictDoNothing();
    }

    if (normalizedSms.length) {
      await db
        .insert(smsCampaignReports)
        .values(
          normalizedSms.map((report, index) => ({
            flashyAccountId: account.id,
            campaignId: report.campaignId,
            sentAt: new Date(report.sentAt),
            campaignName: report.campaignName,
            totalRecipients: report.totalRecipients,
            totalDelivered: report.totalDelivered,
            totalClicks: report.totalClicks,
            purchases: report.purchases,
            revenueGenerated: String(report.revenueGenerated),
            raw: smsRows[index] ?? {},
          })),
        )
        .onConflictDoNothing();
    }

    if (normalizedAutomations.length) {
      await db
        .insert(automationReports)
        .values(
          normalizedAutomations.map((report, index) => ({
            flashyAccountId: account.id,
            automationId: report.automationId,
            reportDate: report.date,
            automationName: report.automationName,
            channel: report.channel,
            totalRecipients: report.totalRecipients,
            totalDelivered: report.totalDelivered,
            totalOpens: report.totalOpens,
            totalClicks: report.totalClicks,
            sentEmails: report.sentEmails ?? 0,
            openedEmails: report.openedEmails ?? 0,
            clickedEmails: report.clickedEmails ?? 0,
            sentSms: report.sentSms ?? 0,
            clickedSms: report.clickedSms ?? 0,
            totalEntered: report.totalEntered ?? 0,
            totalCompleted: report.totalCompleted ?? 0,
            failedMessages: report.failedMessages ?? 0,
            purchases: report.purchases,
            revenueGenerated: String(report.revenueGenerated),
            raw: automationRows[index] ?? {},
          })),
        )
        .onConflictDoNothing();
    }

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, syncRun.id));
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown sync error",
      })
      .where(eq(syncRuns.id, syncRun.id));

    throw error;
  }

  return NextResponse.json({
    success: true,
    data: {
      clientId: client.id,
      accountId: account.id,
      userId,
      imported: {
        emailCampaigns: reports.emails.length,
        smsCampaigns: reports.sms.length,
        automations: reports.automations.length,
      },
    },
  });
}
