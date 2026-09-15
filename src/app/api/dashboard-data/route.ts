import { NextResponse } from "next/server";
import { asc, desc, like } from "drizzle-orm";
import { getAccessContext, isAdminRole, isOwnerRole } from "@/lib/auth/access";
import { isOwnerEmail } from "@/lib/auth/owner";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { mapNewsletterPlanRow } from "@/lib/newsletter-plan";
import { latestCampaignReports, latestAutomationReports } from "@/lib/report-identity";
import {
  automationReports,
  auditLogs,
  clients,
  emailCampaignReports,
  flashyAccounts,
  newsletterPlans,
  smsCampaignReports,
  syncRuns,
} from "@/lib/schema";
import { deriveSyncHealth } from "@/lib/sync-policy";
import type {
  AutomationReport,
  Channel,
  Client,
  EmailCampaignReport,
  FlashyAccount,
  SmsCampaignReport,
  SyncHistoryEntry,
} from "@/lib/types";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

export async function GET() {
  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        success: false,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Neon עדיין לא מחובר.",
      },
      { status: 409 },
    );
  }

  const db = getDb();
  const [
    clientRows,
    accountRows,
    emailRows,
    smsRows,
    automationRows,
    planRows,
    syncRunRows,
    syncAuditRows,
  ] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.createdAt)),
    db.select().from(flashyAccounts).orderBy(desc(flashyAccounts.createdAt)),
    db.select().from(emailCampaignReports).orderBy(desc(emailCampaignReports.sentAt)),
    db.select().from(smsCampaignReports).orderBy(desc(smsCampaignReports.sentAt)),
    db.select().from(automationReports).orderBy(desc(automationReports.reportDate)),
    db.select().from(newsletterPlans).orderBy(asc(newsletterPlans.plannedDate)),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)),
    db
      .select()
      .from(auditLogs)
      .where(like(auditLogs.action, "flashy.sync.%"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(200),
  ]);
  const allowedClientIds = isAdminRole(accessContext.access.role)
    ? null
    : new Set(accessContext.access.clientIds ?? []);
  const visibleClientRows = allowedClientIds
    ? clientRows.filter((client) => allowedClientIds.has(client.id))
    : clientRows;
  const visibleClientIdSet = new Set(visibleClientRows.map((client) => client.id));
  const visibleAccountRows = accountRows.filter(
    (account) => account.clientId && visibleClientIdSet.has(account.clientId),
  );
  const visibleAccountIdSet = new Set(visibleAccountRows.map((account) => account.id));
  const visiblePlanRows = planRows.filter((plan) => plan.clientId && visibleClientIdSet.has(plan.clientId));
  const latestSyncRunByAccount = new Map<string, (typeof syncRunRows)[number]>();
  for (const run of syncRunRows) {
    if (run.flashyAccountId && !latestSyncRunByAccount.has(run.flashyAccountId)) {
      latestSyncRunByAccount.set(run.flashyAccountId, run);
    }
  }
  const visibleSyncAuditRows = isAdminRole(accessContext.access.role)
    ? syncAuditRows.filter((row) => row.entityId && visibleAccountIdSet.has(row.entityId))
    : [];
  const latestSyncAuditByAccount = new Map<string, (typeof syncAuditRows)[number]>();
  for (const row of visibleSyncAuditRows) {
    if (
      row.entityId &&
      row.action !== "flashy.sync.skipped" &&
      !latestSyncAuditByAccount.has(row.entityId)
    ) {
      latestSyncAuditByAccount.set(row.entityId, row);
    }
  }
  const syncHistory: SyncHistoryEntry[] = visibleSyncAuditRows.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const imported = (metadata.imported ?? {}) as Record<string, unknown>;
    const checks = Array.isArray(metadata.checks) ? metadata.checks : [];
    const warnings = Array.isArray(metadata.warnings)
      ? metadata.warnings.filter((warning): warning is string => typeof warning === "string")
      : [];
    const rawMetricSnapshot = metadata.metricSnapshot && typeof metadata.metricSnapshot === "object"
      ? metadata.metricSnapshot as Record<string, unknown>
      : null;
    const rawLargestChanges = rawMetricSnapshot && Array.isArray(rawMetricSnapshot.largestChanges)
      ? rawMetricSnapshot.largestChanges
      : [];
    const rawStatus = String(metadata.status ?? "");
    const status: SyncHistoryEntry["status"] = rawStatus === "warning"
      ? "warning"
      : row.action === "flashy.sync.failed"
        ? "failed"
        : row.action === "flashy.sync.skipped"
          ? "skipped"
          : "success";
    const rawSource = String(metadata.source ?? "system");
    const source: SyncHistoryEntry["source"] = ["manual", "cron", "onboarding"].includes(rawSource)
      ? rawSource as SyncHistoryEntry["source"]
      : "system";

    return {
      id: row.id,
      accountId: row.entityId ?? "",
      status,
      source,
      startedAt: typeof metadata.startedAt === "string" ? metadata.startedAt : row.createdAt.toISOString(),
      finishedAt: typeof metadata.checkedAt === "string" ? metadata.checkedAt : row.createdAt.toISOString(),
      durationMs: toNumber(metadata.durationMs),
      lookbackDays: toNumber(metadata.lookbackDays),
      imported: {
        emailCampaigns: toNumber(imported.emailCampaigns),
        smsCampaigns: toNumber(imported.smsCampaigns),
        automations: toNumber(imported.automations),
      },
      checksPassed: checks.filter((check) => Boolean((check as Record<string, unknown>)?.ok)).length,
      checksTotal: checks.length,
      warnings,
      message: typeof metadata.message === "string" ? metadata.message : "סנכרון Flashy",
      metricSnapshot: rawMetricSnapshot
        ? {
            snapshotId: String(rawMetricSnapshot.snapshotId ?? ""),
            comparedToPrevious: rawMetricSnapshot.comparedToPrevious === true,
            capturedAt: String(rawMetricSnapshot.capturedAt ?? row.createdAt.toISOString()),
            coverageStart: String(rawMetricSnapshot.coverageStart ?? ""),
            coverageEnd: String(rawMetricSnapshot.coverageEnd ?? ""),
            totalRevenue: toNumber(rawMetricSnapshot.totalRevenue),
            totalPurchases: toNumber(rawMetricSnapshot.totalPurchases),
            totalCostIls: toNumber(rawMetricSnapshot.totalCostIls),
            historicalChangedDays: toNumber(rawMetricSnapshot.historicalChangedDays),
            historicalRevenueDelta: toNumber(rawMetricSnapshot.historicalRevenueDelta),
            historicalPurchasesDelta: toNumber(rawMetricSnapshot.historicalPurchasesDelta),
            historicalSmsCostIlsDelta: toNumber(rawMetricSnapshot.historicalSmsCostIlsDelta),
            costConfigurationChanged: rawMetricSnapshot.costConfigurationChanged === true,
            largestChanges: rawLargestChanges
              .filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
              .map((change) => ({
                date: String(change.date ?? ""),
                revenueDelta: toNumber(change.revenueDelta),
                purchasesDelta: toNumber(change.purchasesDelta),
                smsCostIlsDelta: toNumber(change.smsCostIlsDelta),
              }))
              .filter((change) => Boolean(change.date)),
          }
        : undefined,
    };
  });
  const permitted = <T extends { flashyAccountId: string | null }>(rows: T[]) => rows.filter(row => row.flashyAccountId && visibleAccountIdSet.has(row.flashyAccountId));
  let currentEmails: typeof emailRows, currentSms: typeof smsRows, currentAutomations: typeof automationRows;
  try {
    currentEmails = latestCampaignReports(permitted(emailRows));
    currentSms = latestCampaignReports(permitted(smsRows));
    currentAutomations = latestAutomationReports(permitted(automationRows));
  } catch (error) {
    return NextResponse.json({ success: false, code: "REPORTS_REQUIRE_RESYNC", message: error instanceof Error ? error.message : "נדרש סנכרון דוחות" }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    data: {
      viewer: {
        canManageUsers: isOwnerRole(accessContext.access.role) || isOwnerEmail(accessContext.access.email),
        email: accessContext.access.email,
        role: isOwnerRole(accessContext.access.role)
          ? "owner"
          : isAdminRole(accessContext.access.role)
            ? "admin"
            : "client",
      },
      clients: visibleClientRows.map(
        (client): Client => ({
          id: client.id,
          name: client.name,
          owner: client.owner ?? "",
          industry: client.industry ?? "",
          visibleModules: (client.visibleModules ?? ["reports", "planner", "ai"]) as Client["visibleModules"],
        }),
      ),
      accounts: visibleAccountRows.map(
        (account): FlashyAccount => {
          const syncHealth = deriveSyncHealth(
            account.lastSyncAt,
            latestSyncRunByAccount.get(account.id) ?? null,
          );
          const syncMetadata = (latestSyncAuditByAccount.get(account.id)?.metadata ?? {}) as Record<string, unknown>;
          const syncWarnings = Array.isArray(syncMetadata.warnings)
            ? syncMetadata.warnings.filter((warning): warning is string => typeof warning === "string")
            : [];
          const imported = (syncMetadata.imported ?? {}) as Record<string, unknown>;
          return {
            id: account.id,
            clientId: account.clientId ?? "",
            flashyAccountId: account.flashyAccountId ?? 0,
            name: account.name,
            website: account.website ?? "",
            currency: account.currency,
            timezone: account.timezone,
            credits: 0,
            usdIlsRate: toNumber(account.usdIlsRate),
            smsCreditPriceUsd: toNumber(account.smsCreditPriceUsd),
            monthlySubscriptionCostUsd: toNumber(account.monthlySubscriptionCostUsd),
            agencyRetainerCostIls: toNumber(account.agencyRetainerCostIls),
            active: account.active,
            lastSyncAt: account.lastSyncAt?.toISOString() ?? account.createdAt.toISOString(),
            syncStatus: syncHealth.status,
            syncError: syncHealth.error,
            syncStartedAt: syncHealth.startedAt,
            syncWarnings,
            lastSyncImported: latestSyncAuditByAccount.has(account.id)
              ? {
                  emailCampaigns: toNumber(imported.emailCampaigns),
                  smsCampaigns: toNumber(imported.smsCampaigns),
                  automations: toNumber(imported.automations),
                }
              : null,
          };
        },
      ),
      emailReports: currentEmails.map(
        (report): EmailCampaignReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          campaignId: report.campaignId,
          campaignName: report.campaignName ?? "קמפיין אימייל",
          subjectLine: report.subjectLine ?? "",
          sentAt: report.sentAt.toISOString(),
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          totalOpens: report.totalOpens,
          uniqueClicks: toNumber((report.raw as Record<string, unknown>)?.unique_clicks),
          totalClicks: report.totalClicks,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
          totalBounces: 0,
          unsubscribed: 0,
          spam: 0,
        }),
      ),
      smsReports: currentSms.map(
        (report): SmsCampaignReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          campaignId: report.campaignId,
          campaignName: report.campaignName ?? "קמפיין SMS",
          sentAt: report.sentAt.toISOString(),
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          uniqueClicks: toNumber((report.raw as Record<string, unknown>)?.unique_clicks),
          totalClicks: report.totalClicks,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
          unsubscribed: 0,
        }),
      ),
      automationReports: currentAutomations.map(
        (report): AutomationReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          automationId: report.automationId,
          automationName: report.automationName ?? "אוטומציה",
          channel: report.channel as Channel,
          date: report.reportDate,
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          totalOpens: report.totalOpens,
          totalClicks: report.totalClicks,
          sentEmails: report.sentEmails,
          openedEmails: report.openedEmails,
          clickedEmails: report.clickedEmails,
          sentSms: report.sentSms,
          clickedSms: report.clickedSms,
          totalEntered: report.totalEntered,
          totalCompleted: report.totalCompleted,
          failedMessages: report.failedMessages,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
        }),
      ),
      newsletterPlans: visiblePlanRows.map(mapNewsletterPlanRow),
      syncHistory,
    },
  });
}
