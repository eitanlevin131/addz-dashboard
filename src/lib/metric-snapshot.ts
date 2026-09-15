import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  buildMetricSnapshot,
  compareMetricSnapshots,
  type MetricSnapshotValues,
} from "@/lib/metric-snapshot-core";
import { accountMetricSnapshots } from "@/lib/schema";
import type {
  AutomationReport,
  EmailCampaignReport,
  MetricSnapshotSummary,
  SmsCampaignReport,
} from "@/lib/types";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function storedSnapshot(
  row: typeof accountMetricSnapshots.$inferSelect,
): MetricSnapshotValues & { id: string } {
  return {
    id: row.id,
    snapshotDate: row.snapshotDate,
    coverageStart: row.coverageStart,
    coverageEnd: row.coverageEnd,
    emailRevenue: toNumber(row.emailRevenue),
    smsRevenue: toNumber(row.smsRevenue),
    automationRevenue: toNumber(row.automationRevenue),
    totalRevenue: toNumber(row.totalRevenue),
    emailPurchases: row.emailPurchases,
    smsPurchases: row.smsPurchases,
    automationPurchases: row.automationPurchases,
    totalPurchases: row.totalPurchases,
    smsMessages: row.smsMessages,
    smsCostUsd: toNumber(row.smsCostUsd),
    smsCostIls: toNumber(row.smsCostIls),
    subscriptionCostIls: toNumber(row.subscriptionCostIls),
    retainerCostIls: toNumber(row.retainerCostIls),
    totalCostIls: toNumber(row.totalCostIls),
    usdIlsRate: toNumber(row.usdIlsRate),
    smsCreditPriceUsd: toNumber(row.smsCreditPriceUsd),
    emailReports: row.emailReports,
    smsReports: row.smsReports,
    automationReports: row.automationReports,
    dailyMetrics: row.dailyMetrics,
  };
}

export async function persistMetricSnapshot(input: {
  accountId: string;
  source: string;
  lookbackDays: number;
  capturedAt: Date;
  coverageStart: string;
  coverageEnd: string;
  currency: string;
  timezone: string;
  costs: {
    usdIlsRate: number;
    smsCreditPriceUsd: number;
    monthlySubscriptionCostUsd: number;
    agencyRetainerCostIls: number;
  };
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
}): Promise<MetricSnapshotSummary> {
  const db = getDb();
  const previousRow = await db
    .select()
    .from(accountMetricSnapshots)
    .where(eq(accountMetricSnapshots.flashyAccountId, input.accountId))
    .orderBy(desc(accountMetricSnapshots.capturedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const values = buildMetricSnapshot(input);
  const revision = compareMetricSnapshots(values, previousRow ? storedSnapshot(previousRow) : null);
  const [created] = await db.insert(accountMetricSnapshots).values({
    flashyAccountId: input.accountId,
    snapshotDate: values.snapshotDate,
    capturedAt: input.capturedAt,
    coverageStart: values.coverageStart,
    coverageEnd: values.coverageEnd,
    lookbackDays: input.lookbackDays,
    source: input.source,
    currency: input.currency,
    timezone: input.timezone,
    emailRevenue: String(values.emailRevenue),
    smsRevenue: String(values.smsRevenue),
    automationRevenue: String(values.automationRevenue),
    totalRevenue: String(values.totalRevenue),
    emailPurchases: values.emailPurchases,
    smsPurchases: values.smsPurchases,
    automationPurchases: values.automationPurchases,
    totalPurchases: values.totalPurchases,
    smsMessages: values.smsMessages,
    smsCostUsd: String(values.smsCostUsd),
    smsCostIls: String(values.smsCostIls),
    subscriptionCostIls: String(values.subscriptionCostIls),
    retainerCostIls: String(values.retainerCostIls),
    totalCostIls: String(values.totalCostIls),
    usdIlsRate: String(values.usdIlsRate),
    smsCreditPriceUsd: String(values.smsCreditPriceUsd),
    emailReports: values.emailReports,
    smsReports: values.smsReports,
    automationReports: values.automationReports,
    dailyMetrics: values.dailyMetrics,
    revision,
  }).returning({ id: accountMetricSnapshots.id });

  return {
    snapshotId: created.id,
    comparedToPrevious: revision.previousSnapshotId !== null,
    capturedAt: input.capturedAt.toISOString(),
    coverageStart: values.coverageStart,
    coverageEnd: values.coverageEnd,
    totalRevenue: values.totalRevenue,
    totalPurchases: values.totalPurchases,
    totalCostIls: values.totalCostIls,
    historicalChangedDays: revision.historicalChangedDays,
    historicalRevenueDelta: revision.historicalRevenueDelta,
    historicalPurchasesDelta: revision.historicalPurchasesDelta,
    historicalSmsCostIlsDelta: revision.historicalSmsCostIlsDelta,
    costConfigurationChanged: revision.costConfigurationChanged,
    largestChanges: revision.largestChanges,
  };
}
