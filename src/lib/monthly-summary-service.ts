import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { campaignEngagementMetrics, rawString } from "@/lib/flashy-normalize";
import { latestAutomationReports, latestCampaignReports } from "@/lib/report-identity";
import {
  automationReports,
  emailCampaignReports,
  flashyAccounts,
  monthlySummaries,
  smsCampaignReports,
  syncRuns,
} from "@/lib/schema";
import { deriveSyncHealth } from "@/lib/sync-policy";
import type {
  AutomationReport,
  Channel,
  EmailCampaignReport,
  FlashyAccount,
  SmsCampaignReport,
} from "@/lib/types";
import { withMonthlySummaryShareLink } from "@/lib/monthly-summary";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

export async function loadMonthlySummarySource(accountId: string) {
  const db = getDb();
  const [accountRows, emailRows, smsRows, automationRows, syncRunRows] = await Promise.all([
    db.select().from(flashyAccounts).where(eq(flashyAccounts.id, accountId)).limit(1),
    db.select().from(emailCampaignReports).where(eq(emailCampaignReports.flashyAccountId, accountId)),
    db.select().from(smsCampaignReports).where(eq(smsCampaignReports.flashyAccountId, accountId)),
    db.select().from(automationReports).where(eq(automationReports.flashyAccountId, accountId)),
    db.select().from(syncRuns).where(eq(syncRuns.flashyAccountId, accountId))
      .orderBy(desc(syncRuns.startedAt)).limit(1),
  ]);
  const row = accountRows[0];
  if (!row?.clientId) return null;
  const syncHealth = deriveSyncHealth(row.lastSyncAt, syncRunRows[0] ?? null);

  const account: FlashyAccount = {
    id: row.id,
    clientId: row.clientId,
    flashyAccountId: row.flashyAccountId ?? 0,
    name: row.name,
    website: row.website ?? "",
    currency: row.currency,
    timezone: row.timezone,
    credits: 0,
    usdIlsRate: toNumber(row.usdIlsRate),
    smsCreditPriceUsd: toNumber(row.smsCreditPriceUsd),
    monthlySubscriptionCostUsd: toNumber(row.monthlySubscriptionCostUsd),
    agencyRetainerCostIls: toNumber(row.agencyRetainerCostIls),
    active: row.active,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? row.createdAt.toISOString(),
    syncStatus: syncHealth.status,
    syncError: syncHealth.error,
    syncStartedAt: syncHealth.startedAt,
  };
  const currentEmails = latestCampaignReports(emailRows);
  const currentSms = latestCampaignReports(smsRows);
  const currentAutomations = latestAutomationReports(automationRows);

  const emails: EmailCampaignReport[] = currentEmails.map((report) => {
    const engagement = campaignEngagementMetrics(report.raw as Record<string, unknown>);
    return {
      id: report.id,
      accountId: report.flashyAccountId ?? "",
      campaignId: report.campaignId,
      campaignName: report.campaignName ?? "קמפיין אימייל",
      subjectLine: report.subjectLine ?? "",
      sentAt: report.sentAt.toISOString(),
      totalRecipients: report.totalRecipients,
      totalDelivered: report.totalDelivered,
      totalOpens: report.totalOpens,
      uniqueClicks: engagement.uniqueClicks,
      totalClicks: report.totalClicks,
      purchases: report.purchases,
      revenueGenerated: toNumber(report.revenueGenerated),
      totalBounces: engagement.totalBounces,
      unsubscribed: engagement.unsubscribed,
      spam: engagement.spam,
    };
  });
  const sms: SmsCampaignReport[] = currentSms.map((report) => {
    const raw = report.raw as Record<string, unknown>;
    const engagement = campaignEngagementMetrics(raw);
    return {
      id: report.id,
      accountId: report.flashyAccountId ?? "",
      campaignId: report.campaignId,
      campaignName: report.campaignName ?? "קמפיין SMS",
      messageText: rawString(raw, ["campaign_message", "message", "message_text", "content", "body"]),
      sentAt: report.sentAt.toISOString(),
      totalRecipients: report.totalRecipients,
      totalDelivered: report.totalDelivered,
      uniqueClicks: engagement.uniqueClicks,
      totalClicks: report.totalClicks,
      purchases: report.purchases,
      revenueGenerated: toNumber(report.revenueGenerated),
      unsubscribed: engagement.unsubscribed,
    };
  });
  const automations: AutomationReport[] = currentAutomations.map((report) => ({
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
  }));

  return { account, clientId: row.clientId, emails, sms, automations };
}

export function monthlySummaryResponse(
  row: typeof monthlySummaries.$inferSelect,
  origin: string,
) {
  const shareUrl = `${origin}/summaries/${row.id}`;
  return {
    id: row.id,
    clientId: row.clientId,
    accountId: row.flashyAccountId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    month: row.snapshot.month,
    version: row.version,
    status: row.status,
    snapshot: row.snapshot,
    manualInputs: row.manualInputs,
    whatsappText: withMonthlySummaryShareLink(row.whatsappText, shareUrl),
    emailSubject: row.emailSubject,
    internalNote: row.internalNote ?? "",
    shareUrl,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
