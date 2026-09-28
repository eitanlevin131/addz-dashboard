import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mapNewsletterPlanRows } from "@/lib/newsletter-plan";
import {
  AUTO_PERSIST_MATCH_CONFIDENCE,
  matchNewsletterPlans,
} from "@/lib/planner-match";
import { auditLogs, newsletterPlanCampaignMatches, newsletterPlans } from "@/lib/schema";
import type { EmailCampaignReport, SmsCampaignReport } from "@/lib/types";

export async function persistAutomaticPlannerMatches(input: {
  accountId: string;
  timezone: string;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
}) {
  const db = getDb();
  const storedPlans = await db
    .select()
    .from(newsletterPlans)
    .where(and(
      eq(newsletterPlans.flashyAccountId, input.accountId),
      eq(newsletterPlans.kind, "campaign"),
    ));
  const storedMatches = storedPlans.length
    ? await db.select().from(newsletterPlanCampaignMatches).where(inArray(
        newsletterPlanCampaignMatches.newsletterPlanId,
        storedPlans.map((plan) => plan.id),
      ))
    : [];
  const matching = matchNewsletterPlans(
    mapNewsletterPlanRows(storedPlans, storedMatches),
    input.emails,
    input.sms,
    input.timezone,
  );
  const candidates = matching.matches.filter((match) =>
    match.matchState === "suggested" &&
    Boolean(match.report) &&
    match.confidence >= AUTO_PERSIST_MATCH_CONFIDENCE,
  );
  let saved = 0;

  for (const candidate of candidates) {
    const report = candidate.report!;
    const updated = await db.insert(newsletterPlanCampaignMatches).values({
      newsletterPlanId: candidate.plan.id,
      flashyAccountId: input.accountId,
      channel: candidate.slotChannel,
      campaignId: report.campaignId,
      method: "auto",
      confidence: candidate.confidence.toFixed(4),
      matchedAt: new Date(),
      confirmedAt: null,
      matchingDisabled: false,
    }).onConflictDoNothing().returning({ id: newsletterPlanCampaignMatches.id });
    if (updated.length) saved += 1;
  }

  if (saved) {
    await db.insert(auditLogs).values({
      actorUserId: null,
      action: "planner.match.auto",
      entityType: "flashy_account",
      entityId: input.accountId,
      metadata: { saved, threshold: AUTO_PERSIST_MATCH_CONFIDENCE },
    });
  }

  return saved;
}
