import { and, eq, gte, lt } from "drizzle-orm";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import {
  campaignEngagementMetrics,
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  rawString,
  type RawFlashyRow,
} from "./flashy-normalize";
import { getFlashyCampaignReports, getFlashyReports } from "./flashy";
import type { QuestionPeriod } from "./ai-question-period";
import { latestAutomationReports, latestCampaignReports } from "./report-identity";
import { automationReports, emailCampaignReports, smsCampaignReports } from "./schema";
import type {
  AiDataScope,
  AutomationReport,
  Channel,
  EmailCampaignReport,
  SmsCampaignReport,
} from "./types";

export type HistoricalAiData = {
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  scope: AiDataScope;
};

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function mapStoredEmails(rows: typeof emailCampaignReports.$inferSelect[]): EmailCampaignReport[] {
  return latestCampaignReports(rows).map((report) => {
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
}

function mapStoredSms(rows: typeof smsCampaignReports.$inferSelect[]): SmsCampaignReport[] {
  return latestCampaignReports(rows).map((report) => {
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
}

function mapStoredAutomations(rows: typeof automationReports.$inferSelect[]): AutomationReport[] {
  return latestAutomationReports(rows).map((report) => ({
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
}

async function loadCachedPeriod(accountId: string, period: QuestionPeriod) {
  const db = getDb();
  const [emailRows, smsRows, automationRows] = await Promise.all([
    db.select().from(emailCampaignReports).where(and(
      eq(emailCampaignReports.flashyAccountId, accountId),
      gte(emailCampaignReports.sentAt, new Date(period.start)),
      lt(emailCampaignReports.sentAt, new Date(period.endExclusive)),
    )),
    db.select().from(smsCampaignReports).where(and(
      eq(smsCampaignReports.flashyAccountId, accountId),
      gte(smsCampaignReports.sentAt, new Date(period.start)),
      lt(smsCampaignReports.sentAt, new Date(period.endExclusive)),
    )),
    db.select().from(automationReports).where(and(
      eq(automationReports.flashyAccountId, accountId),
      gte(automationReports.reportDate, period.startDate),
      lt(automationReports.reportDate, period.endExclusiveDate),
    )),
  ]);
  return {
    emails: mapStoredEmails(emailRows),
    sms: mapStoredSms(smsRows),
    automations: mapStoredAutomations(automationRows),
  };
}

export async function loadHistoricalAiData(input: {
  accountId: string;
  encryptedApiKey: string;
  timezone: string;
  period: QuestionPeriod;
  includeAutomations?: boolean;
}): Promise<HistoricalAiData> {
  let apiWarning = "";
  try {
    const apiKey = decryptSecret(input.encryptedApiKey);
    const from = Math.floor(Date.parse(input.period.start) / 1000);
    const to = Math.floor((Date.parse(input.period.endExclusive) - 1_000) / 1000);
    const reports = input.includeAutomations === false
      ? await getFlashyCampaignReports(apiKey, from, to)
      : await getFlashyReports(apiKey, from, to);
    const failed = reports.checks.filter((check) => !check.ok);
    if (!failed.length) {
      const emails = normalizeEmailReports(reports.emails as RawFlashyRow[], input.accountId, input.timezone);
      const sms = normalizeSmsReports(reports.sms as RawFlashyRow[], input.accountId, input.timezone);
      const automations = input.includeAutomations === false
        ? []
        : normalizeAutomationReports(reports.automations as RawFlashyRow[], input.accountId);
      return {
        emails,
        sms,
        automations,
        scope: {
          label: input.period.label,
          start: input.period.startDate,
          end: input.period.endDate,
          source: "flashy-api",
          complete: true,
          warning: "",
          counts: { emails: emails.length, sms: sms.length, automations: automations.length },
        },
      };
    }
    apiWarning = `חלק ממקורות Flashy לא נטענו: ${failed.map((check) => check.label).join(", ")}.`;
  } catch (error) {
    apiWarning = error instanceof Error ? `שליפת Flashy נכשלה: ${error.message}` : "שליפת Flashy נכשלה.";
  }

  const cached = await loadCachedPeriod(input.accountId, input.period);
  return {
    ...cached,
    scope: {
      label: input.period.label,
      start: input.period.startDate,
      end: input.period.endDate,
      source: "database-cache",
      complete: false,
      warning: `${apiWarning} התשובה מבוססת על הנתונים השמורים במערכת בלבד.`.trim(),
      counts: {
        emails: cached.emails.length,
        sms: cached.sms.length,
        automations: cached.automations.length,
      },
    },
  };
}
