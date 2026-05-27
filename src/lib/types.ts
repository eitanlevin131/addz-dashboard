export type ModuleKey = "reports" | "planner" | "ai";

export type Channel = "email" | "sms";

export type CampaignKind = "campaign" | "automation";

export type PlanStatus = "draft" | "ready" | "approved" | "sent";

export type UserRole = "admin" | "client";

export interface Client {
  id: string;
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
  date: string;
  channel: Channel;
  kind: CampaignKind;
  status: PlanStatus;
  title: string;
  owner: string;
  notes: string;
  flashyUrl?: string;
  assetUrl?: string;
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
