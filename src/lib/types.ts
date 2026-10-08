export type ModuleKey = "reports" | "planner" | "ai";

export type Channel = "email" | "sms";

export type PlannerChannel = Channel | "mixed";

export type CampaignObjective = "revenue" | "launch" | "restock" | "content" | "retention" | "other";

export type CampaignKind = "campaign" | "automation";

export type PlanStatus = "planned" | "postponed" | "draft" | "idea" | "ready" | "approved" | "sent";

export type UserRole = "owner" | "admin" | "client";

export interface Client {
  id: string;
  urlSlug?: string | null;
  name: string;
  owner: string;
  industry: string;
  visibleModules: ModuleKey[];
}

export interface FlashyAccount {
  id: string;
  clientId: string;
  flashyAccountId: number;
  name: string;
  website: string;
  currency: string;
  timezone: string;
  credits: number;
  usdIlsRate: number;
  smsCreditPriceUsd: number;
  monthlySubscriptionCostUsd: number;
  agencyRetainerCostIls: number;
  active: boolean;
  lastSyncAt: string;
  syncStatus?: "healthy" | "syncing" | "failed" | "stale" | "never";
  syncError?: string | null;
  syncStartedAt?: string | null;
  syncWarnings?: string[];
  lastSyncImported?: SyncImportedCounts | null;
}

export interface SyncImportedCounts {
  emailCampaigns: number;
  smsCampaigns: number;
  automations: number;
}

export interface SyncHistoryEntry {
  id: string;
  accountId: string;
  status: "success" | "warning" | "failed" | "skipped";
  source: "manual" | "cron" | "onboarding" | "system";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  lookbackDays: number;
  imported: SyncImportedCounts;
  checksPassed: number;
  checksTotal: number;
  warnings: string[];
  message: string;
  metricSnapshot?: MetricSnapshotSummary;
}

export interface DailyMetricSnapshot {
  date: string;
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
}

export interface MetricSnapshotRevisionDay {
  date: string;
  revenueDelta: number;
  purchasesDelta: number;
  smsCostIlsDelta: number;
}

export interface MetricSnapshotRevision {
  previousSnapshotId: string | null;
  comparableDays: number;
  changedDays: number;
  historicalChangedDays: number;
  historicalRevenueDelta: number;
  historicalPurchasesDelta: number;
  historicalSmsCostIlsDelta: number;
  costConfigurationChanged: boolean;
  largestChanges: MetricSnapshotRevisionDay[];
}

export interface MetricSnapshotSummary {
  snapshotId: string;
  comparedToPrevious: boolean;
  capturedAt: string;
  coverageStart: string;
  coverageEnd: string;
  totalRevenue: number;
  totalPurchases: number;
  totalCostIls: number;
  historicalChangedDays: number;
  historicalRevenueDelta: number;
  historicalPurchasesDelta: number;
  historicalSmsCostIlsDelta: number;
  costConfigurationChanged: boolean;
  largestChanges: MetricSnapshotRevisionDay[];
}

export interface EmailCampaignReport {
  id: string;
  accountId: string;
  campaignId: number;
  campaignName: string;
  subjectLine: string;
  sentAt: string;
  totalRecipients: number;
  totalDelivered: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
  purchases: number;
  revenueGenerated: number;
  totalBounces: number;
  unsubscribed: number;
  spam: number;
}

export interface SmsCampaignReport {
  id: string;
  accountId: string;
  campaignId: number;
  campaignName: string;
  messageText: string;
  sentAt: string;
  totalRecipients: number;
  totalDelivered: number;
  uniqueClicks: number;
  totalClicks: number;
  purchases: number;
  revenueGenerated: number;
  unsubscribed: number;
}

export interface AutomationReport {
  id: string;
  accountId: string;
  automationId: number;
  automationName: string;
  channel: Channel;
  date: string;
  totalRecipients: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  sentEmails?: number;
  openedEmails?: number;
  clickedEmails?: number;
  sentSms?: number;
  clickedSms?: number;
  totalEntered?: number;
  totalCompleted?: number;
  failedMessages?: number;
  purchases: number;
  revenueGenerated: number;
}

export interface NewsletterPlan {
  id: string;
  clientId: string;
  accountId: string;
  date: string | null;
  time?: string;
  channel: PlannerChannel;
  kind: CampaignKind;
  status: PlanStatus;
  title: string;
  owner: string;
  notes: string;
  brief?: string;
  audience?: string;
  offer?: string;
  cta?: string;
  objective?: CampaignObjective;
  learning?: string;
  learningUpdatedAt?: string;
  couponCode?: string;
  flashyUrl?: string;
  assetUrl?: string;
  matchedCampaignId?: number;
  matchedCampaignChannel?: Channel;
  matchMethod?: "auto" | "manual";
  matchConfidence?: number;
  matchedAt?: string;
  matchConfirmedAt?: string;
  matchingDisabled?: boolean;
  campaignMatches?: NewsletterPlanCampaignMatch[];
  assets?: NewsletterPlanAsset[];
}

export interface NewsletterPlanCampaignMatch {
  id: string;
  channel: Channel;
  campaignId?: number;
  method?: "auto" | "manual";
  confidence?: number;
  matchedAt?: string;
  confirmedAt?: string;
  matchingDisabled: boolean;
}

export interface NewsletterPlanAsset {
  id: string;
  kind: "link" | "file";
  label: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  downloadUrl?: string;
  createdAt: string;
}

export type AccountChangeArea =
  | "popup"
  | "automation"
  | "email"
  | "sms"
  | "offer"
  | "tracking"
  | "strategy"
  | "account"
  | "other";

export interface AccountChangeEvent {
  id: string;
  clientId: string;
  accountId: string;
  title: string;
  details: string;
  reason: string;
  areas: AccountChangeArea[];
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string | null;
    name: string;
    email: string;
  };
}

export interface AiDataScope {
  label: string;
  start: string;
  end: string;
  source: "flashy-api" | "database-cache";
  complete: boolean;
  warning: string;
  counts: {
    emails: number;
    sms: number;
    automations: number;
  };
}

export interface AiInsight {
  id: string;
  clientId: string;
  title: string;
  category: "send_time" | "subject" | "automation" | "sms" | "risk";
  priority: "high" | "medium" | "low";
  body: string;
  action: string;
}

export interface MetricSummary {
  revenue: number;
  smsCost: number;
  smsCostUsd: number;
  fixedCosts: number;
  subscriptionCostIls: number;
  profit: number;
  roas: number | null;
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  purchases: number;
  conversionRate: number;
  revenuePerMessage: number;
}
