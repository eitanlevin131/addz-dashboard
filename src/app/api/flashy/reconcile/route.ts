import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/access";
import { decryptSecret } from "@/lib/crypto";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { getFlashyReports } from "@/lib/flashy";
import {
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  type RawFlashyRow,
} from "@/lib/flashy-normalize";
import {
  automationReports,
  emailCampaignReports,
  flashyAccounts,
  smsCampaignReports,
} from "@/lib/schema";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function dateInRange(value: Date | string, start: Date, end: Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date >= start && date <= end;
}

function sumBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function groupRevenue<T>(
  items: T[],
  getKey: (item: T) => string,
  getName: (item: T) => string,
  getRevenue: (item: T) => number,
) {
  const groups = new Map<string, { key: string; name: string; revenue: number }>();

  for (const item of items) {
    const key = getKey(item);
    const current = groups.get(key) ?? { key, name: getName(item), revenue: 0 };
    current.revenue += getRevenue(item);
    groups.set(key, current);
  }

  return groups;
}

function groupCampaignReports(
  emails: ReturnType<typeof normalizeEmailReports>,
  sms: ReturnType<typeof normalizeSmsReports>,
) {
  return groupRevenue(
    [
      ...emails.map((item) => ({
        key: `email-${item.campaignId}`,
        name: item.campaignName,
        channel: "Email",
        date: item.sentAt,
        revenue: item.revenueGenerated,
      })),
      ...sms.map((item) => ({
        key: `sms-${item.campaignId}`,
        name: item.campaignName,
        channel: "SMS",
        date: item.sentAt,
        revenue: item.revenueGenerated,
      })),
    ],
    (item) => item.key,
    (item) => `${item.channel} · ${item.name} · ${item.date.slice(0, 10)}`,
    (item) => item.revenue,
  );
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר." },
      { status: 409 },
    );
  }

  const adminContext = await requireAdmin();
  if (!adminContext.ok) return adminContext.response;

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  const start = body.start ? new Date(String(body.start)) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const end = body.end ? new Date(String(body.end)) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (!accountId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json(
      { success: false, message: "חסר חשבון או טווח תאריכים תקין." },
      { status: 400 },
    );
  }

  const db = getDb();
  const account = await db
    .select()
    .from(flashyAccounts)
    .where(eq(flashyAccounts.id, accountId))
    .then((rows) => rows[0]);

  if (!account) {
    return NextResponse.json(
      { success: false, message: "חשבון Flashy לא נמצא." },
      { status: 404 },
    );
  }

  const [emailRows, smsRows, automationRows] = await Promise.all([
    db.select().from(emailCampaignReports).where(eq(emailCampaignReports.flashyAccountId, account.id)),
    db.select().from(smsCampaignReports).where(eq(smsCampaignReports.flashyAccountId, account.id)),
    db.select().from(automationReports).where(eq(automationReports.flashyAccountId, account.id)),
  ]);

  const dbEmails = emailRows.filter((item) => dateInRange(item.sentAt, start, end));
  const dbSms = smsRows.filter((item) => dateInRange(item.sentAt, start, end));
  const dbAutomations = automationRows.filter((item) => dateInRange(item.reportDate, start, end));

  const apiKey = decryptSecret(account.encryptedApiKey);
  const extendedStart = new Date(start);
  extendedStart.setDate(extendedStart.getDate() - 7);
  const reports = await getFlashyReports(
    apiKey,
    Math.floor(start.getTime() / 1000),
    Math.floor(end.getTime() / 1000),
  );
  const extendedReports = await getFlashyReports(
    apiKey,
    Math.floor(extendedStart.getTime() / 1000),
    Math.floor(end.getTime() / 1000),
  );
  const liveEmails = normalizeEmailReports(reports.emails as RawFlashyRow[], account.id);
  const liveSms = normalizeSmsReports(reports.sms as RawFlashyRow[], account.id);
  const liveAutomations = normalizeAutomationReports(reports.automations as RawFlashyRow[], account.id);
  const extendedEmails = normalizeEmailReports(extendedReports.emails as RawFlashyRow[], account.id);
  const extendedSms = normalizeSmsReports(extendedReports.sms as RawFlashyRow[], account.id);

  const dbCampaignRevenue =
    sumBy(dbEmails, (item) => toNumber(item.revenueGenerated)) +
    sumBy(dbSms, (item) => toNumber(item.revenueGenerated));
  const liveCampaignRevenue =
    sumBy(liveEmails, (item) => item.revenueGenerated) +
    sumBy(liveSms, (item) => item.revenueGenerated);
  const dbAutomationRevenue = sumBy(dbAutomations, (item) => toNumber(item.revenueGenerated));
  const liveAutomationRevenue = sumBy(liveAutomations, (item) => item.revenueGenerated);

  const storedCampaignGroups = groupRevenue(
    [
      ...dbEmails.map((item) => ({
        key: `email-${item.campaignId}`,
        name: item.campaignName ?? "קמפיין אימייל",
        revenue: toNumber(item.revenueGenerated),
      })),
      ...dbSms.map((item) => ({
        key: `sms-${item.campaignId}`,
        name: item.campaignName ?? "קמפיין SMS",
        revenue: toNumber(item.revenueGenerated),
      })),
    ],
    (item) => item.key,
    (item) => item.name,
    (item) => item.revenue,
  );
  const liveCampaignGroups = groupRevenue(
    [
      ...liveEmails.map((item) => ({
        key: `email-${item.campaignId}`,
        name: item.campaignName,
        revenue: item.revenueGenerated,
      })),
      ...liveSms.map((item) => ({
        key: `sms-${item.campaignId}`,
        name: item.campaignName,
        revenue: item.revenueGenerated,
      })),
    ],
    (item) => item.key,
    (item) => item.name,
    (item) => item.revenue,
  );
  const extendedCampaignGroups = groupCampaignReports(extendedEmails, extendedSms);
  const boundaryCampaignCandidates = Array.from(extendedCampaignGroups.values())
    .filter((item) => !liveCampaignGroups.has(item.key) && item.revenue > 0)
    .map((item) => ({
      name: item.name,
      revenue: cents(item.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const keys = new Set([...storedCampaignGroups.keys(), ...liveCampaignGroups.keys()]);
  const campaignDifferences = Array.from(keys)
    .map((key) => {
      const stored = storedCampaignGroups.get(key);
      const live = liveCampaignGroups.get(key);
      return {
        name: live?.name ?? stored?.name ?? key,
        storedRevenue: cents(stored?.revenue ?? 0),
        liveRevenue: cents(live?.revenue ?? 0),
        delta: cents((live?.revenue ?? 0) - (stored?.revenue ?? 0)),
      };
    })
    .filter((item) => Math.abs(item.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 12);

  return NextResponse.json({
    success: true,
    data: {
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      stored: {
        emailCampaigns: dbEmails.length,
        smsCampaigns: dbSms.length,
        automations: dbAutomations.length,
        emailRevenue: cents(sumBy(dbEmails, (item) => toNumber(item.revenueGenerated))),
        smsRevenue: cents(sumBy(dbSms, (item) => toNumber(item.revenueGenerated))),
        campaignRevenue: cents(dbCampaignRevenue),
        automationRevenue: cents(dbAutomationRevenue),
      },
      flashy: {
        emailCampaigns: liveEmails.length,
        smsCampaigns: liveSms.length,
        automations: liveAutomations.length,
        emailRevenue: cents(sumBy(liveEmails, (item) => item.revenueGenerated)),
        smsRevenue: cents(sumBy(liveSms, (item) => item.revenueGenerated)),
        campaignRevenue: cents(liveCampaignRevenue),
        automationRevenue: cents(liveAutomationRevenue),
      },
      delta: {
        campaignRevenue: cents(liveCampaignRevenue - dbCampaignRevenue),
        automationRevenue: cents(liveAutomationRevenue - dbAutomationRevenue),
      },
      campaignDifferences,
      boundaryCampaignCandidates,
      checks: reports.checks,
    },
  });
}
