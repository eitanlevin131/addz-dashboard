import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, getAccessContext, isAdminRole } from "@/lib/auth/access";
import { newsletterPlans as demoNewsletterPlans } from "@/lib/demo-data";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { mapNewsletterPlanRow } from "@/lib/newsletter-plan";
import { emailCampaignReports, newsletterPlans, smsCampaignReports } from "@/lib/schema";

const matchActions = new Set(["match", "confirm", "unmatch", "resume"]);

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
      data: rows.map(mapNewsletterPlanRow),
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
    plannedTime: body.time ? String(body.time) : null,
    channel: String(body.channel ?? "email"),
    kind: String(body.kind ?? "campaign"),
    status: String(body.status ?? "planned"),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    couponCode: body.couponCode ? String(body.couponCode).trim() : null,
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
        data: mapNewsletterPlanRow(created),
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
  const matchAction = String(body.matchAction ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { success: false, message: "חסר מזהה פריט לעדכון." },
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
    .select()
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

  if (matchAction) {
    if (!matchActions.has(matchAction)) {
      return NextResponse.json({ success: false, message: "פעולת התאמה לא תקינה." }, { status: 400 });
    }
    if (existing.kind !== "campaign" || !existing.flashyAccountId) {
      return NextResponse.json({ success: false, message: "אפשר להתאים רק קמפיין המחובר לחשבון Flashy." }, { status: 400 });
    }

    const now = new Date();
    let update: Partial<typeof newsletterPlans.$inferInsert>;
    if (matchAction === "match") {
      const campaignId = Number(body.campaignId);
      const channel = String(body.campaignChannel ?? existing.channel);
      if (!Number.isInteger(campaignId) || campaignId <= 0 || !["email", "sms"].includes(channel)) {
        return NextResponse.json({ success: false, message: "חסר קמפיין תקין להתאמה." }, { status: 400 });
      }
      if (channel !== existing.channel) {
        return NextResponse.json({ success: false, message: "ערוץ הקמפיין אינו תואם לפריט התכנון." }, { status: 400 });
      }

      const report = channel === "email"
        ? await db.select({ id: emailCampaignReports.id }).from(emailCampaignReports).where(and(
            eq(emailCampaignReports.flashyAccountId, existing.flashyAccountId),
            eq(emailCampaignReports.campaignId, campaignId),
          )).limit(1).then((rows) => rows[0])
        : await db.select({ id: smsCampaignReports.id }).from(smsCampaignReports).where(and(
            eq(smsCampaignReports.flashyAccountId, existing.flashyAccountId),
            eq(smsCampaignReports.campaignId, campaignId),
          )).limit(1).then((rows) => rows[0]);
      if (!report) {
        return NextResponse.json({ success: false, message: "הקמפיין לא נמצא בדוחות החשבון." }, { status: 404 });
      }

      const duplicate = await db.select({ id: newsletterPlans.id }).from(newsletterPlans).where(and(
        eq(newsletterPlans.flashyAccountId, existing.flashyAccountId),
        eq(newsletterPlans.matchedCampaignChannel, channel),
        eq(newsletterPlans.matchedCampaignId, campaignId),
        ne(newsletterPlans.id, existing.id),
      )).limit(1).then((rows) => rows[0]);
      if (duplicate) {
        return NextResponse.json({ success: false, message: "הקמפיין כבר מחובר לפריט תכנון אחר." }, { status: 409 });
      }

      update = {
        matchedCampaignId: campaignId,
        matchedCampaignChannel: channel,
        matchMethod: "manual",
        matchConfidence: "1.0000",
        matchedAt: now,
        matchConfirmedAt: now,
        matchingDisabled: false,
      };
    } else if (matchAction === "confirm") {
      if (existing.matchedCampaignId === null) {
        return NextResponse.json({ success: false, message: "אין התאמה שמורה לאישור." }, { status: 409 });
      }
      update = { matchConfirmedAt: now };
    } else if (matchAction === "unmatch") {
      update = {
        matchedCampaignId: null,
        matchedCampaignChannel: null,
        matchMethod: null,
        matchConfidence: null,
        matchedAt: null,
        matchConfirmedAt: null,
        matchingDisabled: true,
      };
    } else {
      update = { matchingDisabled: false };
    }

    const [updatedMatch] = await db.update(newsletterPlans).set(update).where(eq(newsletterPlans.id, id)).returning();
    await recordAudit({
      actorUserId: accessContext.access.userId,
      action: `planner.match.${matchAction}`,
      entityType: "newsletter_plan",
      entityId: id,
      metadata: {
        campaignId: matchAction === "match" ? Number(body.campaignId) : existing.matchedCampaignId,
        channel: matchAction === "match" ? String(body.campaignChannel ?? existing.channel) : existing.matchedCampaignChannel,
      },
    });
    return NextResponse.json({ success: true, data: mapNewsletterPlanRow(updatedMatch) });
  }

  const plan = {
    plannedDate: String(body.date ?? ""),
    plannedTime: body.time ? String(body.time) : null,
    channel: String(body.channel ?? "email"),
    kind: String(body.kind ?? "campaign"),
    status: String(body.status ?? "planned"),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    couponCode: body.couponCode ? String(body.couponCode).trim() : null,
    flashyUrl: body.flashyUrl ? String(body.flashyUrl) : null,
    assetUrl: body.assetUrl ? String(body.assetUrl) : null,
  };

  if (!plan.plannedDate || !plan.title) {
    return NextResponse.json(
      { success: false, message: "חסרים תאריך או כותרת." },
      { status: 400 },
    );
  }

  const matchReset = existing.channel !== plan.channel || existing.kind !== plan.kind
    ? {
        matchedCampaignId: null,
        matchedCampaignChannel: null,
        matchMethod: null,
        matchConfidence: null,
        matchedAt: null,
        matchConfirmedAt: null,
        matchingDisabled: false,
      }
    : {};

  const [updated] = await db
    .update(newsletterPlans)
    .set({ ...plan, ...matchReset })
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
    data: mapNewsletterPlanRow(updated),
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
    .select({ clientId: newsletterPlans.clientId, status: newsletterPlans.status, matchedCampaignId: newsletterPlans.matchedCampaignId })
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

  if (existing.status === "sent" || existing.matchedCampaignId !== null) {
    return NextResponse.json(
      { success: false, message: "אי אפשר למחוק דיוור שכבר נשלח." },
      { status: 409 },
    );
  }

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
