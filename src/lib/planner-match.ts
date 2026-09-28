import type {
  EmailCampaignReport,
  NewsletterPlan,
  SmsCampaignReport,
} from "./types";

function accountDate(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export type PlannerCampaignReport =
  | (EmailCampaignReport & { channel: "email" })
  | (SmsCampaignReport & { channel: "sms" });

export type OperationalPlanStatus = "draft" | "planned" | "sent" | "postponed" | "not_found";
export type PlanMatchState = "none" | "suggested" | "automatic" | "confirmed" | "missing";

export type PlanCampaignMatch = {
  plan: NewsletterPlan;
  slotChannel: "email" | "sms";
  report?: PlannerCampaignReport;
  confidence: number;
  status: OperationalPlanStatus;
  matchState: PlanMatchState;
};

export const AUTO_PERSIST_MATCH_CONFIDENCE = 0.82;

const GENERIC_TITLE_TOKENS = new Set([
  "addz",
  "email",
  "sms",
  "דיוור",
  "מייל",
  "קמפיין",
]);

function normalizedTitle(value: string) {
  return value
    .toLocaleLowerCase("he-IL")
    .replace(/[\[\](){}|<>:;,.!?"'`~_+\-=\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string) {
  return normalizedTitle(value)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_TITLE_TOKENS.has(token));
}

export function plannerTitleSimilarity(left: string, right: string) {
  const normalizedLeft = normalizedTitle(left);
  const normalizedRight = normalizedTitle(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 8 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return 0.9;
  }

  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  return (2 * overlap) / (leftTokens.length + rightTokens.length);
}

function dateDistance(left: string, right: string) {
  const leftTime = Date.parse(`${left}T12:00:00Z`);
  const rightTime = Date.parse(`${right}T12:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

function campaignIdFromUrl(value?: string) {
  if (!value) return null;
  const candidates = value.match(/\d{3,}/g);
  return candidates?.length ? Number(candidates[candidates.length - 1]) : null;
}

function operationalStatus(plan: NewsletterPlan, matched: boolean, today: string): OperationalPlanStatus {
  if (matched) return "sent";
  if (plan.status === "postponed") return "postponed";
  if (!plan.date || plan.status === "draft") return "draft";
  if (plan.date < today || plan.status === "sent") return "not_found";
  return "planned";
}

function planChannels(plan: NewsletterPlan) {
  return plan.channel === "mixed" ? (["email", "sms"] as const) : [plan.channel];
}

export function matchNewsletterPlans(
  plans: NewsletterPlan[],
  emails: EmailCampaignReport[],
  sms: SmsCampaignReport[],
  timezone: string,
  now = new Date(),
) {
  const reports: PlannerCampaignReport[] = [
    ...emails.map((report) => ({ ...report, channel: "email" as const })),
    ...sms.map((report) => ({ ...report, channel: "sms" as const })),
  ];
  const today = accountDate(now, timezone);
  const slots = plans.flatMap((plan) =>
    planChannels(plan).map((slotChannel) => ({ plan, slotChannel })),
  );
  const assignedSlots = new Set<number>();
  const assignedReports = new Set<number>();
  const reportBySlot = new Map<number, {
    report?: PlannerCampaignReport;
    confidence: number;
    matchState: PlanMatchState;
  }>();

  slots.forEach(({ plan, slotChannel }, slotIndex) => {
    const storedMatch = plan.campaignMatches?.find((match) => match.channel === slotChannel);
    const campaignId = storedMatch?.campaignId
      ?? (plan.matchedCampaignChannel === slotChannel ? plan.matchedCampaignId : undefined);
    if (campaignId === undefined) return;
    const reportIndex = reports.findIndex((report) =>
      report.accountId === plan.accountId &&
      report.channel === slotChannel &&
      report.campaignId === campaignId,
    );
    assignedSlots.add(slotIndex);
    if (reportIndex === -1) {
      reportBySlot.set(slotIndex, {
        confidence: storedMatch?.confidence ?? plan.matchConfidence ?? 1,
        matchState: "missing",
      });
      return;
    }

    assignedReports.add(reportIndex);
    reportBySlot.set(slotIndex, {
      report: reports[reportIndex],
      confidence: storedMatch?.confidence ?? plan.matchConfidence ?? 1,
      matchState: storedMatch?.confirmedAt || storedMatch?.method === "manual" || plan.matchConfirmedAt || plan.matchMethod === "manual"
        ? "confirmed"
        : "automatic",
    });
  });
  const candidates: Array<{
    slotIndex: number;
    reportIndex: number;
    confidence: number;
    exactId: boolean;
  }> = [];

  slots.forEach(({ plan, slotChannel }, slotIndex) => {
    const storedMatch = plan.campaignMatches?.find((match) => match.channel === slotChannel);
    if (plan.kind !== "campaign" || assignedSlots.has(slotIndex) || plan.matchingDisabled || storedMatch?.matchingDisabled || !plan.date) return;
    const plannedDate = plan.date;
    const linkedCampaignId = campaignIdFromUrl(plan.flashyUrl);

    reports.forEach((report, reportIndex) => {
      if (plan.accountId !== report.accountId || slotChannel !== report.channel) return;
      const reportDate = accountDate(new Date(report.sentAt), timezone);
      const distance = dateDistance(plannedDate, reportDate);
      const exactId = linkedCampaignId !== null && linkedCampaignId === report.campaignId;
      if (!exactId && distance > 3) return;

      const similarity = plannerTitleSimilarity(plan.title, report.campaignName);
      const dateScore = Math.max(0, 1 - distance * 0.25);
      const confidence = exactId ? 1 : similarity * 0.78 + dateScore * 0.22;
      if (exactId || (similarity >= 0.32 && confidence >= 0.48)) {
        candidates.push({ slotIndex, reportIndex, confidence, exactId });
      }
    });
  });

  candidates.sort((left, right) => {
    if (left.exactId !== right.exactId) return left.exactId ? -1 : 1;
    return right.confidence - left.confidence;
  });

  for (const candidate of candidates) {
    if (assignedSlots.has(candidate.slotIndex) || assignedReports.has(candidate.reportIndex)) continue;
    assignedSlots.add(candidate.slotIndex);
    assignedReports.add(candidate.reportIndex);
    reportBySlot.set(candidate.slotIndex, {
      report: reports[candidate.reportIndex],
      confidence: candidate.confidence,
      matchState: "suggested",
    });
  }

  return {
    matches: slots.map(({ plan, slotChannel }, index): PlanCampaignMatch => {
      const assigned = reportBySlot.get(index);
      return {
        plan,
        slotChannel,
        report: assigned?.report,
        confidence: assigned?.confidence ?? 0,
        status: operationalStatus(plan, Boolean(assigned?.report), today),
        matchState: assigned?.matchState ?? "none",
      };
    }),
    unmatchedReports: reports.filter((_, index) => !assignedReports.has(index)),
    availableReports: reports.filter((report) => !plans.some((plan) =>
      plan.accountId === report.accountId && (
        plan.campaignMatches?.some((match) => match.channel === report.channel && match.campaignId === report.campaignId)
        || (plan.matchedCampaignId !== undefined
          && (plan.matchedCampaignChannel ?? plan.channel) === report.channel
          && plan.matchedCampaignId === report.campaignId)
      ),
    )),
  };
}
