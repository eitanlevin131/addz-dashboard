import { and, eq, gt, gte, lt, ne, or, sql } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import {
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  type RawFlashyRow,
} from "@/lib/flashy-normalize";
import {
  FlashyApiError,
  getFlashyReports,
  validateFlashyAccount,
} from "@/lib/flashy";
import {
  automationReports,
  auditLogs,
  emailCampaignReports,
  flashyAccounts,
  smsCampaignReports,
  syncRuns,
} from "@/lib/schema";
import {
  getRetryDelayMs,
  isTransientSyncStatus,
  SYNC_LOCK_TIMEOUT_MS,
  validateSyncCompleteness,
} from "@/lib/sync-policy";
import { persistAutomaticPlannerMatches } from "@/lib/planner-persistence";

const DEFAULT_MAX_ATTEMPTS = 3;

type SyncSource = "manual" | "cron" | "onboarding" | "system";

type ReportCheck = {
  label: string;
  path: string;
  ok: boolean;
  count?: number;
  status?: number | null;
  message?: string;
};

export type PersistedSyncResult = {
  success: true;
  skipped: boolean;
  accountId: string;
  accountName: string;
  source: SyncSource;
  checkedAt: string;
  durationMs: number;
  imported: {
    emailCampaigns: number;
    smsCampaigns: number;
    automations: number;
  };
  attempts: {
    account: number;
    reports: number;
  };
  completeness: ReturnType<typeof validateSyncCompleteness> | null;
  checks: ReportCheck[];
  plannerMatchesSaved: number;
  message: string;
};

async function recordSyncAudit(input: {
  accountId: string;
  actorUserId?: string | null;
  action: "completed" | "failed" | "skipped";
  metadata: Record<string, unknown>;
}) {
  try {
    await getDb().insert(auditLogs).values({
      actorUserId: input.actorUserId && input.actorUserId !== "dev-admin" ? input.actorUserId : null,
      action: `flashy.sync.${input.action}`,
      entityType: "flashy_account",
      entityId: input.accountId,
      metadata: input.metadata,
    });
  } catch (error) {
    console.error("Failed to record Flashy sync audit", error);
  }
}

export class PersistedSyncError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PersistedSyncError";
    this.status = status;
  }
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withTransientRetry<T>(operation: () => Promise<T>, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      const status = error instanceof FlashyApiError ? error.status : null;
      if (attempt >= maxAttempts || !isTransientSyncStatus(status)) throw error;
      await wait(getRetryDelayMs(attempt));
    }
  }
  throw new Error("Retry loop exhausted");
}

async function getReportsWithRetry(apiKey: string, from: number, to: number) {
  let attempt = 0;
  while (attempt < DEFAULT_MAX_ATTEMPTS) {
    attempt += 1;
    const reports = await getFlashyReports(apiKey, from, to);
    const failed = reports.checks.filter((check) => !check.ok);
    if (!failed.length) return { reports, attempts: attempt };

    const canRetry = failed.every((check) => isTransientSyncStatus(check.status));
    if (attempt >= DEFAULT_MAX_ATTEMPTS || !canRetry) return { reports, attempts: attempt };
    await wait(getRetryDelayMs(attempt));
  }
  throw new Error("Report retry loop exhausted");
}

async function getPersistedReportVolume(accountId: string, fromDate: Date) {
  const db = getDb();
  const fromDay = fromDate.toISOString().slice(0, 10);
  const [emails, sms, automations] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(emailCampaignReports)
      .where(
        and(
          eq(emailCampaignReports.flashyAccountId, accountId),
          gte(emailCampaignReports.sentAt, fromDate),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(smsCampaignReports)
      .where(
        and(
          eq(smsCampaignReports.flashyAccountId, accountId),
          gte(smsCampaignReports.sentAt, fromDate),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(automationReports)
      .where(
        and(
          eq(automationReports.flashyAccountId, accountId),
          gte(automationReports.reportDate, fromDay),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
  ]);

  return { emails, sms, automations };
}

async function acquireSyncLease(accountId: string) {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SYNC_LOCK_TIMEOUT_MS);

  await db
    .update(syncRuns)
    .set({
      status: "failed",
      finishedAt: now,
      errorMessage: "ריצת הסנכרון נעצרה לפני שהסתיימה.",
    })
    .where(
      and(
        eq(syncRuns.flashyAccountId, accountId),
        eq(syncRuns.status, "running"),
        lt(syncRuns.startedAt, staleBefore),
      ),
    );

  const activeRun = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.flashyAccountId, accountId),
        eq(syncRuns.status, "running"),
        gt(syncRuns.startedAt, staleBefore),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (activeRun) return null;

  const [updatedLease] = await db
    .update(syncRuns)
    .set({
      flashyAccountId: accountId,
      status: "running",
      startedAt: now,
      finishedAt: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(syncRuns.id, accountId),
        or(ne(syncRuns.status, "running"), lt(syncRuns.startedAt, staleBefore)),
      ),
    )
    .returning();

  if (updatedLease) return updatedLease;

  const [insertedLease] = await db
    .insert(syncRuns)
    .values({
      id: accountId,
      flashyAccountId: accountId,
      status: "running",
      startedAt: now,
    })
    .onConflictDoNothing({ target: syncRuns.id })
    .returning();

  return insertedLease ?? null;
}

export async function syncPersistedFlashyAccount(
  accountId: string,
  options: {
    lookbackDays?: number;
    startedAt?: number;
    source?: SyncSource;
    actorUserId?: string | null;
  } = {},
): Promise<PersistedSyncResult> {
  const startedAt = options.startedAt ?? Date.now();
  const lookbackDays = options.lookbackDays ?? 120;
  const source = options.source ?? "system";
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 365) {
    throw new PersistedSyncError("טווח סנכרון לא תקין", 400);
  }

  const db = getDb();
  const account = await db
    .select()
    .from(flashyAccounts)
    .where(eq(flashyAccounts.id, accountId))
    .then((rows) => rows[0]);

  if (!account) throw new PersistedSyncError("חשבון Flashy לא נמצא ב-Neon.", 404);
  if (!account.active) throw new PersistedSyncError("חשבון Flashy אינו פעיל.", 409);

  const syncRun = await acquireSyncLease(account.id);
  if (!syncRun) {
    const checkedAt = new Date().toISOString();
    await recordSyncAudit({
      accountId: account.id,
      actorUserId: options.actorUserId,
      action: "skipped",
      metadata: {
        status: "skipped",
        source,
        startedAt: new Date(startedAt).toISOString(),
        checkedAt,
        durationMs: Date.now() - startedAt,
        lookbackDays,
        imported: { emailCampaigns: 0, smsCampaigns: 0, automations: 0 },
        checks: [],
        warnings: [],
        message: "סנכרון אחר כבר פעיל עבור החשבון.",
      },
    });
    return {
      success: true,
      skipped: true,
      accountId: account.id,
      accountName: account.name,
      source,
      checkedAt,
      durationMs: Date.now() - startedAt,
      imported: { emailCampaigns: 0, smsCampaigns: 0, automations: 0 },
      attempts: { account: 0, reports: 0 },
      completeness: null,
      checks: [],
      plannerMatchesSaved: 0,
      message: "סנכרון אחר כבר פעיל עבור החשבון.",
    };
  }

  let latestChecks: ReportCheck[] = [];
  let latestCompleteness: ReturnType<typeof validateSyncCompleteness> | null = null;
  let latestImported = { emailCampaigns: 0, smsCampaigns: 0, automations: 0 };

  try {
    const apiKey = decryptSecret(account.encryptedApiKey);
    const to = Math.floor(Date.now() / 1000);
    const from = to - 60 * 60 * 24 * lookbackDays;
    const accountAttempt = await withTransientRetry(() => validateFlashyAccount(apiKey));
    const reportAttempt = await getReportsWithRetry(apiKey, from, to);
    const accountResponse = accountAttempt.value;
    const reports = reportAttempt.reports;
    const emailRows = reports.emails as RawFlashyRow[];
    const smsRows = reports.sms as RawFlashyRow[];
    const automationRows = reports.automations as RawFlashyRow[];
    const timezone = accountResponse.data.timezone || account.timezone;
    const normalizedEmails = normalizeEmailReports(emailRows, account.id, timezone);
    const normalizedSms = normalizeSmsReports(smsRows, account.id, timezone);
    const normalizedAutomations = normalizeAutomationReports(automationRows, account.id);
    const fromDate = new Date(from * 1000);
    const previousVolume = await getPersistedReportVolume(account.id, fromDate);
    const completeness = validateSyncCompleteness({
      checks: reports.checks,
      raw: {
        emails: emailRows.length,
        sms: smsRows.length,
        automations: automationRows.length,
      },
      normalized: {
        emails: normalizedEmails.length,
        sms: normalizedSms.length,
        automations: normalizedAutomations.length,
      },
      previous: previousVolume,
    });
    latestChecks = reports.checks;
    latestCompleteness = completeness;
    latestImported = {
      emailCampaigns: normalizedEmails.length,
      smsCampaigns: normalizedSms.length,
      automations: normalizedAutomations.length,
    };

    if (!completeness.complete) {
      throw new Error(`סנכרון נכשל בבדיקת שלמות: ${completeness.issues.join("; ")}`);
    }

    if (normalizedEmails.length) {
      await db
        .insert(emailCampaignReports)
        .values(normalizedEmails.map((report, index) => ({
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
          raw: { ...emailRows[index], _syncStartedAt: syncRun.startedAt.getTime() },
        })))
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
        .values(normalizedSms.map((report, index) => ({
          flashyAccountId: account.id,
          campaignId: report.campaignId,
          sentAt: new Date(report.sentAt),
          campaignName: report.campaignName,
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          totalClicks: report.totalClicks,
          purchases: report.purchases,
          revenueGenerated: String(report.revenueGenerated),
          raw: { ...smsRows[index], _syncStartedAt: syncRun.startedAt.getTime() },
        })))
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
        .insert(automationReports)
        .values(normalizedAutomations.map((report, index) => ({
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
          raw: { ...automationRows[index], _syncStartedAt: syncRun.startedAt.getTime() },
        })))
        .onConflictDoUpdate({
          target: [
            automationReports.flashyAccountId,
            automationReports.automationId,
            automationReports.reportDate,
            automationReports.channel,
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

    const plannerMatchesSaved = await persistAutomaticPlannerMatches({
      accountId: account.id,
      timezone,
      emails: normalizedEmails,
      sms: normalizedSms,
    });
    const finishedAt = new Date();
    await Promise.all([
      db
        .update(flashyAccounts)
        .set({
          flashyAccountId: accountResponse.data.id,
          name: accountResponse.data.name || accountResponse.data.account || account.name,
          website: accountResponse.data.website || account.website,
          currency: accountResponse.data.currency || account.currency,
          timezone,
          lastSyncAt: finishedAt,
        })
        .where(eq(flashyAccounts.id, account.id)),
      db
        .update(syncRuns)
        .set({ status: "success", finishedAt, errorMessage: null })
        .where(eq(syncRuns.id, syncRun.id)),
    ]);

    const durationMs = Date.now() - startedAt;
    const message = completeness.warnings.length
      ? "הסנכרון הסתיים, אך נמצאה חריגה בנפח הנתונים שדורשת בדיקה."
      : "הסנכרון הסתיים בהצלחה וכל בדיקות השלמות עברו.";
    await recordSyncAudit({
      accountId: account.id,
      actorUserId: options.actorUserId,
      action: "completed",
      metadata: {
        status: completeness.warnings.length ? "warning" : "success",
        source,
        startedAt: new Date(startedAt).toISOString(),
        checkedAt: finishedAt.toISOString(),
        durationMs,
        lookbackDays,
        imported: latestImported,
        checks: latestChecks,
        warnings: completeness.warnings,
        plannerMatchesSaved,
        message,
      },
    });

    return {
      success: true,
      skipped: false,
      accountId: account.id,
      accountName: account.name,
      source,
      checkedAt: finishedAt.toISOString(),
      durationMs,
      imported: latestImported,
      attempts: { account: accountAttempt.attempts, reports: reportAttempt.attempts },
      completeness,
      checks: reports.checks,
      plannerMatchesSaved,
      message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "סנכרון Flashy נכשל.";
    const finishedAt = new Date();
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt, errorMessage: message })
      .where(eq(syncRuns.id, syncRun.id));
    await recordSyncAudit({
      accountId: account.id,
      actorUserId: options.actorUserId,
      action: "failed",
      metadata: {
        status: "failed",
        source,
        startedAt: new Date(startedAt).toISOString(),
        checkedAt: finishedAt.toISOString(),
        durationMs: Date.now() - startedAt,
        lookbackDays,
        imported: latestImported,
        checks: latestChecks,
        warnings: latestCompleteness?.warnings ?? [],
        message,
      },
    });
    throw new PersistedSyncError(message, 400);
  }
}
