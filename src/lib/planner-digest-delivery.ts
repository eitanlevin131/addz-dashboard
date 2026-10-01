import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clients, flashyAccounts, newsletterPlans, newsletterPlanCampaignMatches } from "@/lib/schema";
import { buildPlannerDigest, digestClock, plannerDigestDelivery } from "@/lib/planner-digest";

export async function sendPlannerDigest(request: Request, test: boolean) {
  const delivery = plannerDigestDelivery(digestClock().date, test);
  const to = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS?.split(",")[0] || "").trim();
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!isDatabaseConfigured() || !key || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ success: false, message: "Planner digest requires DATABASE_URL, OWNER_EMAIL, RESEND_API_KEY and EMAIL_FROM." }, { status: 503 });
  }
  try {
    const db = getDb();
    const rows = await db.select({ plan: newsletterPlans, clientName: clients.name })
      .from(newsletterPlans).innerJoin(clients, eq(clients.id, newsletterPlans.clientId))
      .innerJoin(flashyAccounts, eq(flashyAccounts.id, newsletterPlans.flashyAccountId))
      .where(eq(flashyAccounts.active, true));
    const matches = rows.length ? await db.select().from(newsletterPlanCampaignMatches)
      .where(inArray(newsletterPlanCampaignMatches.newsletterPlanId, rows.map((row) => row.plan.id))) : [];
    const origin = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
    const content = buildPlannerDigest(rows.map(({ plan, clientName }) => {
      const channels = plan.channel === "mixed" ? ["email", "sms"] : [plan.channel];
      const matchedChannels = matches.filter((m) => m.newsletterPlanId === plan.id && m.campaignId !== null).map((m) => m.channel);
      if (plan.matchedCampaignId !== null) matchedChannels.push(plan.matchedCampaignChannel || plan.channel);
      return { id: plan.id, clientId: plan.clientId!, clientName, date: plan.plannedDate, time: plan.plannedTime, title: plan.title, channel: plan.channel, status: plan.status, sent: channels.every((c) => matchedChannels.includes(c)) };
    }), delivery.date, origin);
    const response = await fetch(`${(process.env.RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/$/, "")}/emails`, {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "Idempotency-Key": delivery.idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject: delivery.subjectPrefix + content.subject, text: content.text, html: content.html }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) throw new Error(`Email delivery returned ${response.status}`);
    return NextResponse.json({ success: true, status: "sent", date: delivery.date, plans: content.count, to, emailId: result.id, test });
  } catch (error) {
    console.error("Planner digest failed", error);
    return NextResponse.json({ success: false, message: "שליחת מייל התכנון נכשלה." }, { status: 500 });
  }
}
