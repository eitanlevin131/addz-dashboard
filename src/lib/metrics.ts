import type {
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  SmsCampaignReport,
} from "./types";

const sum = <T>(items: T[], getter: (item: T) => number) =>
  items.reduce((total, item) => total + getter(item), 0);

const safeRate = (value: number, base: number) => (base > 0 ? value / base : 0);

export function getAutomationSmsRecipients(report: AutomationReport) {
  const sentSms = report.sentSms ?? 0;
  if (sentSms > 0) return sentSms;
  if (report.channel === "sms") return report.totalRecipients;
  return 0;
}

export function formatCurrency(value: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("he-IL").format(Math.round(value));
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function summarizeAccount(
  account: FlashyAccount,
  emailReports: EmailCampaignReport[],
  smsReports: SmsCampaignReport[],
  automationReports: AutomationReport[],
  includeFixedCosts = true,
): MetricSummary {
  const smsAutomationRecipients = sum(automationReports, getAutomationSmsRecipients);
  const smsCampaignRecipients = sum(smsReports, (report) => report.totalRecipients);
  const revenue =
    sum(emailReports, (report) => report.revenueGenerated) +
    sum(smsReports, (report) => report.revenueGenerated) +
    sum(automationReports, (report) => report.revenueGenerated);
  const recipients =
    sum(emailReports, (report) => report.totalRecipients) +
    sum(smsReports, (report) => report.totalRecipients) +
    sum(automationReports, (report) => report.totalRecipients);
  const delivered =
    sum(emailReports, (report) => report.totalDelivered) +
    sum(smsReports, (report) => report.totalDelivered) +
    sum(automationReports, (report) => report.totalDelivered);
  const opens =
    sum(emailReports, (report) => report.totalOpens) +
    sum(automationReports, (report) => report.totalOpens);
  const clicks =
    sum(emailReports, (report) => report.totalClicks) +
    sum(smsReports, (report) => report.totalClicks) +
    sum(automationReports, (report) => report.totalClicks);
  const purchases =
    sum(emailReports, (report) => report.purchases) +
    sum(smsReports, (report) => report.purchases) +
    sum(automationReports, (report) => report.purchases);
  const smsCostUsd =
    (smsCampaignRecipients + smsAutomationRecipients) * account.smsCreditPriceUsd;
  const smsCost = smsCostUsd * account.usdIlsRate;
  const subscriptionCostIls = account.monthlySubscriptionCostUsd * account.usdIlsRate;
  const fixedCosts = includeFixedCosts
    ? subscriptionCostIls + account.agencyRetainerCostIls
    : 0;
  const totalCost = smsCost + fixedCosts;

  return {
    revenue,
    smsCost,
    smsCostUsd,
    fixedCosts,
    subscriptionCostIls,
    profit: revenue - totalCost,
    roas: totalCost > 0 ? revenue / totalCost : null,
    recipients,
    delivered,
    opens,
    clicks,
    purchases,
    conversionRate: safeRate(purchases, delivered),
    revenuePerMessage: safeRate(revenue, recipients),
  };
}

export function summarizeSms(
  account: FlashyAccount,
  smsReports: SmsCampaignReport[],
  automationReports: AutomationReport[],
) {
  const smsAutomationReports = automationReports
    .filter((report) => getAutomationSmsRecipients(report) > 0)
    .map((report) => ({
      ...report,
      totalRecipients: getAutomationSmsRecipients(report),
      totalDelivered: getAutomationSmsRecipients(report),
      totalOpens: 0,
      totalClicks: report.clickedSms ?? report.totalClicks,
    }));

  return summarizeAccount(
    { ...account, monthlySubscriptionCostUsd: 0, agencyRetainerCostIls: 0 },
    [],
    smsReports,
    smsAutomationReports,
    false,
  );
}

export function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const normalized = value.replace(/[^\d.-]/g, "");
  return Number(normalized) || 0;
}

export function parsePercent(value: string | number | null | undefined) {
  if (typeof value === "number") return value > 1 ? value / 100 : value;
  if (!value) return 0;
  return (Number(value.replace("%", "")) || 0) / 100;
}
