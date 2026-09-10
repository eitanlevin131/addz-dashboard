import { parseMoney } from "@/lib/metrics";
import { accountLocalTimestamp } from "@/lib/report-time";
import type {
  AutomationReport,
  Channel,
  EmailCampaignReport,
  SmsCampaignReport,
} from "@/lib/types";

export type RawFlashyRow = Record<string, unknown>;

export function rawString(row: RawFlashyRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

export function rawNumber(row: RawFlashyRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const numeric = parseMoney(value);
      if (!Number.isNaN(numeric)) return numeric;
    }
  }
  return 0;
}

export function rawDate(row: RawFlashyRow, _fallbackIndex: number, timezone = "UTC") {
  const timestamp = rawNumber(row, ["created_at", "timestamp", "sent_at"]);
  if (timestamp > 1_000_000_000) return new Date(timestamp * 1000).toISOString();

  const date = rawString(row, ["sent_date", "date", "report_date"], "");
  const time = rawString(row, ["sent_time", "time"], "00:00:00");
  if (date) return accountLocalTimestamp(date, time, timezone);
  throw new Error("Missing report date; refusing to invent a send date");
}

export function inferChannel(row: RawFlashyRow): Channel {
  const sentSms = rawNumber(row, ["sent_sms"]);
  const clickedSms = rawNumber(row, ["clicked_sms"]);
  const sentEmails = rawNumber(row, ["sent_emails"]);
  if (sentSms > 0 || clickedSms > 0) return "sms";
  if (sentEmails > 0) return "email";

  const source = [
    rawString(row, ["channel"]),
    rawString(row, ["type"]),
    rawString(row, ["message_type"]),
    rawString(row, ["automation_name"]),
    rawString(row, ["name"]),
  ]
    .join(" ")
    .toLowerCase();
  return source.includes("sms") ? "sms" : "email";
}

export function normalizeEmailReports(
  rows: RawFlashyRow[],
  accountId: string,
  timezone = "UTC",
): EmailCampaignReport[] {
  return rows.map((row, index) => ({
    id: `${accountId}-email-${rawString(row, ["campaign_id"], String(index))}-${index}`,
    accountId,
    campaignId: rawNumber(row, ["campaign_id", "id"]) || index + 1,
    campaignName: rawString(row, ["campaign_name", "name", "title"], `קמפיין אימייל ${index + 1}`),
    subjectLine: rawString(row, ["subject_line", "subject"], "ללא שורת נושא"),
    sentAt: rawDate(row, index, timezone),
    totalRecipients: rawNumber(row, ["total_recipients", "recipients", "sent"]),
    totalDelivered: rawNumber(row, ["total_delivered", "delivered"]),
    totalOpens: rawNumber(row, ["total_opens", "opens"]),
    uniqueClicks: rawNumber(row, ["unique_clicks"]),
    totalClicks: rawNumber(row, ["total_clicks", "clicks"]),
    purchases: rawNumber(row, ["purchases", "orders"]),
    revenueGenerated: rawNumber(row, ["revenue_generated", "revenue"]),
    totalBounces: rawNumber(row, ["total_bounces", "bounces"]),
    unsubscribed: rawNumber(row, ["unsubscribed", "unsubscribes"]),
    spam: rawNumber(row, ["total_spam", "spam"]),
  }));
}

export function normalizeSmsReports(
  rows: RawFlashyRow[],
  accountId: string,
  timezone = "UTC",
): SmsCampaignReport[] {
  return rows.map((row, index) => ({
    id: `${accountId}-sms-${rawString(row, ["campaign_id"], String(index))}-${index}`,
    accountId,
    campaignId: rawNumber(row, ["campaign_id", "id"]) || index + 1,
    campaignName: rawString(row, ["campaign_name", "name", "title"], `קמפיין SMS ${index + 1}`),
    sentAt: rawDate(row, index, timezone),
    totalRecipients: rawNumber(row, ["total_recipients", "recipients", "sent"]),
    totalDelivered: rawNumber(row, ["total_delivered", "delivered"]),
    uniqueClicks: rawNumber(row, ["unique_clicks"]),
    totalClicks: rawNumber(row, ["total_clicks", "clicks"]),
    purchases: rawNumber(row, ["purchases", "orders"]),
    revenueGenerated: rawNumber(row, ["revenue_generated", "revenue"]),
    unsubscribed: rawNumber(row, ["unsubscribed", "unsubscribes"]),
  }));
}

export function normalizeAutomationReports(
  rows: RawFlashyRow[],
  accountId: string,
): AutomationReport[] {
  return rows.map((row, index) => {
    const reportDate = rawString(row, ["date", "report_date"]);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : rawDate(row, index);
    return {
      id: `${accountId}-automation-${rawString(row, ["automation_id"], String(index))}-${index}`,
      accountId,
      automationId: rawNumber(row, ["automation_id", "id"]) || index + 1,
      automationName: rawString(
        row,
        ["automation_title", "automation_name", "name", "title"],
        `אוטומציה ${index + 1}`,
      ),
      channel: inferChannel(row),
      date: date.slice(0, 10),
      totalRecipients: rawNumber(row, ["total_recipients", "recipients", "sent", "total_entered"]),
      totalDelivered: rawNumber(row, ["total_delivered", "delivered", "total_sent"]),
      totalOpens: rawNumber(row, ["total_opens", "opens", "opened_emails"]),
      totalClicks: rawNumber(row, ["total_clicks", "clicks", "total_clicked"]),
      sentEmails: rawNumber(row, ["sent_emails"]),
      openedEmails: rawNumber(row, ["opened_emails"]),
      clickedEmails: rawNumber(row, ["clicked_emails"]),
      sentSms: rawNumber(row, ["sent_sms"]),
      clickedSms: rawNumber(row, ["clicked_sms"]),
      totalEntered: rawNumber(row, ["total_entered"]),
      totalCompleted: rawNumber(row, ["total_completed"]),
      failedMessages: rawNumber(row, ["failed_messages"]),
      purchases: rawNumber(row, ["purchases", "orders"]),
      revenueGenerated: rawNumber(row, ["revenue_generated", "revenue", "revenues"]),
    };
  });
}
