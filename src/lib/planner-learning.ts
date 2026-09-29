import type {
  CampaignObjective,
  EmailCampaignReport,
  NewsletterPlan,
  SmsCampaignReport,
} from "./types";
import type { PlannerCampaignReport } from "./planner-match";

export const campaignObjectives: Array<{ value: CampaignObjective; label: string }> = [
  { value: "revenue", label: "מכירה והכנסה" },
  { value: "launch", label: "השקה" },
  { value: "restock", label: "חזרה למלאי" },
  { value: "content", label: "תוכן ומעורבות" },
  { value: "retention", label: "שימור והחזרה" },
  { value: "other", label: "מטרה אחרת" },
];

const objectiveLabels = new Map(campaignObjectives.map((item) => [item.value, item.label]));

export function isCampaignObjective(value: unknown): value is CampaignObjective {
  return typeof value === "string" && objectiveLabels.has(value as CampaignObjective);
}

export function campaignObjectiveLabel(value?: CampaignObjective) {
  return value ? objectiveLabels.get(value) ?? "מטרה אחרת" : "לא הוגדרה מטרה";
}

export function matchedReportsForPlan(
  plan: NewsletterPlan,
  emails: EmailCampaignReport[],
  sms: SmsCampaignReport[],
): PlannerCampaignReport[] {
  const storedMatches = plan.campaignMatches?.flatMap((match) => match.campaignId === undefined
    ? []
    : [{ channel: match.channel, campaignId: match.campaignId }]) ?? [];
  const legacyMatches = plan.matchedCampaignId === undefined
    ? []
    : [{ channel: plan.matchedCampaignChannel ?? (plan.channel === "sms" ? "sms" : "email"), campaignId: plan.matchedCampaignId }];
  const matches = storedMatches.length ? storedMatches : legacyMatches;

  const reports: PlannerCampaignReport[] = [];
  for (const match of matches) {
    if (match.channel === "email") {
      const report = emails.find((item) => item.accountId === plan.accountId && item.campaignId === match.campaignId);
      if (report) reports.push({ ...report, channel: "email" });
      continue;
    }
    const report = sms.find((item) => item.accountId === plan.accountId && item.campaignId === match.campaignId);
    if (report) reports.push({ ...report, channel: "sms" });
  }
  return reports;
}

export function summarizePlannerReports(reports: PlannerCampaignReport[]) {
  const totals = reports.reduce((result, report) => ({
    revenue: result.revenue + report.revenueGenerated,
    purchases: result.purchases + report.purchases,
    recipients: result.recipients + report.totalRecipients,
    delivered: result.delivered + report.totalDelivered,
    opens: result.opens + (report.channel === "email" ? report.totalOpens : 0),
    emailDelivered: result.emailDelivered + (report.channel === "email" ? report.totalDelivered : 0),
    clicks: result.clicks + report.uniqueClicks,
    unsubscribed: result.unsubscribed + report.unsubscribed,
  }), {
    revenue: 0,
    purchases: 0,
    recipients: 0,
    delivered: 0,
    opens: 0,
    emailDelivered: 0,
    clicks: 0,
    unsubscribed: 0,
  });

  return {
    ...totals,
    reportCount: reports.length,
    conversionRate: totals.recipients > 0 ? totals.purchases / totals.recipients : null,
    openRate: totals.emailDelivered > 0 ? totals.opens / totals.emailDelivered : null,
    clickRate: totals.delivered > 0 ? totals.clicks / totals.delivered : null,
    unsubscribeRate: totals.recipients > 0 ? totals.unsubscribed / totals.recipients : null,
  };
}
