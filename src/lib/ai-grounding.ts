import type {
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  NewsletterPlan,
  SmsCampaignReport,
} from "./types";

export type AiReportView = "overview" | "campaigns" | "sms" | "automations" | "planner" | "ai";

export type AiEvidenceMetric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
};

export type AiEvidenceSource = {
  id: string;
  kind: "summary" | "email" | "sms" | "automation" | "plan" | "document";
  entityId: string;
  reportView: AiReportView;
  title: string;
  subtitle: string;
  content?: string;
  date?: string;
  metrics: AiEvidenceMetric[];
};

export type AiGroundedFact = {
  text: string;
  evidenceIds: string[];
};

export type AiGroundedCalculation = AiGroundedFact & {
  formula: string;
};

export type AiGroundedInference = AiGroundedFact & {
  confidence: "high" | "medium" | "low";
};

export type AiGroundedResponse = {
  answer: string;
  facts: AiGroundedFact[];
  calculations: AiGroundedCalculation[];
  inferences: AiGroundedInference[];
  sources: AiEvidenceSource[];
};

type EvidenceInput = {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
  documents?: { name: string; content: string; createdAt: string }[];
  question?: string;
  currentView?: string;
};

function number(value: number) {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(value);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function metric(key: string, label: string, value: number | null, display: string): AiEvidenceMetric {
  return { key, label, value, display };
}

function metricValue(source: AiEvidenceSource, key: string) {
  return source.metrics.find((item) => item.key === key)?.value ?? null;
}

function automationSmsRecipients(report: AutomationReport) {
  const sentSms = report.sentSms ?? 0;
  if (sentSms > 0) return sentSms;
  return report.channel === "sms" ? report.totalRecipients : 0;
}

function sourceRevenue(source: AiEvidenceSource) {
  return metricValue(source, "revenue") ?? 0;
}

function sourceReturn(source: AiEvidenceSource) {
  const roas = metricValue(source, "roas");
  if (roas !== null) return roas;
  return sourceRevenue(source);
}

function queryArea(question: string, currentView = "") {
  const value = `${question} ${currentView}`.toLowerCase();
  if (value.includes("אוטומ") || value.includes("automation")) return "automation";
  if (value.includes("sms") || value.includes("סמס")) return "sms";
  if (value.includes("גאנט") || value.includes("תכנ") || value.includes("planner")) return "plan";
  if (value.includes("קמפיין") || value.includes("אימייל") || value.includes("email")) return "campaign";
  return "all";
}

function relevantReportSources(sources: AiEvidenceSource[], question: string, currentView = "") {
  const area = queryArea(question, currentView);
  const reports = sources.filter((source) => {
    if (area === "automation") return source.kind === "automation";
    if (area === "sms") return source.kind === "sms" || (source.kind === "automation" && metricValue(source, "smsCost") !== null);
    if (area === "plan") return source.kind === "plan";
    if (area === "campaign") return source.kind === "email" || source.kind === "sms";
    return source.kind === "email" || source.kind === "sms" || source.kind === "automation";
  });
  const tokens = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);
  const matched = reports.filter((source) => tokens.some((token) => source.title.toLowerCase().includes(token)));
  const strongest = [...reports].sort((a, b) => sourceRevenue(b) - sourceRevenue(a)).slice(0, 18);
  const weakest = [...reports].sort((a, b) => sourceReturn(a) - sourceReturn(b)).slice(0, 12);
  const unique = new Map<string, AiEvidenceSource>();

  for (const source of [...matched, ...strongest, ...weakest]) unique.set(source.id, source);
  return Array.from(unique.values()).slice(0, 36);
}

export function buildAiEvidenceCatalog(input: EvidenceInput): AiEvidenceSource[] {
  const { account, summary } = input;
  const currency = account.currency;
  const summarySource: AiEvidenceSource = {
    id: "summary:current-range",
    kind: "summary",
    entityId: account.id,
    reportView: "overview",
    title: "סיכום הטווח הנבחר",
    subtitle: "חישוב הדאשבורד מדוחות הפעילות של Flashy",
    metrics: [
      metric("revenue", "הכנסה מיוחסת", summary.revenue, money(summary.revenue, currency)),
      metric("profit", "רווח אחרי עלויות", summary.profit, money(summary.profit, currency)),
      metric("smsCost", "עלות SMS", summary.smsCost, money(summary.smsCost, currency)),
      metric("fixedCosts", "עלויות קבועות", summary.fixedCosts, money(summary.fixedCosts, currency)),
      metric("totalCost", "סך עלויות", summary.smsCost + summary.fixedCosts, money(summary.smsCost + summary.fixedCosts, currency)),
      metric("roas", "ROAS", summary.roas, summary.roas === null ? "לא זמין" : `${number(summary.roas)}x`),
      metric("purchases", "רכישות", summary.purchases, number(summary.purchases)),
    ],
  };
  const emailSources = input.emails.map((item): AiEvidenceSource => ({
    id: `email:${item.id}`,
    kind: "email",
    entityId: item.id,
    reportView: "campaigns",
    title: item.campaignName,
    subtitle: item.subjectLine ? `קמפיין אימייל · ${item.subjectLine}` : "קמפיין אימייל",
    date: item.sentAt,
    metrics: [
      metric("revenue", "הכנסה", item.revenueGenerated, money(item.revenueGenerated, currency)),
      metric("purchases", "רכישות", item.purchases, number(item.purchases)),
      metric("recipients", "נמענים", item.totalRecipients, number(item.totalRecipients)),
      metric("opens", "פתיחות", item.totalOpens, number(item.totalOpens)),
      metric("clicks", "קליקים", item.uniqueClicks, number(item.uniqueClicks)),
      metric("openRate", "אחוז פתיחה", item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : null, item.totalDelivered > 0 ? percent(item.totalOpens / item.totalDelivered) : "לא זמין"),
      metric("clickRate", "אחוז הקלקה", item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : null, item.totalDelivered > 0 ? percent(item.uniqueClicks / item.totalDelivered) : "לא זמין"),
    ],
  }));
  const smsSources = input.sms.map((item): AiEvidenceSource => {
    const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
    const roas = cost > 0 ? item.revenueGenerated / cost : null;
    return {
      id: `sms:${item.id}`,
      kind: "sms",
      entityId: item.id,
      reportView: "sms",
      title: item.campaignName,
      subtitle: "קמפיין SMS",
      content: item.messageText || undefined,
      date: item.sentAt,
      metrics: [
        metric("revenue", "הכנסה", item.revenueGenerated, money(item.revenueGenerated, currency)),
        metric("smsCost", "עלות SMS", cost, money(cost, currency)),
        metric("roas", "הכנסה / עלות SMS", roas, roas === null ? "לא זמין" : `${number(roas)}x`),
        metric("purchases", "רכישות", item.purchases, number(item.purchases)),
        metric("recipients", "נמענים", item.totalRecipients, number(item.totalRecipients)),
        metric("clicks", "קליקים", item.totalClicks, number(item.totalClicks)),
      ],
    };
  });
  const automationSources = input.automations.map((item): AiEvidenceSource => {
    const smsRecipients = automationSmsRecipients(item);
    const smsCost = smsRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
    return {
      id: `automation:${item.id}`,
      kind: "automation",
      entityId: item.id,
      reportView: "automations",
      title: item.automationName,
      subtitle: `אוטומציה · ${item.channel === "sms" ? "SMS" : smsRecipients > 0 ? "משולבת" : "אימייל"}`,
      date: item.date,
      metrics: [
        metric("revenue", "הכנסה", item.revenueGenerated, money(item.revenueGenerated, currency)),
        metric("smsCost", "עלות SMS", smsRecipients > 0 ? smsCost : null, smsRecipients > 0 ? money(smsCost, currency) : "ללא SMS"),
        metric("purchases", "רכישות", item.purchases, number(item.purchases)),
        metric("recipients", "נכנסו", item.totalEntered ?? item.totalRecipients, number(item.totalEntered ?? item.totalRecipients)),
        metric("clicks", "קליקים", item.totalClicks + (item.clickedSms ?? 0), number(item.totalClicks + (item.clickedSms ?? 0))),
      ],
    };
  });
  const planSources = input.plans.map((item): AiEvidenceSource => ({
    id: `plan:${item.id}`,
    kind: "plan",
    entityId: item.id,
    reportView: "planner",
    title: item.title,
    subtitle: `גאנט · ${item.channel.toUpperCase()} · ${item.status}`,
    date: item.date,
    metrics: [],
  }));
  const documentSources = (input.documents ?? []).map((item, index): AiEvidenceSource => ({
    id: `document:${index}`,
    kind: "document",
    entityId: String(index),
    reportView: "ai",
    title: item.name,
    subtitle: "מסמך לקוח בזיכרון ה־AI",
    date: item.createdAt,
    metrics: [],
  }));
  const allSources = [...emailSources, ...smsSources, ...automationSources, ...planSources, ...documentSources];
  const relevant = relevantReportSources(allSources, input.question ?? "", input.currentView);
  const area = queryArea(input.question ?? "", input.currentView);
  const supporting = area === "plan"
    ? planSources.slice(0, 20)
    : area === "all"
      ? relevant
      : relevantReportSources(allSources, input.question ?? "", input.currentView);
  const unique = new Map<string, AiEvidenceSource>();

  for (const source of [summarySource, ...supporting, ...documentSources.slice(0, 6)]) unique.set(source.id, source);
  return Array.from(unique.values()).slice(0, 43);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 900) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function evidenceIds(value: unknown, allowed: Set<string>) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => text(item, 180)).filter((item) => allowed.has(item)))).slice(0, 5);
}

export function normalizeAiGroundedResponse(
  value: unknown,
  catalog: AiEvidenceSource[],
  fallbackAnswer: string,
): AiGroundedResponse {
  const input = record(value);
  const allowed = new Set(catalog.map((source) => source.id));
  const normalizeFacts = (items: unknown): AiGroundedFact[] => Array.isArray(items)
    ? items.map((item) => {
        const candidate = record(item);
        return { text: text(candidate.text), evidenceIds: evidenceIds(candidate.evidenceIds, allowed) };
      }).filter((item) => item.text && item.evidenceIds.length > 0).slice(0, 5)
    : [];
  const facts = normalizeFacts(input.facts);
  const calculations = Array.isArray(input.calculations)
    ? input.calculations.map((item) => {
        const candidate = record(item);
        return {
          text: text(candidate.text),
          formula: text(candidate.formula, 300),
          evidenceIds: evidenceIds(candidate.evidenceIds, allowed),
        };
      }).filter((item) => item.text && item.formula && item.evidenceIds.length > 0).slice(0, 4)
    : [];
  const inferences: AiGroundedInference[] = Array.isArray(input.inferences)
    ? input.inferences.map((item) => {
        const candidate = record(item);
        const confidence: AiGroundedInference["confidence"] = candidate.confidence === "high" || candidate.confidence === "low" ? candidate.confidence : "medium";
        return { text: text(candidate.text), confidence, evidenceIds: evidenceIds(candidate.evidenceIds, allowed) };
      }).filter((item) => item.text && item.evidenceIds.length > 0).slice(0, 4)
    : [];
  const referencedIds = new Set([
    ...facts.flatMap((item) => item.evidenceIds),
    ...calculations.flatMap((item) => item.evidenceIds),
    ...inferences.flatMap((item) => item.evidenceIds),
  ]);
  const sources = catalog.filter((source) => referencedIds.has(source.id));

  if (!facts.length || !sources.length) return buildFallbackGroundedResponse(fallbackAnswer, catalog);

  return {
    answer: text(input.answer) || fallbackAnswer,
    facts,
    calculations,
    inferences,
    sources,
  };
}

export function buildFallbackGroundedResponse(answer: string, catalog: AiEvidenceSource[]): AiGroundedResponse {
  const reportSources = catalog.filter((source) => source.kind !== "summary" && source.kind !== "document").slice(0, 2);
  const summary = catalog.find((source) => source.kind === "summary");
  const selected = reportSources.length ? reportSources : summary ? [summary] : catalog.slice(0, 1);
  const facts = selected.map((source) => {
    const visibleMetrics = source.metrics.filter((item) => ["revenue", "purchases", "smsCost", "roas"].includes(item.key)).slice(0, 3);
    return {
      text: visibleMetrics.length
        ? `${source.title}: ${visibleMetrics.map((item) => `${item.label} ${item.display}`).join(" · ")}`
        : `${source.title}: ${source.subtitle}`,
      evidenceIds: [source.id],
    };
  });
  const calculationSource = selected.find((source) => metricValue(source, "smsCost") !== null && metricValue(source, "revenue") !== null) ?? summary;
  const revenue = calculationSource ? metricValue(calculationSource, "revenue") : null;
  const costKey = calculationSource?.kind === "summary" ? "totalCost" : "smsCost";
  const cost = calculationSource ? metricValue(calculationSource, costKey) : null;
  const revenueDisplay = calculationSource?.metrics.find((item) => item.key === "revenue")?.display ?? number(revenue ?? 0);
  const costDisplay = calculationSource?.metrics.find((item) => item.key === costKey)?.display ?? number(cost ?? 0);
  const calculations = calculationSource && revenue !== null && cost !== null && cost > 0
    ? [{
        text: `${calculationSource.kind === "summary" ? "ROAS כולל עלויות" : "הכנסה / עלות SMS"}: ${number(revenue / cost)}x`,
        formula: `${revenueDisplay} ÷ ${costDisplay}`,
        evidenceIds: [calculationSource.id],
      }]
    : [];
  const referencedSources = new Map(selected.map((source) => [source.id, source]));
  if (calculationSource) referencedSources.set(calculationSource.id, calculationSource);

  return {
    answer,
    facts,
    calculations,
    inferences: selected.length ? [{ text: answer, confidence: "medium", evidenceIds: selected.map((source) => source.id) }] : [],
    sources: Array.from(referencedSources.values()),
  };
}
