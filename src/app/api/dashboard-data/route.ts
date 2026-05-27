import { NextResponse } from "next/server";
import { asc, desc } from "drizzle-orm";
import { getAccessContext, isAdminRole } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  automationReports,
  clients,
  emailCampaignReports,
  flashyAccounts,
  newsletterPlans,
  smsCampaignReports,
} from "@/lib/schema";
import type {
  AutomationReport,
  Channel,
  Client,
  EmailCampaignReport,
  FlashyAccount,
  NewsletterPlan,
  PlanStatus,
  SmsCampaignReport,
} from "@/lib/types";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

export async function GET() {
  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        success: false,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Neon עדיין לא מחובר.",
      },
      { status: 409 },
    );
  }

  const db = getDb();
  const [
    clientRows,
    accountRows,
    emailRows,
    smsRows,
    automationRows,
    planRows,
  ] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.createdAt)),
    db.select().from(flashyAccounts).orderBy(desc(flashyAccounts.createdAt)),
    db.select().from(emailCampaignReports).orderBy(desc(emailCampaignReports.sentAt)),
    db.select().from(smsCampaignReports).orderBy(desc(smsCampaignReports.sentAt)),
    db.select().from(automationReports).orderBy(desc(automationReports.reportDate)),
    db.select().from(newsletterPlans).orderBy(asc(newsletterPlans.plannedDate)),
  ]);
  const allowedClientIds = isAdminRole(accessContext.access.role)
    ? null
    : new Set(accessContext.access.clientIds ?? []);
  const visibleClientRows = allowedClientIds
    ? clientRows.filter((client) => allowedClientIds.has(client.id))
    : clientRows;
  const visibleClientIdSet = new Set(visibleClientRows.map((client) => client.id));
  const visibleAccountRows = accountRows.filter(
    (account) => account.clientId && visibleClientIdSet.has(account.clientId),
  );
  const visibleAccountIdSet = new Set(visibleAccountRows.map((account) => account.id));
  const visiblePlanRows = planRows.filter((plan) => plan.clientId && visibleClientIdSet.has(plan.clientId));

  return NextResponse.json({
    success: true,
    data: {
      clients: visibleClientRows.map(
        (client): Client => ({
          id: client.id,
          name: client.name,
          owner: client.owner ?? "",
          industry: client.industry ?? "",
          visibleModules: (client.visibleModules ?? ["reports", "planner", "ai"]) as Client["visibleModules"],
        }),
      ),
      accounts: visibleAccountRows.map(
        (account): FlashyAccount => ({
          id: account.id,
          clientId: account.clientId ?? "",
          flashyAccountId: account.flashyAccountId ?? 0,
          name: account.name,
          website: account.website ?? "",
          currency: account.currency,
          timezone: account.timezone,
          credits: 0,
          usdIlsRate: toNumber(account.usdIlsRate),
          smsCreditPriceUsd: toNumber(account.smsCreditPriceUsd),
          monthlySubscriptionCostUsd: toNumber(account.monthlySubscriptionCostUsd),
          agencyRetainerCostIls: toNumber(account.agencyRetainerCostIls),
          active: account.active,
          lastSyncAt: account.lastSyncAt?.toISOString() ?? account.createdAt.toISOString(),
        }),
      ),
      emailReports: emailRows.filter((report) => report.flashyAccountId && visibleAccountIdSet.has(report.flashyAccountId)).map(
        (report): EmailCampaignReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          campaignId: report.campaignId,
          campaignName: report.campaignName ?? "קמפיין אימייל",
          subjectLine: report.subjectLine ?? "",
          sentAt: report.sentAt.toISOString(),
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          totalOpens: report.totalOpens,
          uniqueClicks: 0,
          totalClicks: report.totalClicks,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
          totalBounces: 0,
          unsubscribed: 0,
          spam: 0,
        }),
      ),
      smsReports: smsRows.filter((report) => report.flashyAccountId && visibleAccountIdSet.has(report.flashyAccountId)).map(
        (report): SmsCampaignReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          campaignId: report.campaignId,
          campaignName: report.campaignName ?? "קמפיין SMS",
          sentAt: report.sentAt.toISOString(),
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          uniqueClicks: 0,
          totalClicks: report.totalClicks,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
          unsubscribed: 0,
        }),
      ),
      automationReports: automationRows.filter((report) => report.flashyAccountId && visibleAccountIdSet.has(report.flashyAccountId)).map(
        (report): AutomationReport => ({
          id: report.id,
          accountId: report.flashyAccountId ?? "",
          automationId: report.automationId,
          automationName: report.automationName ?? "אוטומציה",
          channel: report.channel as Channel,
          date: report.reportDate,
          totalRecipients: report.totalRecipients,
          totalDelivered: report.totalDelivered,
          totalOpens: report.totalOpens,
          totalClicks: report.totalClicks,
          sentEmails: report.sentEmails,
          openedEmails: report.openedEmails,
          clickedEmails: report.clickedEmails,
          sentSms: report.sentSms,
          clickedSms: report.clickedSms,
          totalEntered: report.totalEntered,
          totalCompleted: report.totalCompleted,
          failedMessages: report.failedMessages,
          purchases: report.purchases,
          revenueGenerated: toNumber(report.revenueGenerated),
        }),
      ),
      newsletterPlans: visiblePlanRows.map(
        (plan): NewsletterPlan => ({
          id: plan.id,
          clientId: plan.clientId ?? "",
          accountId: plan.flashyAccountId ?? "",
          date: plan.plannedDate,
          channel: plan.channel as Channel,
          kind: plan.kind as NewsletterPlan["kind"],
          status: plan.status as PlanStatus,
          title: plan.title,
          owner: plan.owner ?? "",
          notes: plan.notes ?? "",
          flashyUrl: plan.flashyUrl ?? undefined,
          assetUrl: plan.assetUrl ?? undefined,
        }),
      ),
    },
  });
}
