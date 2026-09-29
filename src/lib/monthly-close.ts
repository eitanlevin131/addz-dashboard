import type { SyncHealth } from "@/lib/sync-policy";

export type MonthlyCloseStage = "not_started" | "draft" | "approved" | "sent";

export type MonthlyCloseAssessmentInput = {
  summaryStatus: string | null;
  syncStatus: SyncHealth;
  emailReports: number;
  smsReports: number;
  automationReports: number;
  missingInputs: string[];
  smsCreditPriceUsd: number;
  monthlySubscriptionCostUsd: number;
  agencyRetainerCostIls: number;
  hasMetricSnapshot: boolean;
};

export type MonthlyCloseAssessment = {
  stage: MonthlyCloseStage;
  dataIssues: string[];
  costIssues: string[];
  needsAttention: boolean;
};

export function normalizeMonthlyCloseStage(status: string | null): MonthlyCloseStage {
  if (status === "sent" || status === "approved" || status === "draft") return status;
  return "not_started";
}

export function assessMonthlyClose(input: MonthlyCloseAssessmentInput): MonthlyCloseAssessment {
  const dataIssues: string[] = [];
  if (input.syncStatus === "failed") dataIssues.push("הסנכרון האחרון נכשל");
  if (input.syncStatus === "stale") dataIssues.push("הסנכרון אינו עדכני");
  if (input.syncStatus === "never") dataIssues.push("החשבון טרם סונכרן");
  if (input.syncStatus === "syncing") dataIssues.push("סנכרון בתהליך");
  if (input.emailReports + input.smsReports + input.automationReports === 0) {
    dataIssues.push("אין דוחות בחודש הנבחר");
  }
  if (!input.hasMetricSnapshot) dataIssues.push("אין snapshot יומי");

  const costIssues: string[] = [];
  if (input.smsReports > 0 && input.smsCreditPriceUsd <= 0) costIssues.push("מחיר SMS");
  if (input.monthlySubscriptionCostUsd <= 0) costIssues.push("מנוי Flashy");
  if (input.agencyRetainerCostIls <= 0) costIssues.push("ריטיינר");

  const stage = normalizeMonthlyCloseStage(input.summaryStatus);
  return {
    stage,
    dataIssues,
    costIssues,
    needsAttention:
      dataIssues.length > 0 ||
      costIssues.length > 0 ||
      input.missingInputs.length > 0 ||
      stage !== "sent",
  };
}
