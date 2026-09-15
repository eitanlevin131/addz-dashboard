import { newsletterPlans } from "@/lib/schema";
import type { CampaignKind, Channel, NewsletterPlan, PlanStatus } from "@/lib/types";

export function mapNewsletterPlanRow(
  plan: typeof newsletterPlans.$inferSelect,
): NewsletterPlan {
  return {
    id: plan.id,
    clientId: plan.clientId ?? "",
    accountId: plan.flashyAccountId ?? "",
    date: plan.plannedDate,
    time: plan.plannedTime ?? undefined,
    channel: plan.channel as Channel,
    kind: plan.kind as CampaignKind,
    status: plan.status as PlanStatus,
    title: plan.title,
    owner: plan.owner ?? "",
    notes: plan.notes ?? "",
    couponCode: plan.couponCode ?? undefined,
    flashyUrl: plan.flashyUrl ?? undefined,
    assetUrl: plan.assetUrl ?? undefined,
    matchedCampaignId: plan.matchedCampaignId ?? undefined,
    matchedCampaignChannel: plan.matchedCampaignChannel as Channel | undefined,
    matchMethod: plan.matchMethod as "auto" | "manual" | undefined,
    matchConfidence: plan.matchConfidence === null ? undefined : Number(plan.matchConfidence),
    matchedAt: plan.matchedAt?.toISOString(),
    matchConfirmedAt: plan.matchConfirmedAt?.toISOString(),
    matchingDisabled: plan.matchingDisabled,
  };
}
