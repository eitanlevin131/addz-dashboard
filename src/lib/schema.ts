import {
  boolean,
  check,
  date,
  integer,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { IncludedService } from "@/lib/client-foundation";
import type { PackageCode, PackageScope } from "@/lib/client-packages";
import type { DailyMetricSnapshot, MetricSnapshotRevision } from "@/lib/types";
import type { MonthlySummaryManualInput, MonthlySummarySnapshot } from "@/lib/monthly-summary";
import type { ScanState } from "@/lib/website-intelligence/state";
import type { QuestionnaireAnswers, QuestionnaireSnapshot } from "@/lib/questionnaire/core";
import type { Decisions, KickoffSnapshot, Topic } from "@/lib/kickoff/core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  sessionVersion: integer("session_version").notNull().default(0),
  loginAttempts: integer("login_attempts").notNull().default(0),
  loginWindowStart: timestamp("login_window_start", { withTimezone: true }),
  role: text("role").notNull().default("client"),
  status: text("status").notNull().default("active"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    emailHash: text("email_hash").notNull(),
    requestIpHash: text("request_ip_hash").notNull(),
    codeHash: text("code_hash"),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
  },
  (table) => [
    index("login_codes_email_requested_idx").on(table.emailHash, table.requestedAt),
    index("login_codes_ip_requested_idx").on(table.requestIpHash, table.requestedAt),
  ],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  urlSlug: text("url_slug"),
  owner: text("owner"),
  industry: text("industry"),
  visibleModules: text("visible_modules").array().notNull().default(["reports", "planner", "ai"]),
  onboardingStatus: text("onboarding_status").notNull().default("ready"),
  website: text("website"),
  packageName: text("package_name"),
  packageCode: text("package_code").$type<PackageCode>(),
  commercialScope: jsonb("commercial_scope").$type<PackageScope>(),
  oneTimeAmount: numeric("one_time_amount", { precision: 12, scale: 2 }),
  monthlyRetainerAmount: numeric("monthly_retainer_amount", { precision: 12, scale: 2 }),
  includedServices: jsonb("included_services").$type<IncludedService[]>().notNull().default([]),
  startDate: date("start_date"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  internalNotes: text("internal_notes"),
  onboardingStage: text("onboarding_stage"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("clients_url_slug_unique").on(table.urlSlug),
  check("clients_url_slug_format", sql`${table.urlSlug} IS NULL OR (${table.urlSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.urlSlug}) <= 80)`),
]);

export const clientContacts = pgTable("client_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("client_contacts_client_idx").on(table.clientId), uniqueIndex("client_contacts_primary_idx").on(table.clientId).where(sql`${table.isPrimary} = true`)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  actorType: text("actor_type"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("audit_logs_client_time_idx").on(table.clientId, table.createdAt)]);

export const clientUsers = pgTable(
  "client_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.clientId, table.userId)],
);

export const flashyAccounts = pgTable("flashy_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  flashyAccountId: integer("flashy_account_id"),
  name: text("name").notNull(),
  website: text("website"),
  currency: text("currency").notNull().default("ILS"),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  usdIlsRate: numeric("usd_ils_rate", { precision: 10, scale: 4 }).notNull().default("3.7"),
  smsCreditPriceUsd: numeric("sms_credit_price_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  monthlySubscriptionCostUsd: numeric("monthly_subscription_cost_usd", {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default("0"),
  agencyRetainerCostIls: numeric("agency_retainer_cost_ils", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  active: boolean("active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
    onDelete: "cascade",
  }),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

export const accountMetricSnapshots = pgTable(
  "account_metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashyAccountId: uuid("flashy_account_id")
      .notNull()
      .references(() => flashyAccounts.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    coverageStart: date("coverage_start").notNull(),
    coverageEnd: date("coverage_end").notNull(),
    lookbackDays: integer("lookback_days").notNull(),
    source: text("source").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    emailRevenue: numeric("email_revenue", { precision: 16, scale: 2 }).notNull(),
    smsRevenue: numeric("sms_revenue", { precision: 16, scale: 2 }).notNull(),
    automationRevenue: numeric("automation_revenue", { precision: 16, scale: 2 }).notNull(),
    totalRevenue: numeric("total_revenue", { precision: 16, scale: 2 }).notNull(),
    emailPurchases: integer("email_purchases").notNull(),
    smsPurchases: integer("sms_purchases").notNull(),
    automationPurchases: integer("automation_purchases").notNull(),
    totalPurchases: integer("total_purchases").notNull(),
    smsMessages: integer("sms_messages").notNull(),
    smsCostUsd: numeric("sms_cost_usd", { precision: 16, scale: 2 }).notNull(),
    smsCostIls: numeric("sms_cost_ils", { precision: 16, scale: 2 }).notNull(),
    subscriptionCostIls: numeric("subscription_cost_ils", { precision: 16, scale: 2 }).notNull(),
    retainerCostIls: numeric("retainer_cost_ils", { precision: 16, scale: 2 }).notNull(),
    totalCostIls: numeric("total_cost_ils", { precision: 16, scale: 2 }).notNull(),
    usdIlsRate: numeric("usd_ils_rate", { precision: 10, scale: 4 }).notNull(),
    smsCreditPriceUsd: numeric("sms_credit_price_usd", { precision: 10, scale: 4 }).notNull(),
    emailReports: integer("email_reports").notNull(),
    smsReports: integer("sms_reports").notNull(),
    automationReports: integer("automation_reports").notNull(),
    dailyMetrics: jsonb("daily_metrics").$type<DailyMetricSnapshot[]>().notNull(),
    revision: jsonb("revision").$type<MetricSnapshotRevision>().notNull(),
  },
  (table) => [
    index("account_metric_snapshots_account_captured_at_idx").on(
      table.flashyAccountId,
      table.capturedAt,
    ),
  ],
);

export const accountChangeEvents = pgTable(
  "account_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    flashyAccountId: uuid("flashy_account_id")
      .notNull()
      .references(() => flashyAccounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details").notNull(),
    reason: text("reason"),
    areas: text("areas").array().notNull().default([]),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("account_change_events_account_occurred_idx").on(table.flashyAccountId, table.occurredAt),
    index("account_change_events_client_occurred_idx").on(table.clientId, table.occurredAt),
  ],
);

export const siteRevenueBenchmarks = pgTable(
  "site_revenue_benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashyAccountId: uuid("flashy_account_id")
      .notNull()
      .references(() => flashyAccounts.id, { onDelete: "cascade" }),
    rangeStart: date("range_start").notNull(),
    rangeEnd: date("range_end").notNull(),
    revenue: numeric("revenue", { precision: 16, scale: 2 }).notNull(),
    source: text("source").notNull().default("manual"),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.flashyAccountId, table.rangeStart, table.rangeEnd)],
);

export const monthlySummaries = pgTable(
  "monthly_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    flashyAccountId: uuid("flashy_account_id")
      .notNull()
      .references(() => flashyAccounts.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    snapshot: jsonb("snapshot").$type<MonthlySummarySnapshot>().notNull(),
    manualInputs: jsonb("manual_inputs").$type<MonthlySummaryManualInput>().notNull(),
    whatsappText: text("whatsapp_text").notNull(),
    emailSubject: text("email_subject").notNull(),
    internalNote: text("internal_note"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.flashyAccountId, table.periodStart, table.version),
    index("monthly_summaries_account_period_idx").on(table.flashyAccountId, table.periodStart),
    index("monthly_summaries_client_created_idx").on(table.clientId, table.createdAt),
  ],
);

export const monthlySummaryDeliveries = pgTable(
  "monthly_summary_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monthlySummaryId: uuid("monthly_summary_id")
      .notNull()
      .references(() => monthlySummaries.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    recipients: jsonb("recipients").$type<string[]>().notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    sentByUserId: text("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("monthly_summary_deliveries_summary_created_idx").on(table.monthlySummaryId, table.createdAt)],
);

export const emailCampaignReports = pgTable(
  "email_campaign_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
      onDelete: "cascade",
    }),
    campaignId: integer("campaign_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    campaignName: text("campaign_name"),
    subjectLine: text("subject_line"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalOpens: integer("total_opens").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull().default("0"),
    raw: jsonb("raw").notNull().default({}),
  },
  (table) => [unique().on(table.flashyAccountId, table.campaignId, table.sentAt)],
);

export const smsCampaignReports = pgTable(
  "sms_campaign_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
      onDelete: "cascade",
    }),
    campaignId: integer("campaign_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    campaignName: text("campaign_name"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull().default("0"),
    raw: jsonb("raw").notNull().default({}),
  },
  (table) => [unique().on(table.flashyAccountId, table.campaignId, table.sentAt)],
);

export const automationReports = pgTable(
  "automation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
      onDelete: "cascade",
    }),
    automationId: integer("automation_id").notNull(),
    reportDate: date("report_date").notNull(),
    automationName: text("automation_name"),
    channel: text("channel").notNull(),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalOpens: integer("total_opens").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    sentEmails: integer("sent_emails").notNull().default(0),
    openedEmails: integer("opened_emails").notNull().default(0),
    clickedEmails: integer("clicked_emails").notNull().default(0),
    sentSms: integer("sent_sms").notNull().default(0),
    clickedSms: integer("clicked_sms").notNull().default(0),
    totalEntered: integer("total_entered").notNull().default(0),
    totalCompleted: integer("total_completed").notNull().default(0),
    failedMessages: integer("failed_messages").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull().default("0"),
    raw: jsonb("raw").notNull().default({}),
  },
  (table) => [
    unique().on(table.flashyAccountId, table.automationId, table.reportDate, table.channel),
  ],
);

export const newsletterPlans = pgTable(
  "newsletter_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
      onDelete: "cascade",
    }),
    plannedDate: date("planned_date"),
    plannedTime: text("planned_time"),
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    owner: text("owner"),
    notes: text("notes"),
    brief: text("brief"),
    audience: text("audience"),
    offer: text("offer"),
    cta: text("cta"),
    objective: text("objective"),
    learning: text("learning"),
    learningUpdatedAt: timestamp("learning_updated_at", { withTimezone: true }),
    couponCode: text("coupon_code"),
    flashyUrl: text("flashy_url"),
    assetUrl: text("asset_url"),
    matchedCampaignId: integer("matched_campaign_id"),
    matchedCampaignChannel: text("matched_campaign_channel"),
    matchMethod: text("match_method"),
    matchConfidence: numeric("match_confidence", { precision: 5, scale: 4 }),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    matchConfirmedAt: timestamp("match_confirmed_at", { withTimezone: true }),
    matchingDisabled: boolean("matching_disabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.flashyAccountId, table.matchedCampaignChannel, table.matchedCampaignId),
  ],
);

export const newsletterPlanCampaignMatches = pgTable(
  "newsletter_plan_campaign_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    newsletterPlanId: uuid("newsletter_plan_id").notNull().references(() => newsletterPlans.id, { onDelete: "cascade" }),
    flashyAccountId: uuid("flashy_account_id").notNull().references(() => flashyAccounts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    campaignId: integer("campaign_id"),
    method: text("method"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    matchingDisabled: boolean("matching_disabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.newsletterPlanId, table.channel),
    unique().on(table.flashyAccountId, table.channel, table.campaignId),
    index("newsletter_plan_matches_plan_idx").on(table.newsletterPlanId),
  ],
);

export const newsletterPlanAssets = pgTable(
  "newsletter_plan_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    newsletterPlanId: uuid("newsletter_plan_id").notNull().references(() => newsletterPlans.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    url: text("url"),
    blobPathname: text("blob_pathname"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    size: integer("size"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("newsletter_plan_assets_plan_idx").on(table.newsletterPlanId)],
);

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull(),
  body: text("body").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiChatMessages = pgTable("ai_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiAccountMemory = pgTable("ai_account_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).unique(),
  brandVoice: text("brand_voice"),
  audiences: text("audiences"),
  products: text("products"),
  learnings: text("learnings"),
  constraints: text("constraints"),
  documents: jsonb("documents").$type<{ name: string; content: string; createdAt: string }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiContentDrafts = pgTable(
  "ai_content_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    flashyAccountId: uuid("flashy_account_id").notNull().references(() => flashyAccounts.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    preheader: text("preheader"),
    status: text("status").notNull().default("draft"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_content_drafts_account_updated_idx").on(table.flashyAccountId, table.updatedAt),
    index("ai_content_drafts_client_status_idx").on(table.clientId, table.status),
  ],
);

// 0019 defers the NO ACTION history/AI-run references until transaction commit,
// preserving provenance while allowing a client's complete cascade to finish.
export const websiteScans = pgTable("website_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  previousScanId: uuid("previous_scan_id"),
  websiteUrl: text("website_url").notNull(),
  finalUrl: text("final_url"),
  version: text("version").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"),
  state: jsonb("state").$type<ScanState>().notNull(),
  requestCount: integer("request_count").notNull().default(0),
  stepAttempts: integer("step_attempts").notNull().default(0),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  nextRequestAt: timestamp("next_request_at", { withTimezone: true }),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("website_scans_client_time_idx").on(table.clientId, table.createdAt),
  uniqueIndex("website_scans_active_client_idx").on(table.clientId).where(sql`${table.status} in ('pending','running','processing')`),
  unique("website_scans_client_id_idx").on(table.clientId, table.id),
  check("website_scans_status_check", sql`${table.status} in ('pending','running','processing','completed','completed_with_warnings','failed','cancelled')`),
  foreignKey({ columns: [table.clientId, table.previousScanId], foreignColumns: [table.clientId, table.id], name: "website_scans_previous_fk" }),
]);
export const websiteScanSources = pgTable("website_scan_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => websiteScans.id, { onDelete: "cascade" }),
  url: text("url").notNull(), canonicalUrl: text("canonical_url").notNull(), urlHash: text("url_hash").notNull(),
  pageType: text("page_type").notNull(), depth: integer("depth").notNull().default(0),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  title: text("title"), language: text("language"), text: text("text"), contentHash: text("content_hash"),
  extracted: jsonb("extracted").$type<Record<string, unknown>>().notNull().default({}),
  httpStatus: integer("http_status"), bytes: integer("bytes"), errorCode: text("error_code"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
}, table => [
  uniqueIndex("website_scan_sources_url_idx").on(table.scanId, table.urlHash),
  unique("website_scan_sources_scan_id_idx").on(table.scanId, table.id),
  index("website_scan_sources_status_idx").on(table.scanId, table.status),
]);
export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  scanId: uuid("scan_id").notNull(), task: text("task").notNull(), attempt: integer("attempt").notNull(),
  model: text("model").notNull(), skillName: text("skill_name").notNull(), skillVersion: text("skill_version").notNull(),
  promptVersion: text("prompt_version").notNull(), schemaVersion: text("schema_version").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(), inputHash: text("input_hash").notNull(),
  output: jsonb("output"), status: text("status").notNull(), errorCode: text("error_code"),
  durationMs: integer("duration_ms"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), providerRequestId: text("provider_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.clientId, table.scanId], foreignColumns: [websiteScans.clientId, websiteScans.id], name: "ai_runs_scan_client_fk" }).onDelete("cascade"),
  unique("ai_runs_scan_id_idx").on(table.scanId, table.id),
  uniqueIndex("ai_runs_task_attempt_idx").on(table.scanId, table.task, table.attempt),
]);
export const websiteFindings = pgTable("website_findings", {
  id: uuid("id").primaryKey().defaultRandom(), scanId: uuid("scan_id").notNull().references(() => websiteScans.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull(), aiRunId: uuid("ai_run_id"),
  category: text("category").notNull(), key: text("key").notNull(), value: jsonb("value").notNull(),
  evidence: text("evidence").notNull(), locator: text("locator"), sourceType: text("source_type").notNull(),
  observationStatus: text("observation_status").notNull(), confidence: text("confidence").notNull(),
  findingHash: text("finding_hash").notNull(), reviewDisposition: text("review_disposition").notNull().default("normal"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.scanId, table.sourceId], foreignColumns: [websiteScanSources.scanId, websiteScanSources.id], name: "website_findings_source_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.scanId, table.aiRunId], foreignColumns: [aiRuns.scanId, aiRuns.id], name: "website_findings_ai_run_fk" }),
  index("website_findings_category_idx").on(table.scanId, table.category),
  uniqueIndex("website_findings_hash_idx").on(table.scanId, table.findingHash),
  check("website_findings_observation_check", sql`${table.observationStatus} in ('observed','inferred')`),
  check("website_findings_review_check", sql`${table.reviewDisposition} in ('normal','needs_review','ignored')`),
  check("website_findings_confidence_check", sql`${table.confidence} in ('high','medium','low')`),
]);

export const clientQuestionnaires = pgTable("client_questionnaires", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  snapshot: jsonb("snapshot").$type<QuestionnaireSnapshot>().notNull(),
  selectedIds: jsonb("selected_ids").$type<string[]>().notNull(),
  answers: jsonb("answers").$type<QuestionnaireAnswers>().notNull().default({}),
  revision: integer("revision").notNull().default(0),
  status: text("status").notNull().default("draft"),
  tokenHash: text("token_hash"),
  linkExpiresAt: timestamp("link_expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("client_questionnaires_client_idx").on(table.clientId),
  uniqueIndex("client_questionnaires_token_idx").on(table.tokenHash).where(sql`${table.tokenHash} is not null`),
  check("client_questionnaires_status_check", sql`${table.status} in ('draft','ready','sent','in_progress','submitted','reviewed')`),
  check("client_questionnaires_revision_check", sql`${table.revision} >= 0`),
  check("client_questionnaires_json_check", sql`jsonb_typeof(${table.snapshot}) = 'object' and jsonb_typeof(${table.answers}) = 'object' and jsonb_typeof(${table.selectedIds}) = 'array'`),
  check("client_questionnaires_token_check", sql`${table.tokenHash} is null or (${table.tokenHash} ~ '^[a-f0-9]{64}$' and ${table.linkExpiresAt} is not null)`),
]);
export const questionnaireRateLimits = pgTable("questionnaire_rate_limits", {
  bucket: text("bucket").primaryKey(),
  requests: integer("requests").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("questionnaire_rate_limits_expiry_idx").on(table.expiresAt)]);

export const clientCharacterizations = pgTable("client_characterizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  questionnaireId: uuid("questionnaire_id").references(() => clientQuestionnaires.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  snapshot: jsonb("snapshot").$type<KickoffSnapshot>().notNull(),
  addedTopics: jsonb("added_topics").$type<Topic[]>().notNull().default([]),
  decisions: jsonb("decisions").$type<Decisions>().notNull().default({}),
  revision: integer("revision").notNull().default(0),
  status: text("status").notNull().default("in_progress"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("client_characterizations_client_idx").on(table.clientId),
  index("client_characterizations_questionnaire_idx").on(table.questionnaireId),
  check("client_characterizations_status_check", sql`${table.status} in ('in_progress','completed')`),
  check("client_characterizations_revision_check", sql`${table.revision} >= 0`),
  check("client_characterizations_json_check", sql`jsonb_typeof(${table.snapshot}) = 'object' and jsonb_typeof(${table.addedTopics}) = 'array' and jsonb_typeof(${table.decisions}) = 'object'`),
  check("client_characterizations_completion_check", sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`),
]);
