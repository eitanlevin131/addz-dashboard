import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { assertClientAccess, getAccessContext, isAdminRole } from "@/lib/auth/access";
import { newsletterPlans as demoNewsletterPlans } from "@/lib/demo-data";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { newsletterPlans } from "@/lib/schema";
import type { CampaignKind, Channel, NewsletterPlan, PlanStatus } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  if (isDatabaseConfigured()) {
    const accessContext = await getAccessContext();
    if (!accessContext.ok) return accessContext.response;
    if (clientId) {
      const denied = assertClientAccess(accessContext.access, clientId);
      if (denied) return denied;
    }

    const db = getDb();
    const rows = clientId
      ? await db.select().from(newsletterPlans).where(eq(newsletterPlans.clientId, clientId))
      : isAdminRole(accessContext.access.role)
        ? await db.select().from(newsletterPlans)
        : accessContext.access.clientIds?.length
          ? await db
              .select()
              .from(newsletterPlans)
              .where(inArray(newsletterPlans.clientId, accessContext.access.clientIds))
          : [];

    return NextResponse.json({
      success: true,
      data: rows.map(
        (plan): NewsletterPlan => ({
          id: plan.id,
          clientId: plan.clientId ?? "",
          accountId: plan.flashyAccountId ?? "",
          date: plan.plannedDate,
          channel: plan.channel as Channel,
          kind: plan.kind as CampaignKind,
          status: plan.status as PlanStatus,
          title: plan.title,
          owner: plan.owner ?? "",
          notes: plan.notes ?? "",
          flashyUrl: plan.flashyUrl ?? undefined,
          assetUrl: plan.assetUrl ?? undefined,
        }),
      ),
    });
  }

  return NextResponse.json({
    success: true,
    data: clientId
      ? demoNewsletterPlans.filter((plan) => plan.clientId === clientId)
      : demoNewsletterPlans,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const plan = {
    clientId: String(body.clientId ?? ""),
    flashyAccountId: String(body.accountId ?? ""),
    plannedDate: String(body.date ?? ""),
    channel: String(body.channel ?? "email"),
    kind: String(body.kind ?? "campaign"),
    status: String(body.status ?? "draft"),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    flashyUrl: body.flashyUrl ? String(body.flashyUrl) : null,
    assetUrl: body.assetUrl ? String(body.assetUrl) : null,
  };

  if (!plan.clientId || !plan.flashyAccountId || !plan.plannedDate || !plan.title) {
    return NextResponse.json(
      { success: false, message: "חסרים לקוח, חשבון, תאריך או כותרת." },
      { status: 400 },
    );
  }

  if (isDatabaseConfigured()) {
    const accessContext = await getAccessContext();
    if (!accessContext.ok) return accessContext.response;
    const denied = assertClientAccess(accessContext.access, plan.clientId);
    if (denied) return denied;

    const db = getDb();
    const [created] = await db.insert(newsletterPlans).values(plan).returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          clientId: created.clientId,
          accountId: created.flashyAccountId,
          date: created.plannedDate,
          channel: created.channel,
          kind: created.kind,
          status: created.status,
          title: created.title,
          owner: created.owner,
          notes: created.notes,
          flashyUrl: created.flashyUrl,
          assetUrl: created.assetUrl,
        },
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      mode: "demo",
      message: "בייצור הפעולה תישמר בטבלת newsletter_plans ב-Neon Postgres.",
      data: {
        id: crypto.randomUUID(),
        ...body,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { success: false, message: "חסר מזהה פריט לעדכון." },
      { status: 400 },
    );
  }

  const plan = {
    plannedDate: String(body.date ?? ""),
    channel: String(body.channel ?? "email"),
    kind: String(body.kind ?? "campaign"),
    status: String(body.status ?? "draft"),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    flashyUrl: body.flashyUrl ? String(body.flashyUrl) : null,
    assetUrl: body.assetUrl ? String(body.assetUrl) : null,
  };

  if (!plan.plannedDate || !plan.title) {
    return NextResponse.json(
      { success: false, message: "חסרים תאריך או כותרת." },
      { status: 400 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon לא מחובר, אי אפשר לשמור עדכון קבוע." },
      { status: 409 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ clientId: newsletterPlans.clientId })
    .from(newsletterPlans)
    .where(eq(newsletterPlans.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing?.clientId) {
    return NextResponse.json(
      { success: false, message: "לא נמצא פריט תכנון לעדכון." },
      { status: 404 },
    );
  }

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const denied = assertClientAccess(accessContext.access, existing.clientId);
  if (denied) return denied;

  const [updated] = await db
    .update(newsletterPlans)
    .set(plan)
    .where(eq(newsletterPlans.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, message: "לא נמצא פריט תכנון לעדכון." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      clientId: updated.clientId,
      accountId: updated.flashyAccountId,
      date: updated.plannedDate,
      channel: updated.channel,
      kind: updated.kind,
      status: updated.status,
      title: updated.title,
      owner: updated.owner,
      notes: updated.notes,
      flashyUrl: updated.flashyUrl,
      assetUrl: updated.assetUrl,
    },
  });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { success: false, message: "חסר מזהה פריט למחיקה." },
      { status: 400 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon לא מחובר, אי אפשר למחוק פריט קבוע." },
      { status: 409 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ clientId: newsletterPlans.clientId })
    .from(newsletterPlans)
    .where(eq(newsletterPlans.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing?.clientId) {
    return NextResponse.json(
      { success: false, message: "לא נמצא פריט תכנון למחיקה." },
      { status: 404 },
    );
  }

  const accessContext = await getAccessContext();
  if (!accessContext.ok) return accessContext.response;
  const denied = assertClientAccess(accessContext.access, existing.clientId);
  if (denied) return denied;

  const [deleted] = await db
    .delete(newsletterPlans)
    .where(eq(newsletterPlans.id, id))
    .returning({ id: newsletterPlans.id });

  if (!deleted) {
    return NextResponse.json(
      { success: false, message: "לא נמצא פריט תכנון למחיקה." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: deleted });
}
