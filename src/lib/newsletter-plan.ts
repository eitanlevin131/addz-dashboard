import { newsletterPlanAssets, newsletterPlanCampaignMatches, newsletterPlans } from "@/lib/schema";
import type { CampaignKind, CampaignObjective, Channel, NewsletterPlan, NewsletterPlanAsset, NewsletterPlanCampaignMatch, PlanStatus, PlannerChannel } from "@/lib/types";

export function mapNewsletterPlanAsset(asset: typeof newsletterPlanAssets.$inferSelect): NewsletterPlanAsset {
  return {
    id: asset.id,
    kind: asset.kind as "link" | "file",
    label: asset.label,
    url: asset.url ?? undefined,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    size: asset.size ?? undefined,
    downloadUrl: asset.kind === "file" ? `/api/newsletter-plans/assets/${asset.id}` : undefined,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function mapNewsletterPlanRow(
  plan: typeof newsletterPlans.$inferSelect,
  matchRows: Array<typeof newsletterPlanCampaignMatches.$inferSelect> = [],
  assetRows: Array<typeof newsletterPlanAssets.$inferSelect> = [],
): NewsletterPlan {
  const campaignMatches: NewsletterPlanCampaignMatch[] = matchRows.map((match) => ({
    id: match.id,
    channel: match.channel as Channel,
    campaignId: match.campaignId ?? undefined,
    method: match.method as "auto" | "manual" | undefined,
    confidence: match.confidence === null ? undefined : Number(match.confidence),
    matchedAt: match.matchedAt?.toISOString(),
    confirmedAt: match.confirmedAt?.toISOString(),
    matchingDisabled: match.matchingDisabled,
  }));
  if (!campaignMatches.length && plan.matchedCampaignId !== null) {
    campaignMatches.push({
      id: `legacy-${plan.id}`,
      channel: (plan.matchedCampaignChannel ?? plan.channel) as Channel,
      campaignId: plan.matchedCampaignId,
      method: plan.matchMethod as "auto" | "manual" | undefined,
      confidence: plan.matchConfidence === null ? undefined : Number(plan.matchConfidence),
      matchedAt: plan.matchedAt?.toISOString(),
      confirmedAt: plan.matchConfirmedAt?.toISOString(),
      matchingDisabled: plan.matchingDisabled,
    });
  }
  const assets: NewsletterPlanAsset[] = assetRows.map(mapNewsletterPlanAsset);
  return {
    id: plan.id,
    clientId: plan.clientId ?? "",
    accountId: plan.flashyAccountId ?? "",
    date: plan.plannedDate,
    time: plan.plannedTime ?? undefined,
    channel: plan.channel as PlannerChannel,
    kind: plan.kind as CampaignKind,
    status: plan.status as PlanStatus,
    title: plan.title,
    owner: plan.owner ?? "",
    notes: plan.notes ?? "",
    brief: plan.brief ?? plan.notes ?? "",
    audience: plan.audience ?? "",
    offer: plan.offer ?? "",
    cta: plan.cta ?? "",
    objective: plan.objective as CampaignObjective | undefined,
    learning: plan.learning ?? "",
    learningUpdatedAt: plan.learningUpdatedAt?.toISOString(),
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
    campaignMatches,
    assets,
  };
}

export function mapNewsletterPlanRows(
  plans: Array<typeof newsletterPlans.$inferSelect>,
  matchRows: Array<typeof newsletterPlanCampaignMatches.$inferSelect> = [],
  assetRows: Array<typeof newsletterPlanAssets.$inferSelect> = [],
) {
  const matchesByPlan = new Map<string, Array<typeof newsletterPlanCampaignMatches.$inferSelect>>();
  const assetsByPlan = new Map<string, Array<typeof newsletterPlanAssets.$inferSelect>>();
  for (const match of matchRows) {
    matchesByPlan.set(match.newsletterPlanId, [...(matchesByPlan.get(match.newsletterPlanId) ?? []), match]);
  }
  for (const asset of assetRows) {
    assetsByPlan.set(asset.newsletterPlanId, [...(assetsByPlan.get(asset.newsletterPlanId) ?? []), asset]);
  }
  return plans.map((plan) => mapNewsletterPlanRow(
    plan,
    matchesByPlan.get(plan.id) ?? [],
    assetsByPlan.get(plan.id) ?? [],
  ));
}
