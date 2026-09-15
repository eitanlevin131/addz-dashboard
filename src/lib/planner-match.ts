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

export type OperationalPlanStatus = "planned" | "sent" | "postponed" | "not_found";
export type PlanMatchState = "none" | "suggested" | "automatic" | "confirmed" | "missing";

export type PlanCampaignMatch = {
  plan: NewsletterPlan;
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
  if (plan.date < today || plan.status === "sent") return "not_found";
  return "planned";
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
  const assignedPlans = new Set<number>();
  const assignedReports = new Set<number>();
  const reportByPlan = new Map<number, {
    report?: PlannerCampaignReport;
    confidence: number;
    matchState: PlanMatchState;
  }>();

  plans.forEach((plan, planIndex) => {
    if (plan.matchedCampaignId === undefined) return;
    const channel = plan.matchedCampaignChannel ?? plan.channel;
    const reportIndex = reports.findIndex((report) =>
      report.accountId === plan.accountId &&
      report.channel === channel &&
      report.campaignId === plan.matchedCampaignId,
    );
    assignedPlans.add(planIndex);
    if (reportIndex === -1) {
      reportByPlan.set(planIndex, {
        confidence: plan.matchConfidence ?? 1,
        matchState: "missing",
      });
      return;
    }

    assignedReports.add(reportIndex);
    reportByPlan.set(planIndex, {
      report: reports[reportIndex],
      confidence: plan.matchConfidence ?? 1,
      matchState: plan.matchConfirmedAt || plan.matchMethod === "manual" ? "confirmed" : "automatic",
    });
  });
  const candidates: Array<{
    planIndex: number;
    reportIndex: number;
    confidence: number;
    exactId: boolean;
  }> = [];

  plans.forEach((plan, planIndex) => {
    if (plan.kind !== "campaign" || assignedPlans.has(planIndex) || plan.matchingDisabled) return;
    const linkedCampaignId = campaignIdFromUrl(plan.flashyUrl);

    reports.forEach((report, reportIndex) => {
      if (plan.accountId !== report.accountId || plan.channel !== report.channel) return;
      const reportDate = accountDate(new Date(report.sentAt), timezone);
      const distance = dateDistance(plan.date, reportDate);
      const exactId = linkedCampaignId !== null && linkedCampaignId === report.campaignId;
      if (!exactId && distance > 3) return;

      const similarity = plannerTitleSimilarity(plan.title, report.campaignName);
      const dateScore = Math.max(0, 1 - distance * 0.25);
      const confidence = exactId ? 1 : similarity * 0.78 + dateScore * 0.22;
      if (exactId || (similarity >= 0.32 && confidence >= 0.48)) {
        candidates.push({ planIndex, reportIndex, confidence, exactId });
      }
    });
  });

  candidates.sort((left, right) => {
    if (left.exactId !== right.exactId) return left.exactId ? -1 : 1;
    return right.confidence - left.confidence;
  });

  for (const candidate of candidates) {
    if (assignedPlans.has(candidate.planIndex) || assignedReports.has(candidate.reportIndex)) continue;
    assignedPlans.add(candidate.planIndex);
    assignedReports.add(candidate.reportIndex);
    reportByPlan.set(candidate.planIndex, {
      report: reports[candidate.reportIndex],
      confidence: candidate.confidence,
      matchState: "suggested",
    });
  }

  return {
    matches: plans.map((plan, index): PlanCampaignMatch => {
      const assigned = reportByPlan.get(index);
      return {
        plan,
        report: assigned?.report,
        confidence: assigned?.confidence ?? 0,
        status: operationalStatus(plan, Boolean(assigned?.report), today),
        matchState: assigned?.matchState ?? "none",
      };
    }),
    unmatchedReports: reports.filter((_, index) => !assignedReports.has(index)),
    availableReports: reports.filter((report) => !plans.some((plan) =>
      plan.matchedCampaignId !== undefined &&
      plan.accountId === report.accountId &&
      (plan.matchedCampaignChannel ?? plan.channel) === report.channel &&
      plan.matchedCampaignId === report.campaignId,
    )),
  };
}
