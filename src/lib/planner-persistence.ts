import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mapNewsletterPlanRow } from "@/lib/newsletter-plan";
import {
  AUTO_PERSIST_MATCH_CONFIDENCE,
  matchNewsletterPlans,
} from "@/lib/planner-match";
import { auditLogs, newsletterPlans } from "@/lib/schema";
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
  const matching = matchNewsletterPlans(
    storedPlans.map(mapNewsletterPlanRow),
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
    const updated = await db
      .update(newsletterPlans)
      .set({
        matchedCampaignId: report.campaignId,
        matchedCampaignChannel: report.channel,
        matchMethod: "auto",
        matchConfidence: candidate.confidence.toFixed(4),
        matchedAt: new Date(),
        matchConfirmedAt: null,
      })
      .where(and(
        eq(newsletterPlans.id, candidate.plan.id),
        isNull(newsletterPlans.matchedCampaignId),
        eq(newsletterPlans.matchingDisabled, false),
      ))
      .returning({ id: newsletterPlans.id });
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
