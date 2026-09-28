import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, getAccessContext, isAdminRole, requireAdmin } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  buildMonthlySummary,
  buildMonthlyWhatsappText,
  monthLabel,
  monthlyPeriod,
  type MonthlySummaryManualInput,
} from "@/lib/monthly-summary";
import { loadMonthlySummarySource, monthlySummaryResponse } from "@/lib/monthly-summary-service";
import {
  clientUsers,
  flashyAccounts,
  monthlySummaries,
  siteRevenueBenchmarks,
  users,
} from "@/lib/schema";

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function authorizedAccount(accountId: string, adminOnly = false) {
  const context = adminOnly ? await requireAdmin() : await getAccessContext();
  if (!context.ok) return context;
  const account = await getDb().select({ id: flashyAccounts.id, clientId: flashyAccounts.clientId })
    .from(flashyAccounts).where(eq(flashyAccounts.id, accountId)).limit(1).then((rows) => rows[0]);
  if (!account?.clientId) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "חשבון Flashy לא נמצא." }, { status: 404 }) };
  }
  const denied = assertClientAccess(context.access, account.clientId);
  if (denied) return { ok: false as const, response: denied };
  return { ok: true as const, access: context.access, account };
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 });
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  const authorization = await authorizedAccount(accountId);
  if (!authorization.ok) return authorization.response;
  const db = getDb();
  let rows = await db.select().from(monthlySummaries)
    .where(eq(monthlySummaries.flashyAccountId, accountId))
    .orderBy(desc(monthlySummaries.periodStart), desc(monthlySummaries.version));
  if (!isAdminRole(authorization.access.role)) {
    rows = rows.filter((row) => row.status === "approved" || row.status === "sent");
  }
  let suggestedRecipients: string[] = [];
  if (isAdminRole(authorization.access.role)) {
    const links = await db.select({ email: users.email })
      .from(clientUsers)
      .innerJoin(users, eq(clientUsers.userId, users.id))
      .where(and(
        eq(clientUsers.clientId, authorization.account.clientId!),
        eq(users.status, "active"),
      ));
    suggestedRecipients = links.map((item) => item.email).filter(Boolean);
  }
  return NextResponse.json({
    success: true,
    data: rows.map((row) => monthlySummaryResponse(row, url.origin)),
    suggestedRecipients,
  });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ success: false, message: "Neon עדיין לא מחובר." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "").trim();
  const month = String(body.month ?? "").trim();
  let period: ReturnType<typeof monthlyPeriod>;
  try {
    period = monthlyPeriod(month);
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "חודש לא תקין." }, { status: 400 });
  }
  const authorization = await authorizedAccount(accountId, true);
  if (!authorization.ok) return authorization.response;
  const source = await loadMonthlySummarySource(accountId).catch(() => null);
  if (!source) return NextResponse.json({ success: false, message: "לא ניתן לקרוא את דוחות החשבון." }, { status: 404 });

  const db = getDb();
  const savedSiteRevenue = await db.select().from(siteRevenueBenchmarks).where(and(
    eq(siteRevenueBenchmarks.flashyAccountId, accountId),
    eq(siteRevenueBenchmarks.rangeStart, period.start),
    eq(siteRevenueBenchmarks.rangeEnd, period.end),
  )).limit(1).then((rows) => rows[0]);
  const explicitSiteRevenue = nullableNumber(body.siteRevenue);
  const manual: MonthlySummaryManualInput = {
    siteRevenue: explicitSiteRevenue ?? (savedSiteRevenue ? Number(savedSiteRevenue.revenue) : null),
    popupSignups: nullableNumber(body.popupSignups),
    popupConversionRate: nullableNumber(body.popupConversionRate),
    note: String(body.note ?? "").trim().slice(0, 4000),
  };
  if (explicitSiteRevenue !== null) {
    await db.insert(siteRevenueBenchmarks).values({
      flashyAccountId: accountId,
      rangeStart: period.start,
      rangeEnd: period.end,
      revenue: explicitSiteRevenue.toFixed(2),
      updatedBy: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [siteRevenueBenchmarks.flashyAccountId, siteRevenueBenchmarks.rangeStart, siteRevenueBenchmarks.rangeEnd],
      set: { revenue: explicitSiteRevenue.toFixed(2), source: "manual", updatedAt: new Date() },
    });
  }
  const snapshot = buildMonthlySummary({ ...source, month, manual });
  const existing = await db.select().from(monthlySummaries).where(and(
    eq(monthlySummaries.flashyAccountId, accountId),
    eq(monthlySummaries.periodStart, period.start),
  )).orderBy(desc(monthlySummaries.version));
  const latest = existing[0];
  const now = new Date();
  let row: typeof monthlySummaries.$inferSelect;
  if (latest?.status === "draft") {
    [row] = await db.update(monthlySummaries).set({
      snapshot,
      manualInputs: manual,
      whatsappText: buildMonthlyWhatsappText(snapshot),
      emailSubject: `סיכום ${monthLabel(month)} | addz Growth OS`,
      internalNote: manual.note || null,
      updatedAt: now,
    }).where(eq(monthlySummaries.id, latest.id)).returning();
  } else {
    [row] = await db.insert(monthlySummaries).values({
      clientId: source.clientId,
      flashyAccountId: accountId,
      periodStart: period.start,
      periodEnd: period.end,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      snapshot,
      manualInputs: manual,
      whatsappText: buildMonthlyWhatsappText(snapshot),
      emailSubject: `סיכום ${monthLabel(month)} | addz Growth OS`,
      internalNote: manual.note || null,
      createdByUserId: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
      updatedAt: now,
    }).returning();
  }
  const origin = new URL(request.url).origin;
  await recordAudit({
    actorUserId: authorization.access.userId,
    action: "monthly_summary.generated",
    entityType: "monthly_summary",
    entityId: row.id,
    metadata: { accountId, month, version: row.version, missing: snapshot.completeness.missing },
  });
  return NextResponse.json({ success: true, data: monthlySummaryResponse(row, origin) }, { status: latest?.status === "draft" ? 200 : 201 });
}
