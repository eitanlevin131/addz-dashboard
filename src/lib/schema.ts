import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: text("role").notNull().default("client"),
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

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  owner: text("owner"),
  industry: text("industry"),
  visibleModules: text("visible_modules").array().notNull().default(["reports", "planner", "ai"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const newsletterPlans = pgTable("newsletter_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  flashyAccountId: uuid("flashy_account_id").references(() => flashyAccounts.id, {
    onDelete: "cascade",
  }),
  plannedDate: date("planned_date").notNull(),
  channel: text("channel").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  owner: text("owner"),
  notes: text("notes"),
  flashyUrl: text("flashy_url"),
  assetUrl: text("asset_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
