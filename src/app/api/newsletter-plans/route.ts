import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { assertClientAccess, getAccessContext, isAdminRole } from "@/lib/auth/access";
import { newsletterPlans as demoNewsletterPlans } from "@/lib/demo-data";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { mapNewsletterPlanRow, mapNewsletterPlanRows } from "@/lib/newsletter-plan";
import { isCampaignObjective } from "@/lib/planner-learning";
import { emailCampaignReports, newsletterPlanAssets, newsletterPlanCampaignMatches, newsletterPlans, smsCampaignReports } from "@/lib/schema";

const matchActions = new Set(["match", "confirm", "unmatch", "resume"]);

function planStatus(value: unknown, hasDate: boolean) {
  if (!hasDate && value === "idea") return "idea";
  if (!hasDate) return "draft";
  return value === "postponed" ? "postponed" : "planned";
}

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

    const planIds = rows.map((row) => row.id);
    const [matchRows, assetRows] = planIds.length ? await Promise.all([
      db.select().from(newsletterPlanCampaignMatches).where(inArray(newsletterPlanCampaignMatches.newsletterPlanId, planIds)),
      db.select().from(newsletterPlanAssets).where(inArray(newsletterPlanAssets.newsletterPlanId, planIds)),
    ]) : [[], []];
    return NextResponse.json({
      success: true,
      data: mapNewsletterPlanRows(rows, matchRows, assetRows),
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
    plannedDate: body.status === "idea" ? null : body.date ? String(body.date) : null,
    plannedTime: body.status === "idea" ? null : body.time ? String(body.time) : null,
    channel: String(body.channel ?? "email"),
    kind: "campaign",
    status: planStatus(body.status, body.status !== "idea" && Boolean(body.date)),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    brief: String(body.brief ?? body.notes ?? "").trim(),
    audience: String(body.audience ?? "").trim(),
    offer: String(body.offer ?? "").trim(),
    cta: String(body.cta ?? "").trim(),
    objective: isCampaignObjective(body.objective) ? body.objective : null,
    learning: null,
    learningUpdatedAt: null,
    couponCode: body.couponCode ? String(body.couponCode).trim() : null,
    flashyUrl: body.flashyUrl ? String(body.flashyUrl) : null,
    assetUrl: body.assetUrl ? String(body.assetUrl) : null,
  };

  if (!plan.clientId || !plan.flashyAccountId || !plan.title) {
    return NextResponse.json(
      { success: false, message: "חסרים לקוח, חשבון או כותרת." },
      { status: 400 },
    );
  }
  if (!["email", "sms", "mixed"].includes(plan.channel)) {
    return NextResponse.json({ success: false, message: "ערוץ הקמפיין אינו תקין." }, { status: 400 });
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
    if (!existing.flashyAccountId) {
      return NextResponse.json({ success: false, message: "אפשר להתאים רק קמפיין המחובר לחשבון Flashy." }, { status: 400 });
    }

    const now = new Date();
    const channel = String(body.campaignChannel ?? "");
    const allowedChannels = existing.channel === "mixed" ? ["email", "sms"] : [existing.channel];
    if (!["email", "sms"].includes(channel) || !allowedChannels.includes(channel)) {
      return NextResponse.json({ success: false, message: "ערוץ ההתאמה אינו תואם לפריט התכנון." }, { status: 400 });
    }
    const currentMatch = await db.select().from(newsletterPlanCampaignMatches).where(and(
      eq(newsletterPlanCampaignMatches.newsletterPlanId, existing.id),
      eq(newsletterPlanCampaignMatches.channel, channel),
    )).limit(1).then((rows) => rows[0]);
    if (matchAction === "match") {
      const campaignId = Number(body.campaignId);
      if (!Number.isInteger(campaignId) || campaignId <= 0 || !["email", "sms"].includes(channel)) {
        return NextResponse.json({ success: false, message: "חסר קמפיין תקין להתאמה." }, { status: 400 });
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

      const duplicate = await db.select({ id: newsletterPlanCampaignMatches.id }).from(newsletterPlanCampaignMatches).where(and(
        eq(newsletterPlanCampaignMatches.flashyAccountId, existing.flashyAccountId),
        eq(newsletterPlanCampaignMatches.channel, channel),
        eq(newsletterPlanCampaignMatches.campaignId, campaignId),
      )).limit(1).then((rows) => rows[0]);
      if (duplicate && duplicate.id !== currentMatch?.id) {
        return NextResponse.json({ success: false, message: "הקמפיין כבר מחובר לפריט תכנון אחר." }, { status: 409 });
      }
      await db.insert(newsletterPlanCampaignMatches).values({
        newsletterPlanId: existing.id,
        flashyAccountId: existing.flashyAccountId,
        channel,
        campaignId,
        method: "manual",
        confidence: "1.0000",
        matchedAt: now,
        confirmedAt: now,
        matchingDisabled: false,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [newsletterPlanCampaignMatches.newsletterPlanId, newsletterPlanCampaignMatches.channel],
        set: { campaignId, method: "manual", confidence: "1.0000", matchedAt: now, confirmedAt: now, matchingDisabled: false, updatedAt: now },
      });
    } else if (matchAction === "confirm") {
      if (!currentMatch?.campaignId) {
        return NextResponse.json({ success: false, message: "אין התאמה שמורה לאישור." }, { status: 409 });
      }
      await db.update(newsletterPlanCampaignMatches).set({ confirmedAt: now, updatedAt: now }).where(eq(newsletterPlanCampaignMatches.id, currentMatch.id));
    } else if (matchAction === "unmatch") {
      await db.insert(newsletterPlanCampaignMatches).values({
        newsletterPlanId: existing.id,
        flashyAccountId: existing.flashyAccountId,
        channel,
        campaignId: null,
        matchingDisabled: true,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [newsletterPlanCampaignMatches.newsletterPlanId, newsletterPlanCampaignMatches.channel],
        set: { campaignId: null, method: null, confidence: null, matchedAt: null, confirmedAt: null, matchingDisabled: true, updatedAt: now },
      });
    } else {
      if (currentMatch) {
        await db.update(newsletterPlanCampaignMatches).set({ matchingDisabled: false, updatedAt: now }).where(eq(newsletterPlanCampaignMatches.id, currentMatch.id));
      } else {
        await db.insert(newsletterPlanCampaignMatches).values({ newsletterPlanId: existing.id, flashyAccountId: existing.flashyAccountId, channel, matchingDisabled: false });
      }
    }
    const matches = await db.select().from(newsletterPlanCampaignMatches).where(eq(newsletterPlanCampaignMatches.newsletterPlanId, existing.id));
    const assets = await db.select().from(newsletterPlanAssets).where(eq(newsletterPlanAssets.newsletterPlanId, existing.id));
    await recordAudit({
      actorUserId: accessContext.access.userId,
      action: `planner.match.${matchAction}`,
      entityType: "newsletter_plan",
      entityId: id,
      metadata: {
        campaignId: matchAction === "match" ? Number(body.campaignId) : currentMatch?.campaignId,
        channel,
      },
    });
    return NextResponse.json({ success: true, data: mapNewsletterPlanRow(existing, matches, assets) });
  }

  const plan = {
    plannedDate: body.status === "idea" ? null : body.date ? String(body.date) : null,
    plannedTime: body.status === "idea" ? null : body.time ? String(body.time) : null,
    channel: String(body.channel ?? "email"),
    kind: "campaign",
    status: planStatus(body.status, body.status !== "idea" && Boolean(body.date)),
    title: String(body.title ?? "").trim(),
    owner: String(body.owner ?? ""),
    notes: String(body.notes ?? ""),
    brief: String(body.brief ?? body.notes ?? "").trim(),
    audience: String(body.audience ?? "").trim(),
    offer: String(body.offer ?? "").trim(),
    cta: String(body.cta ?? "").trim(),
    objective: isCampaignObjective(body.objective) ? body.objective : null,
    learning: String(body.learning ?? "").trim().slice(0, 4000) || null,
    couponCode: body.couponCode ? String(body.couponCode).trim() : null,
    flashyUrl: body.flashyUrl ? String(body.flashyUrl) : null,
    assetUrl: body.assetUrl ? String(body.assetUrl) : null,
  };

  if (!plan.title) {
    return NextResponse.json(
      { success: false, message: "חסרה כותרת." },
      { status: 400 },
    );
  }

  if (!["email", "sms", "mixed"].includes(plan.channel)) {
    return NextResponse.json({ success: false, message: "ערוץ הקמפיין אינו תקין." }, { status: 400 });
  }
  if (plan.learning && existing.channel !== plan.channel) {
    return NextResponse.json(
      { success: false, message: "שינוי ערוץ מבטל את ההתאמה הקיימת. מחקו קודם את הלמידה או שמרו את הערוץ הנוכחי." },
      { status: 409 },
    );
  }

  if (plan.learning && existing.matchedCampaignId === null) {
    const savedMatch = await db.select({ id: newsletterPlanCampaignMatches.id })
      .from(newsletterPlanCampaignMatches)
      .where(and(
        eq(newsletterPlanCampaignMatches.newsletterPlanId, existing.id),
        isNotNull(newsletterPlanCampaignMatches.campaignId),
      ))
      .limit(1)
      .then((rows) => rows[0]);
    if (!savedMatch) {
      return NextResponse.json({ success: false, message: "אפשר לשמור למידה רק אחרי התאמה לקמפיין שנשלח." }, { status: 409 });
    }
  }

  if (existing.channel !== plan.channel) {
    await db.delete(newsletterPlanCampaignMatches).where(eq(newsletterPlanCampaignMatches.newsletterPlanId, existing.id));
  }

  const learningChanged = (existing.learning ?? "") !== (plan.learning ?? "");

  const [updated] = await db
    .update(newsletterPlans)
    .set({
      ...plan,
      learningUpdatedAt: learningChanged ? new Date() : existing.learningUpdatedAt,
      updatedAt: new Date(),
    })
    .where(eq(newsletterPlans.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, message: "לא נמצא פריט תכנון לעדכון." },
      { status: 404 },
    );
  }

  const [matches, assets] = await Promise.all([
    db.select().from(newsletterPlanCampaignMatches).where(eq(newsletterPlanCampaignMatches.newsletterPlanId, updated.id)),
    db.select().from(newsletterPlanAssets).where(eq(newsletterPlanAssets.newsletterPlanId, updated.id)),
  ]);
  if (learningChanged) {
    await recordAudit({
      actorUserId: accessContext.access.userId,
      action: "planner.learning.updated",
      entityType: "newsletter_plan",
      entityId: id,
      metadata: { objective: plan.objective, hasLearning: Boolean(plan.learning) },
    });
  }
  return NextResponse.json({
    success: true,
    data: mapNewsletterPlanRow(updated, matches, assets),
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
    .select({ clientId: newsletterPlans.clientId, status: newsletterPlans.status })
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

  const savedMatch = await db.select({ id: newsletterPlanCampaignMatches.id }).from(newsletterPlanCampaignMatches)
    .where(and(
      eq(newsletterPlanCampaignMatches.newsletterPlanId, id),
      inArray(newsletterPlanCampaignMatches.channel, ["email", "sms"]),
      isNotNull(newsletterPlanCampaignMatches.campaignId),
    ))
    .limit(1).then((rows) => rows[0]);
  if (existing.status === "sent" || savedMatch) {
    return NextResponse.json(
      { success: false, message: "אי אפשר למחוק דיוור שכבר נשלח." },
      { status: 409 },
    );
  }

  const storedAssets = await db
    .select({ blobPathname: newsletterPlanAssets.blobPathname })
    .from(newsletterPlanAssets)
    .where(eq(newsletterPlanAssets.newsletterPlanId, id));

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


  const blobPathnames = storedAssets.flatMap((asset) => asset.blobPathname ? [asset.blobPathname] : []);
  if (blobPathnames.length) {
    await Promise.all(blobPathnames.map((pathname) => del(pathname).catch(() => undefined)));
  }

  return NextResponse.json({ success: true, data: deleted });
}
