import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, getAccessContext, isAdminRole } from "@/lib/auth/access";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { flashyAccounts, siteRevenueBenchmarks } from "@/lib/schema";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(searchParams: URLSearchParams) {
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const start = searchParams.get("start")?.trim() ?? "";
  const end = searchParams.get("end")?.trim() ?? "";
  return { accountId, start, end };
}

function validateRange(input: { accountId: string; start: string; end: string }) {
  return Boolean(
    input.accountId &&
      datePattern.test(input.start) &&
      datePattern.test(input.end) &&
      input.start <= input.end,
  );
}

async function authorizeAccount(accountId: string) {
  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext;

  const account = await getDb()
    .select({ id: flashyAccounts.id, clientId: flashyAccounts.clientId })
    .from(flashyAccounts)
    .where(eq(flashyAccounts.id, accountId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!account?.clientId) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: "חשבון Flashy לא נמצא." }, { status: 404 }),
    };
  }

  const denied = assertClientAccess(accessContext.access, account.clientId);
  if (denied) return { ok: false as const, response: denied };
  return { ok: true as const, access: accessContext.access, account };
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: true, data: null, mode: "demo" });
  }

  const range = parseRange(new URL(request.url).searchParams);
  if (!validateRange(range)) {
    return NextResponse.json({ success: false, message: "חסרים חשבון או טווח תאריכים תקין." }, { status: 400 });
  }

  const authorization = await authorizeAccount(range.accountId);
  if (!authorization.ok) return authorization.response;

  const row = await getDb()
    .select()
    .from(siteRevenueBenchmarks)
    .where(
      and(
        eq(siteRevenueBenchmarks.flashyAccountId, range.accountId),
        eq(siteRevenueBenchmarks.rangeStart, range.start),
        eq(siteRevenueBenchmarks.rangeEnd, range.end),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  return NextResponse.json({
    success: true,
    data: row
      ? {
          revenue: Number(row.revenue),
          source: row.source,
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
  });
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, message: "Neon לא מחובר, אי אפשר לשמור את הנתון." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const range = {
    accountId: String(body.accountId ?? "").trim(),
    start: String(body.start ?? "").trim(),
    end: String(body.end ?? "").trim(),
  };
  const revenue = Number(body.revenue);

  if (!validateRange(range) || !Number.isFinite(revenue) || revenue < 0 || revenue > 10_000_000_000) {
    return NextResponse.json({ success: false, message: "יש להזין טווח וסך הכנסות אתר תקינים." }, { status: 400 });
  }

  const authorization = await authorizeAccount(range.accountId);
  if (!authorization.ok) return authorization.response;
  if (!isAdminRole(authorization.access.role)) {
    return NextResponse.json({ success: false, message: "רק צוות הסוכנות יכול לעדכן הכנסות אתר." }, { status: 403 });
  }

  const now = new Date();
  const [saved] = await getDb()
    .insert(siteRevenueBenchmarks)
    .values({
      flashyAccountId: range.accountId,
      rangeStart: range.start,
      rangeEnd: range.end,
      revenue: revenue.toFixed(2),
      updatedBy: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        siteRevenueBenchmarks.flashyAccountId,
        siteRevenueBenchmarks.rangeStart,
        siteRevenueBenchmarks.rangeEnd,
      ],
      set: {
        revenue: revenue.toFixed(2),
        source: "manual",
        updatedBy: authorization.access.userId === "dev-admin" ? null : authorization.access.userId,
        updatedAt: now,
      },
    })
    .returning();

  await recordAudit({
    actorUserId: authorization.access.userId,
    action: "site_revenue.updated",
    entityType: "flashy_account",
    entityId: range.accountId,
    metadata: { rangeStart: range.start, rangeEnd: range.end, revenue },
  });

  return NextResponse.json({
    success: true,
    data: {
      revenue: Number(saved.revenue),
      source: saved.source,
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}
