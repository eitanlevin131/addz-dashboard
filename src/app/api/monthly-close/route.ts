import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { assessMonthlyClose } from "@/lib/monthly-close";
import { monthlyPeriod, type MonthlySummarySnapshot } from "@/lib/monthly-summary";
import { accountDate } from "@/lib/report-time";
import {
  accountMetricSnapshots,
  automationReports,
  clients,
  emailCampaignReports,
  flashyAccounts,
  monthlySummaries,
  monthlySummaryDeliveries,
  siteRevenueBenchmarks,
  smsCampaignReports,
  syncRuns,
} from "@/lib/schema";
import { deriveSyncHealth } from "@/lib/sync-policy";

export const dynamic = "force-dynamic";

function defaultMonth() {
  const value = new Date();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function number(value: unknown) {
  return Number(value ?? 0) || 0;
}

export async function GET(request: Request) {
  const authorization = await requireAdmin();
  if (!authorization.ok) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month")?.trim() || defaultMonth();
  let period: ReturnType<typeof monthlyPeriod>;
  try {
    period = monthlyPeriod(month);
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "חודש לא תקין." }, { status: 400 });
  }

  const db = getDb();
  const accountRows = await db
    .select({
      accountId: flashyAccounts.id,
      clientId: flashyAccounts.clientId,
      accountName: flashyAccounts.name,
      clientName: clients.name,
      timezone: flashyAccounts.timezone,
      lastSyncAt: flashyAccounts.lastSyncAt,
      smsCreditPriceUsd: flashyAccounts.smsCreditPriceUsd,
      monthlySubscriptionCostUsd: flashyAccounts.monthlySubscriptionCostUsd,
      agencyRetainerCostIls: flashyAccounts.agencyRetainerCostIls,
    })
    .from(flashyAccounts)
    .innerJoin(clients, eq(flashyAccounts.clientId, clients.id))
    .where(eq(flashyAccounts.active, true));

  const accountIds = accountRows.map((row) => row.accountId);
  if (accountIds.length === 0) {
    return NextResponse.json({ success: true, data: { month, period, rows: [] } });
  }

  const broadStart = new Date(`${period.start}T00:00:00.000Z`);
  broadStart.setUTCDate(broadStart.getUTCDate() - 1);
  const broadEnd = new Date(`${period.end}T23:59:59.999Z`);
  broadEnd.setUTCDate(broadEnd.getUTCDate() + 1);

  const [summaryRows, deliveryRows, benchmarkRows, emailRows, smsRows, automationRows, runRows, snapshotRows] = await Promise.all([
    db.select().from(monthlySummaries).where(and(
      inArray(monthlySummaries.flashyAccountId, accountIds),
      eq(monthlySummaries.periodStart, period.start),
    )).orderBy(desc(monthlySummaries.version)),
    db.select({
      summaryId: monthlySummaryDeliveries.monthlySummaryId,
      recipients: monthlySummaryDeliveries.recipients,
      status: monthlySummaryDeliveries.status,
      errorMessage: monthlySummaryDeliveries.errorMessage,
      sentAt: monthlySummaryDeliveries.sentAt,
      createdAt: monthlySummaryDeliveries.createdAt,
    })
      .from(monthlySummaryDeliveries)
      .innerJoin(monthlySummaries, eq(monthlySummaryDeliveries.monthlySummaryId, monthlySummaries.id))
      .where(and(
        inArray(monthlySummaries.flashyAccountId, accountIds),
        eq(monthlySummaries.periodStart, period.start),
      ))
      .orderBy(desc(monthlySummaryDeliveries.createdAt)),
    db.select().from(siteRevenueBenchmarks).where(and(
      inArray(siteRevenueBenchmarks.flashyAccountId, accountIds),
      eq(siteRevenueBenchmarks.rangeStart, period.start),
      eq(siteRevenueBenchmarks.rangeEnd, period.end),
    )),
    db.select({ accountId: emailCampaignReports.flashyAccountId, sentAt: emailCampaignReports.sentAt })
      .from(emailCampaignReports)
      .where(and(inArray(emailCampaignReports.flashyAccountId, accountIds), gte(emailCampaignReports.sentAt, broadStart), lte(emailCampaignReports.sentAt, broadEnd))),
    db.select({ accountId: smsCampaignReports.flashyAccountId, sentAt: smsCampaignReports.sentAt })
      .from(smsCampaignReports)
      .where(and(inArray(smsCampaignReports.flashyAccountId, accountIds), gte(smsCampaignReports.sentAt, broadStart), lte(smsCampaignReports.sentAt, broadEnd))),
    db.select({ accountId: automationReports.flashyAccountId, automationId: automationReports.automationId, reportDate: automationReports.reportDate })
      .from(automationReports)
      .where(and(inArray(automationReports.flashyAccountId, accountIds), gte(automationReports.reportDate, period.start), lte(automationReports.reportDate, period.end))),
    db.select().from(syncRuns).where(inArray(syncRuns.flashyAccountId, accountIds)).orderBy(desc(syncRuns.startedAt)),
    db.select().from(accountMetricSnapshots).where(inArray(accountMetricSnapshots.flashyAccountId, accountIds)).orderBy(desc(accountMetricSnapshots.capturedAt)),
  ]);

  const latestSummaryByAccount = new Map<string, (typeof summaryRows)[number]>();
  for (const row of summaryRows) if (!latestSummaryByAccount.has(row.flashyAccountId)) latestSummaryByAccount.set(row.flashyAccountId, row);
  const latestDeliveryBySummary = new Map<string, (typeof deliveryRows)[number]>();
  for (const row of deliveryRows) if (!latestDeliveryBySummary.has(row.summaryId)) latestDeliveryBySummary.set(row.summaryId, row);
  const latestRunByAccount = new Map<string, (typeof runRows)[number]>();
  for (const row of runRows) if (row.flashyAccountId && !latestRunByAccount.has(row.flashyAccountId)) latestRunByAccount.set(row.flashyAccountId, row);
  const latestSnapshotByAccount = new Map<string, (typeof snapshotRows)[number]>();
  for (const row of snapshotRows) if (!latestSnapshotByAccount.has(row.flashyAccountId)) latestSnapshotByAccount.set(row.flashyAccountId, row);
  const benchmarkByAccount = new Map(benchmarkRows.map((row) => [row.flashyAccountId, row]));

  const rows = accountRows.map((account) => {
    const latestSummary = latestSummaryByAccount.get(account.accountId) ?? null;
    const latestDelivery = latestSummary ? latestDeliveryBySummary.get(latestSummary.id) ?? null : null;
    const snapshot = latestSummary?.snapshot as MonthlySummarySnapshot | undefined;
    const emailReports = emailRows.filter((row) => row.accountId === account.accountId && accountDate(row.sentAt, account.timezone) >= period.start && accountDate(row.sentAt, account.timezone) <= period.end).length;
    const smsReports = smsRows.filter((row) => row.accountId === account.accountId && accountDate(row.sentAt, account.timezone) >= period.start && accountDate(row.sentAt, account.timezone) <= period.end).length;
    const automationReportIds = new Set(automationRows.filter((row) => row.accountId === account.accountId).map((row) => row.automationId));
    const metricSnapshot = latestSnapshotByAccount.get(account.accountId) ?? null;
    const sync = deriveSyncHealth(account.lastSyncAt, latestRunByAccount.get(account.accountId) ?? null);
    const missingInputs = snapshot?.completeness.missing ?? [
      ...(benchmarkByAccount.has(account.accountId) ? [] : ["מחזור אתר"]),
      "נרשמי Popup",
      "המרת Popup",
    ];
    const assessment = assessMonthlyClose({
      summaryStatus: latestSummary?.status ?? null,
      syncStatus: sync.status,
      emailReports,
      smsReports,
      automationReports: automationReportIds.size,
      missingInputs,
      smsCreditPriceUsd: number(account.smsCreditPriceUsd),
      monthlySubscriptionCostUsd: number(account.monthlySubscriptionCostUsd),
      agencyRetainerCostIls: number(account.agencyRetainerCostIls),
      hasMetricSnapshot: Boolean(metricSnapshot),
    });

    return {
      accountId: account.accountId,
      clientId: account.clientId,
      accountName: account.accountName,
      clientName: account.clientName,
      syncStatus: sync.status,
      syncError: sync.error,
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      snapshotDate: metricSnapshot?.snapshotDate ?? null,
      snapshotCapturedAt: metricSnapshot?.capturedAt.toISOString() ?? null,
      historicalChangedDays: metricSnapshot?.revision.historicalChangedDays ?? 0,
      reports: { email: emailReports, sms: smsReports, automations: automationReportIds.size },
      summary: latestSummary ? {
        id: latestSummary.id,
        status: assessment.stage,
        version: latestSummary.version,
        approvedAt: latestSummary.approvedAt?.toISOString() ?? null,
        sentAt: latestSummary.sentAt?.toISOString() ?? null,
        updatedAt: latestSummary.updatedAt.toISOString(),
        latestDelivery: latestDelivery ? {
          recipients: latestDelivery.recipients,
          status: latestDelivery.status,
          errorMessage: latestDelivery.errorMessage,
          sentAt: latestDelivery.sentAt?.toISOString() ?? null,
          createdAt: latestDelivery.createdAt.toISOString(),
        } : null,
      } : null,
      missingInputs,
      costs: {
        smsCreditPriceUsd: number(account.smsCreditPriceUsd),
        monthlySubscriptionCostUsd: number(account.monthlySubscriptionCostUsd),
        agencyRetainerCostIls: number(account.agencyRetainerCostIls),
      },
      dataIssues: assessment.dataIssues,
      costIssues: assessment.costIssues,
      needsAttention: assessment.needsAttention,
    };
  });

  return NextResponse.json({ success: true, data: { month, period, rows } });
}
