import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/access";
import { decryptSecret } from "@/lib/crypto";
import {
  automationReports,
  emailReports,
  flashyAccounts,
  smsReports,
} from "@/lib/demo-data";
import { getFlashyReports, monthWindows, validateFlashyAccount } from "@/lib/flashy";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  automationReports as automationReportsTable,
  emailCampaignReports,
  flashyAccounts as flashyAccountsTable,
  smsCampaignReports,
  syncRuns,
} from "@/lib/schema";
import {
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  type RawFlashyRow,
} from "@/lib/flashy-normalize";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const account = flashyAccounts.find((item) => item.id === accountId);

  if (isDatabaseConfigured()) {
    const adminContext = await requireAdmin();
    if (!adminContext.ok) return adminContext.response;

    if (!apiKey && accountId) {
      return syncPersistedAccount(accountId, startedAt);
    }
  }

  if (!account) {
    return NextResponse.json(
      { success: false, message: "חשבון Flashy לא נמצא" },
      { status: 404 },
    );
  }

  if (apiKey) {
    try {
      const accountResponse = await validateFlashyAccount(apiKey);
      const to = Math.floor(Date.now() / 1000);
      const from = to - 60 * 60 * 24 * 30;
      const reports = await getFlashyReports(apiKey, from, to);
      const failedChecks = reports.checks.filter((check) => !check.ok);
      const imported = {
        emailCampaigns: reports.emails.length,
        smsCampaigns: reports.sms.length,
        automations: reports.automations.length,
      };

      return NextResponse.json({
        success: true,
        mode: "live-dry-run",
        hasWarnings: failedChecks.length > 0,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        account: accountResponse.data,
        imported,
        checks: [
          {
            label: "חשבון",
            path: "/account",
            ok: true,
            count: 1,
          },
          ...reports.checks,
        ],
        samples: {
          email: reports.emails[0] ?? null,
          sms: reports.sms[0] ?? null,
          automation: reports.automations[0] ?? null,
        },
        reports: {
          emails: reports.emails,
          sms: reports.sms,
          automations: reports.automations,
        },
        summary: failedChecks.length
          ? `החיבור תקין חלקית: ${failedChecks.length} בדיקות דורשות טיפול.`
          : `החיבור תקין: יובאו ${imported.emailCampaigns + imported.smsCampaigns + imported.automations} רשומות.`,
        syncPlan: buildSyncPlan(),
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Flashy API validation failed",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    mode: "demo",
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    account,
    syncPlan: buildSyncPlan(),
    imported: {
      emailCampaigns: emailReports.filter((item) => item.accountId === account.id).length,
      smsCampaigns: smsReports.filter((item) => item.accountId === account.id).length,
      automations: automationReports.filter((item) => item.accountId === account.id).length,
    },
  });
}

async function syncPersistedAccount(accountId: string, startedAt: number) {
  const db = getDb();
  const account = await db
    .select()
    .from(flashyAccountsTable)
    .where(eq(flashyAccountsTable.id, accountId))
    .then((rows) => rows[0]);

  if (!account) {
    return NextResponse.json(
      { success: false, message: "חשבון Flashy לא נמצא ב-Neon." },
      { status: 404 },
    );
  }

  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      flashyAccountId: account.id,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const apiKey = decryptSecret(account.encryptedApiKey);
    const to = Math.floor(Date.now() / 1000);
    const from = to - 60 * 60 * 24 * 90;
    const accountResponse = await validateFlashyAccount(apiKey);
    const reports = await getFlashyReports(apiKey, from, to);
    const failedReports = reports.checks.filter((check) => !check.ok);
    if (failedReports.length) {
      throw new Error(`סנכרון נכשל: ${failedReports.map((check) => `${check.label}: ${check.message}`).join("; ")}`);
    }
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
        .onConflictDoUpdate({
          target: [
            emailCampaignReports.flashyAccountId,
            emailCampaignReports.campaignId,
            emailCampaignReports.sentAt,
          ],
          set: {
            campaignName: sql`excluded.campaign_name`,
            subjectLine: sql`excluded.subject_line`,
            totalRecipients: sql`excluded.total_recipients`,
            totalDelivered: sql`excluded.total_delivered`,
            totalOpens: sql`excluded.total_opens`,
            totalClicks: sql`excluded.total_clicks`,
            purchases: sql`excluded.purchases`,
            revenueGenerated: sql`excluded.revenue_generated`,
            raw: sql`excluded.raw`,
          },
        });
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
        .onConflictDoUpdate({
          target: [
            smsCampaignReports.flashyAccountId,
            smsCampaignReports.campaignId,
            smsCampaignReports.sentAt,
          ],
          set: {
            campaignName: sql`excluded.campaign_name`,
            totalRecipients: sql`excluded.total_recipients`,
            totalDelivered: sql`excluded.total_delivered`,
            totalClicks: sql`excluded.total_clicks`,
            purchases: sql`excluded.purchases`,
            revenueGenerated: sql`excluded.revenue_generated`,
            raw: sql`excluded.raw`,
          },
        });
    }

    if (normalizedAutomations.length) {
      await db
        .insert(automationReportsTable)
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
        .onConflictDoUpdate({
          target: [
            automationReportsTable.flashyAccountId,
            automationReportsTable.automationId,
            automationReportsTable.reportDate,
            automationReportsTable.channel,
          ],
          set: {
            automationName: sql`excluded.automation_name`,
            totalRecipients: sql`excluded.total_recipients`,
            totalDelivered: sql`excluded.total_delivered`,
            totalOpens: sql`excluded.total_opens`,
            totalClicks: sql`excluded.total_clicks`,
            sentEmails: sql`excluded.sent_emails`,
            openedEmails: sql`excluded.opened_emails`,
            clickedEmails: sql`excluded.clicked_emails`,
            sentSms: sql`excluded.sent_sms`,
            clickedSms: sql`excluded.clicked_sms`,
            totalEntered: sql`excluded.total_entered`,
            totalCompleted: sql`excluded.total_completed`,
            failedMessages: sql`excluded.failed_messages`,
            purchases: sql`excluded.purchases`,
            revenueGenerated: sql`excluded.revenue_generated`,
            raw: sql`excluded.raw`,
          },
        });
    }

    await Promise.all([
      db
        .update(flashyAccountsTable)
        .set({
          flashyAccountId: accountResponse.data.id,
          name: accountResponse.data.name || accountResponse.data.account || account.name,
          website: accountResponse.data.website || account.website,
          currency: accountResponse.data.currency || account.currency,
          timezone: accountResponse.data.timezone || account.timezone,
          lastSyncAt: new Date(),
        })
        .where(eq(flashyAccountsTable.id, account.id)),
      db
        .update(syncRuns)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(syncRuns.id, syncRun.id)),
    ]);

    const failedChecks = reports.checks.filter((check) => !check.ok);

    return NextResponse.json({
      success: true,
      mode: "persisted-account-sync",
      hasWarnings: failedChecks.length > 0,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      account: accountResponse.data,
      checks: reports.checks,
      imported: {
        emailCampaigns: normalizedEmails.length,
        smsCampaigns: normalizedSms.length,
        automations: normalizedAutomations.length,
      },
      message: failedChecks.length
        ? `הסנכרון הסתיים עם ${failedChecks.length} אזהרות.`
        : "הסנכרון הסתיים בהצלחה.",
    });
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown sync error",
      })
      .where(eq(syncRuns.id, syncRun.id));

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "סנכרון Flashy נכשל.",
      },
      { status: 400 },
    );
  }
}

function buildSyncPlan() {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);

  return {
    endpoints: ["/account", "/reports/emails", "/reports/sms", "/reports/automations"],
    automationWindows: monthWindows(from, to),
    strategy: "upsert by account + remote id + date",
  };
}
