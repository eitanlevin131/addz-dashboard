import type {
  AutomationReport,
  DailyMetricSnapshot,
  EmailCampaignReport,
  MetricSnapshotRevision,
  SmsCampaignReport,
} from "./types";

export type MetricSnapshotValues = {
  snapshotDate: string;
  coverageStart: string;
  coverageEnd: string;
  emailRevenue: number;
  smsRevenue: number;
  automationRevenue: number;
  totalRevenue: number;
  emailPurchases: number;
  smsPurchases: number;
  automationPurchases: number;
  totalPurchases: number;
  smsMessages: number;
  smsCostUsd: number;
  smsCostIls: number;
  subscriptionCostIls: number;
  retainerCostIls: number;
  totalCostIls: number;
  usdIlsRate: number;
  smsCreditPriceUsd: number;
  emailReports: number;
  smsReports: number;
  automationReports: number;
  dailyMetrics: DailyMetricSnapshot[];
};

type SnapshotCostConfig = {
  usdIlsRate: number;
  smsCreditPriceUsd: number;
  monthlySubscriptionCostUsd: number;
  agencyRetainerCostIls: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function accountDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function automationSmsMessages(report: AutomationReport) {
  if ((report.sentSms ?? 0) > 0) return report.sentSms ?? 0;
  return report.channel === "sms" ? report.totalRecipients : 0;
}

function emptyDay(date: string): DailyMetricSnapshot {
  return {
    date,
    emailRevenue: 0,
    smsRevenue: 0,
    automationRevenue: 0,
    totalRevenue: 0,
    emailPurchases: 0,
    smsPurchases: 0,
    automationPurchases: 0,
    totalPurchases: 0,
    smsMessages: 0,
    smsCostUsd: 0,
    smsCostIls: 0,
  };
}

export function buildMetricSnapshot(input: {
  timezone: string;
  capturedAt: Date;
  coverageStart: string;
  coverageEnd: string;
  costs: SnapshotCostConfig;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
}): MetricSnapshotValues {
  const days = new Map<string, DailyMetricSnapshot>();
  const day = (date: string) => {
    const current = days.get(date) ?? emptyDay(date);
    days.set(date, current);
    return current;
  };

  for (const report of input.emails) {
    const current = day(accountDate(new Date(report.sentAt), input.timezone));
    current.emailRevenue += report.revenueGenerated;
    current.emailPurchases += report.purchases;
  }
  for (const report of input.sms) {
    const current = day(accountDate(new Date(report.sentAt), input.timezone));
    current.smsRevenue += report.revenueGenerated;
    current.smsPurchases += report.purchases;
    current.smsMessages += report.totalRecipients;
  }
  for (const report of input.automations) {
    const current = day(report.date);
    current.automationRevenue += report.revenueGenerated;
    current.automationPurchases += report.purchases;
    current.smsMessages += automationSmsMessages(report);
  }

  const dailyMetrics = [...days.values()]
    .map((current) => {
      current.emailRevenue = money(current.emailRevenue);
      current.smsRevenue = money(current.smsRevenue);
      current.automationRevenue = money(current.automationRevenue);
      current.totalRevenue = money(current.emailRevenue + current.smsRevenue + current.automationRevenue);
      current.totalPurchases = current.emailPurchases + current.smsPurchases + current.automationPurchases;
      current.smsCostUsd = money(current.smsMessages * input.costs.smsCreditPriceUsd);
      current.smsCostIls = money(current.smsCostUsd * input.costs.usdIlsRate);
      return current;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
  const sum = (getValue: (value: DailyMetricSnapshot) => number) =>
    dailyMetrics.reduce((total, value) => total + getValue(value), 0);
  const emailRevenue = money(sum((value) => value.emailRevenue));
  const smsRevenue = money(sum((value) => value.smsRevenue));
  const automationRevenue = money(sum((value) => value.automationRevenue));
  const smsCostUsd = money(sum((value) => value.smsCostUsd));
  const smsCostIls = money(sum((value) => value.smsCostIls));
  const subscriptionCostIls = money(
    input.costs.monthlySubscriptionCostUsd * input.costs.usdIlsRate,
  );
  const retainerCostIls = money(input.costs.agencyRetainerCostIls);

  return {
    snapshotDate: accountDate(input.capturedAt, input.timezone),
    coverageStart: input.coverageStart,
    coverageEnd: input.coverageEnd,
    emailRevenue,
    smsRevenue,
    automationRevenue,
    totalRevenue: money(emailRevenue + smsRevenue + automationRevenue),
    emailPurchases: sum((value) => value.emailPurchases),
    smsPurchases: sum((value) => value.smsPurchases),
    automationPurchases: sum((value) => value.automationPurchases),
    totalPurchases: sum((value) => value.totalPurchases),
    smsMessages: sum((value) => value.smsMessages),
    smsCostUsd,
    smsCostIls,
    subscriptionCostIls,
    retainerCostIls,
    totalCostIls: money(smsCostIls + subscriptionCostIls + retainerCostIls),
    usdIlsRate: input.costs.usdIlsRate,
    smsCreditPriceUsd: input.costs.smsCreditPriceUsd,
    emailReports: input.emails.length,
    smsReports: input.sms.length,
    automationReports: input.automations.length,
    dailyMetrics,
  };
}

export function compareMetricSnapshots(
  current: MetricSnapshotValues,
  previous: (MetricSnapshotValues & { id: string }) | null,
): MetricSnapshotRevision {
  if (!previous) {
    return {
      previousSnapshotId: null,
      comparableDays: 0,
      changedDays: 0,
      historicalChangedDays: 0,
      historicalRevenueDelta: 0,
      historicalPurchasesDelta: 0,
      historicalSmsCostIlsDelta: 0,
      costConfigurationChanged: false,
      largestChanges: [],
    };
  }

  const overlapStart = current.coverageStart > previous.coverageStart
    ? current.coverageStart
    : previous.coverageStart;
  const overlapEnd = current.coverageEnd < previous.coverageEnd
    ? current.coverageEnd
    : previous.coverageEnd;
  const currentDays = new Map(current.dailyMetrics.map((value) => [value.date, value]));
  const previousDays = new Map(previous.dailyMetrics.map((value) => [value.date, value]));
  const dates = new Set([...currentDays.keys(), ...previousDays.keys()]);
  const comparableDates = [...dates]
    .filter((date) => date >= overlapStart && date <= overlapEnd)
    .sort();
  const changes = comparableDates.map((date) => {
    const currentDay = currentDays.get(date) ?? emptyDay(date);
    const previousDay = previousDays.get(date) ?? emptyDay(date);
    return {
      date,
      revenueDelta: money(currentDay.totalRevenue - previousDay.totalRevenue),
      purchasesDelta: currentDay.totalPurchases - previousDay.totalPurchases,
      smsCostIlsDelta: money(currentDay.smsCostIls - previousDay.smsCostIls),
    };
  }).filter((change) =>
    Math.abs(change.revenueDelta) >= 0.01 ||
    change.purchasesDelta !== 0 ||
    Math.abs(change.smsCostIlsDelta) >= 0.01,
  );
  const historicalChanges = changes.filter((change) => change.date < current.snapshotDate);

  return {
    previousSnapshotId: previous.id,
    comparableDays: comparableDates.length,
    changedDays: changes.length,
    historicalChangedDays: historicalChanges.length,
    historicalRevenueDelta: money(historicalChanges.reduce((total, value) => total + value.revenueDelta, 0)),
    historicalPurchasesDelta: historicalChanges.reduce((total, value) => total + value.purchasesDelta, 0),
    historicalSmsCostIlsDelta: money(historicalChanges.reduce((total, value) => total + value.smsCostIlsDelta, 0)),
    costConfigurationChanged:
      current.usdIlsRate !== previous.usdIlsRate ||
      current.smsCreditPriceUsd !== previous.smsCreditPriceUsd ||
      current.subscriptionCostIls !== previous.subscriptionCostIls ||
      current.retainerCostIls !== previous.retainerCostIls,
    largestChanges: [...historicalChanges]
      .sort((left, right) => Math.abs(right.revenueDelta) - Math.abs(left.revenueDelta))
      .slice(0, 10),
  };
}
