import type {
  AccountChangeEvent,
  AiDataScope,
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  NewsletterPlan,
  SmsCampaignReport,
} from "./types";
import { campaignTiming, weekdayLabels } from "./report-chart-data.ts";
import { summarizeCampaignListHealth } from "./metrics.ts";
import {
  campaignObjectiveLabel,
  matchedReportsForPlan,
  summarizePlannerReports,
} from "./planner-learning.ts";

export type AiReportView = "overview" | "campaigns" | "sms" | "automations" | "planner" | "changes" | "ai";

export type AiEvidenceMetric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
};

export type AiEvidenceSource = {
  id: string;
  kind: "summary" | "coverage" | "email" | "sms" | "automation" | "plan" | "change" | "document" | "timing";
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
  accountChanges?: AccountChangeEvent[];
  dataScope?: AiDataScope;
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

function isTimingQuestion(question: string) {
  return /מתי|תזמ|באיזה יום|איזה יום|היום (?:הכי )?חזק|באיזו שעה|איזו שעה|שעה חזקה|בוקר|צהר|ערב|send time/i.test(question)
    || /(?:^|[^\p{L}])(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=$|[^\p{L}])/u.test(question);
}

function queryArea(question: string, currentView = "") {
  const value = `${question} ${currentView}`.toLowerCase();
  if (isTimingQuestion(value)) return "timing";
  if (/שינוי|שינינו|שונה|עודכן|עדכון|פופאפ|הטבה|מה עשינו|change/.test(value)) return "change";
  if (value.includes("אוטומ") || value.includes("automation")) return "automation";
  if (/הסר|נטיש|unsubscribe/.test(value)) return "campaign";
  if (value.includes("sms") || value.includes("סמס")) return "sms";
  if (value.includes("גאנט") || value.includes("תכנ") || value.includes("planner")) return "plan";
  if (value.includes("קמפיין") || value.includes("אימייל") || value.includes("email")) return "campaign";
  return "all";
}

function relevantReportSources(sources: AiEvidenceSource[], question: string, currentView = "") {
  const area = queryArea(question, currentView);
  const reports = sources.filter((source) => {
    if (area === "timing") return source.kind === "timing";
    if (area === "automation") return source.kind === "automation";
    if (area === "sms") return source.kind === "sms" || (source.kind === "automation" && metricValue(source, "smsCost") !== null);
    if (area === "plan") return source.kind === "plan";
    if (area === "change") return source.kind === "change";
    if (area === "campaign") return source.kind === "email" || source.kind === "sms";
    return source.kind === "email" || source.kind === "sms" || source.kind === "automation" || source.kind === "change";
  });
  if (isCampaignListQuestion(question)) {
    return [...reports]
      .sort((a, b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""))
      .slice(0, 40);
  }
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

function emailEvidenceSources(input: EvidenceInput): AiEvidenceSource[] {
  return input.emails.map((item) => ({
    id: `email:${item.id}`,
    kind: "email",
    entityId: item.id,
    reportView: "campaigns",
    title: item.campaignName,
    subtitle: item.subjectLine ? `קמפיין אימייל · ${item.subjectLine}` : "קמפיין אימייל",
    date: item.sentAt,
    metrics: [
      metric("revenue", "הכנסה", item.revenueGenerated, money(item.revenueGenerated, input.account.currency)),
      metric("purchases", "רכישות", item.purchases, number(item.purchases)),
      metric("recipients", "נמענים", item.totalRecipients, number(item.totalRecipients)),
      metric("opens", "פתיחות", item.totalOpens, number(item.totalOpens)),
      metric("clicks", "קליקים", item.uniqueClicks, number(item.uniqueClicks)),
      metric("openRate", "אחוז פתיחה", item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : null, item.totalDelivered > 0 ? percent(item.totalOpens / item.totalDelivered) : "לא זמין"),
      metric("clickRate", "אחוז הקלקה", item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : null, item.totalDelivered > 0 ? percent(item.uniqueClicks / item.totalDelivered) : "לא זמין"),
      metric("unsubscribed", "הסרות", item.unsubscribed, number(item.unsubscribed)),
      metric("unsubscribeRate", "שיעור הסרה", item.totalRecipients > 0 ? item.unsubscribed / item.totalRecipients : null, item.totalRecipients > 0 ? percent(item.unsubscribed / item.totalRecipients) : "לא זמין"),
    ],
  }));
}

function smsEvidenceSources(input: EvidenceInput): AiEvidenceSource[] {
  return input.sms.map((item) => {
    const cost = item.totalRecipients * input.account.smsCreditPriceUsd * input.account.usdIlsRate;
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
        metric("revenue", "הכנסה", item.revenueGenerated, money(item.revenueGenerated, input.account.currency)),
        metric("smsCost", "עלות SMS", cost, money(cost, input.account.currency)),
        metric("roas", "הכנסה / עלות SMS", roas, roas === null ? "לא זמין" : `${number(roas)}x`),
        metric("purchases", "רכישות", item.purchases, number(item.purchases)),
        metric("recipients", "נמענים", item.totalRecipients, number(item.totalRecipients)),
        metric("clicks", "קליקים", item.totalClicks, number(item.totalClicks)),
        metric("unsubscribed", "הסרות", item.unsubscribed, number(item.unsubscribed)),
        metric("unsubscribeRate", "שיעור הסרה", item.totalRecipients > 0 ? item.unsubscribed / item.totalRecipients : null, item.totalRecipients > 0 ? percent(item.unsubscribed / item.totalRecipients) : "לא זמין"),
      ],
    };
  });
}

export function buildAiEvidenceCatalog(input: EvidenceInput): AiEvidenceSource[] {
  const { account, summary } = input;
  const currency = account.currency;
  const listHealth = summarizeCampaignListHealth([...input.emails, ...input.sms]);
  const summarySource: AiEvidenceSource = {
    id: "summary:current-range",
    kind: "summary",
    entityId: account.id,
    reportView: "overview",
    title: input.dataScope ? `סיכום ${input.dataScope.label}` : "סיכום הטווח הנבחר",
    subtitle: "חישוב הדאשבורד מדוחות הפעילות של Flashy",
    metrics: [
      metric("revenue", "הכנסה מיוחסת", summary.revenue, money(summary.revenue, currency)),
      metric("profit", "רווח אחרי עלויות", summary.profit, money(summary.profit, currency)),
      metric("smsCost", "עלות SMS", summary.smsCost, money(summary.smsCost, currency)),
      metric("fixedCosts", "עלויות קבועות", summary.fixedCosts, money(summary.fixedCosts, currency)),
      metric("totalCost", "סך עלויות", summary.smsCost + summary.fixedCosts, money(summary.smsCost + summary.fixedCosts, currency)),
      metric("roas", "ROAS", summary.roas, summary.roas === null ? "לא זמין" : `${number(summary.roas)}x`),
      metric("purchases", "רכישות", summary.purchases, number(summary.purchases)),
      metric("unsubscribed", "הסרות מקמפיינים", listHealth.unsubscribed, number(listHealth.unsubscribed)),
      metric("unsubscribeRate", "שיעור הסרה משוקלל", listHealth.unsubscribeRate, listHealth.unsubscribeRate === null ? "לא זמין" : percent(listHealth.unsubscribeRate)),
    ],
  };
  const coverageSource: AiEvidenceSource | null = input.dataScope ? {
    id: "coverage:question-period",
    kind: "coverage",
    entityId: account.id,
    reportView: "campaigns",
    title: `כיסוי נתונים · ${input.dataScope.label}`,
    subtitle: input.dataScope.source === "flashy-api" ? "שליפה חיה מ־Flashy API" : "מטמון הדוחות במסד הנתונים",
    content: input.dataScope.complete
      ? `הטווח ${input.dataScope.start} עד ${input.dataScope.end} נבדק במלואו מול Flashy.`
      : input.dataScope.warning,
    date: input.dataScope.end,
    metrics: [
      metric("emailCampaigns", "קמפייני אימייל", input.dataScope.counts.emails, number(input.dataScope.counts.emails)),
      metric("smsCampaigns", "קמפייני SMS", input.dataScope.counts.sms, number(input.dataScope.counts.sms)),
      metric("automationRows", "רשומות אוטומציה", input.dataScope.counts.automations, number(input.dataScope.counts.automations)),
    ],
  } : null;
  const emailSources = emailEvidenceSources(input);
  const smsSources = smsEvidenceSources(input);
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
  const planSources = input.plans.map((item): AiEvidenceSource => {
    const results = summarizePlannerReports(matchedReportsForPlan(item, input.emails, input.sms));
    return {
      id: `plan:${item.id}`,
      kind: "plan",
      entityId: item.id,
      reportView: "planner",
      title: item.title,
      subtitle: `גאנט · ${campaignObjectiveLabel(item.objective)} · ${item.channel.toUpperCase()} · ${item.status}`,
      content: [
        item.brief ? `בריף מתוכנן: ${item.brief}` : "",
        item.learning ? `למידת צוות לאחר הביצוע: ${item.learning}` : "",
      ].filter(Boolean).join("\n") || undefined,
      date: item.date ?? undefined,
      metrics: results.reportCount ? [
        metric("revenue", "הכנסה בפועל", results.revenue, money(results.revenue, currency)),
        metric("purchases", "רכישות בפועל", results.purchases, number(results.purchases)),
        metric("conversionRate", "יחס המרה", results.conversionRate, results.conversionRate === null ? "לא זמין" : percent(results.conversionRate)),
        metric("openRate", "שיעור פתיחה", results.openRate, results.openRate === null ? "לא זמין" : percent(results.openRate)),
        metric("clickRate", "שיעור הקלקה", results.clickRate, results.clickRate === null ? "לא זמין" : percent(results.clickRate)),
        metric("unsubscribeRate", "שיעור הסרה", results.unsubscribeRate, results.unsubscribeRate === null ? "לא זמין" : percent(results.unsubscribeRate)),
      ] : [],
    };
  });
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
  const changeSources = [...(input.accountChanges ?? [])]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 30)
    .map((item): AiEvidenceSource => ({
      id: `change:${item.id}`,
      kind: "change",
      entityId: item.id,
      reportView: "changes",
      title: item.title,
      subtitle: `יומן שינויים · ${item.areas.length ? item.areas.join(" · ") : "כללי"}`,
      content: [item.details, item.reason ? `מטרת השינוי: ${item.reason}` : ""].filter(Boolean).join("\n"),
      date: item.occurredAt,
      metrics: [],
    }));
  const timing = campaignTiming([
    ...input.emails.map((item) => ({ sentAt: item.sentAt, revenue: item.revenueGenerated, purchases: item.purchases })),
    ...input.sms.map((item) => ({ sentAt: item.sentAt, revenue: item.revenueGenerated, purchases: item.purchases })),
  ], account.timezone);
  const timingSources: AiEvidenceSource[] = [
    ...timing.days.filter((item) => item.count > 0).map((item): AiEvidenceSource => ({
      id: `timing:day:${item.label}`,
      kind: "timing",
      entityId: item.label,
      reportView: "campaigns",
      title: `תזמון ביום ${item.label}`,
      subtitle: `דוח קמפיינים · ${timing.timezone} · ממוצע לקמפיין`,
      metrics: [
        metric("averageRevenue", "הכנסה ממוצעת לקמפיין", item.revenue / item.count, money(item.revenue / item.count, currency)),
        metric("revenue", "הכנסה מצטברת", item.revenue, money(item.revenue, currency)),
        metric("campaigns", "קמפיינים", item.count, number(item.count)),
        metric("purchases", "רכישות", item.purchases, number(item.purchases)),
      ],
    })),
    ...timing.hours.filter((item) => item.count > 0).map((item): AiEvidenceSource => ({
      id: `timing:hour:${item.label}`,
      kind: "timing",
      entityId: item.label,
      reportView: "campaigns",
      title: `תזמון בשעה ${item.label}`,
      subtitle: `דוח קמפיינים · ${timing.timezone} · ממוצע לקמפיין`,
      metrics: [
        metric("averageRevenue", "הכנסה ממוצעת לקמפיין", item.revenue / item.count, money(item.revenue / item.count, currency)),
        metric("revenue", "הכנסה מצטברת", item.revenue, money(item.revenue, currency)),
        metric("campaigns", "קמפיינים", item.count, number(item.count)),
        metric("purchases", "רכישות", item.purchases, number(item.purchases)),
      ],
    })),
  ];
  const allSources = [...emailSources, ...smsSources, ...automationSources, ...planSources, ...changeSources, ...timingSources, ...documentSources];
  const relevant = relevantReportSources(allSources, input.question ?? "", input.currentView);
  const area = queryArea(input.question ?? "", input.currentView);
  const supporting = area === "plan"
    ? planSources.slice(0, 20)
    : area === "change"
      ? changeSources.slice(0, 20)
    : area === "timing"
      ? timingSources
    : area === "all"
      ? relevant
      : relevantReportSources(allSources, input.question ?? "", input.currentView);
  const unique = new Map<string, AiEvidenceSource>();

  for (const source of [coverageSource, summarySource, ...supporting, ...changeSources.slice(0, 12), ...documentSources.slice(0, 6)]) {
    if (source) unique.set(source.id, source);
  }
  return Array.from(unique.values()).slice(0, 43);
}

export function isCampaignListQuestion(question: string) {
  return /(?:איזה|אילו|מה).{0,24}קמפיינ|קמפיינים.{0,24}(?:שלחנו|נשלחו|יצאו)|רשימת.{0,16}קמפיינ/i.test(question);
}

export function buildCampaignListGroundedResponse(input: EvidenceInput): AiGroundedResponse | null {
  if (!input.dataScope || !isCampaignListQuestion(input.question ?? "")) return null;
  const catalog = buildAiEvidenceCatalog(input);
  const coverage = catalog.find((source) => source.kind === "coverage");
  const campaigns = [...emailEvidenceSources(input), ...smsEvidenceSources(input)]
    .sort((a, b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""));
  const evidenceIds = campaigns.map((source) => source.id);

  if (!campaigns.length) {
    const verified = input.dataScope.complete;
    return {
      answer: verified
        ? `בדקתי ישירות את Flashy לטווח ${input.dataScope.label}, ולא נמצאו בו קמפייני אימייל או SMS שנשלחו.`
        : `לא מצאתי קמפיינים שמורים לטווח ${input.dataScope.label}, אבל השליפה החיה מ־Flashy לא הושלמה ולכן אי אפשר לקבוע שלא היו קמפיינים.`,
      facts: coverage ? [{ text: coverage.content ?? coverage.title, evidenceIds: [coverage.id] }] : [],
      calculations: [],
      inferences: [],
      sources: coverage ? [coverage] : [],
    };
  }

  const rows = campaigns.map((source, index) => {
    const sentAt = new Date(source.date ?? "").toLocaleDateString("he-IL", { timeZone: input.account.timezone });
    const channel = source.kind === "email" ? "אימייל" : "SMS";
    const revenue = source.metrics.find((item) => item.key === "revenue")?.display ?? "ללא נתון הכנסה";
    return `${index + 1}. ${sentAt} · ${channel} · ${source.title} · ${revenue}`;
  });
  const emailCount = campaigns.filter((source) => source.kind === "email").length;
  const smsCount = campaigns.length - emailCount;
  const sources = coverage ? [coverage, ...campaigns] : campaigns;

  return {
    answer: `נמצאו ${campaigns.length.toLocaleString("he-IL")} קמפיינים שנשלחו ב${input.dataScope.label}: ${emailCount} באימייל ו־${smsCount} ב־SMS.\n\n${rows.join("\n")}`,
    facts: campaigns.map((source) => ({
      text: `${source.title} נשלח ב־${new Date(source.date ?? "").toLocaleDateString("he-IL", { timeZone: input.account.timezone })}.`,
      evidenceIds: [source.id],
    })),
    calculations: [{
      text: `סה״כ ${campaigns.length} קמפיינים: ${emailCount} אימייל ו־${smsCount} SMS.`,
      formula: `${emailCount} + ${smsCount} = ${campaigns.length}`,
      evidenceIds: evidenceIds.slice(0, 5),
    }],
    inferences: [],
    sources,
  };
}

export function buildTimingGroundedResponse(input: EvidenceInput): AiGroundedResponse | null {
  if (!isTimingQuestion(input.question ?? "")) return null;

  const catalog = buildAiEvidenceCatalog({ ...input, currentView: "campaigns" });
  const daySources = catalog.filter((source) => source.id.startsWith("timing:day:"));
  const hourSources = catalog.filter((source) => source.id.startsWith("timing:hour:"));
  if (!daySources.length || !hourSources.length) return null;

  const average = (source: AiEvidenceSource) => metricValue(source, "averageRevenue") ?? 0;
  const count = (source: AiEvidenceSource) => metricValue(source, "campaigns") ?? 0;
  const mentionedDays = weekdayLabels.filter((day) => (input.question ?? "").includes(day));
  const comparedDays = mentionedDays.length > 0
    ? daySources.filter((source) => mentionedDays.includes(source.entityId))
    : [...daySources].sort((a, b) => average(b) - average(a)).slice(0, 2);
  if (!comparedDays.length) return null;

  const rankedDays = [...comparedDays].sort((a, b) => average(b) - average(a));
  const strongestDay = rankedDays[0];
  const strongestHour = [...hourSources].sort((a, b) => average(b) - average(a))[0];
  const sources = Array.from(new Map([...rankedDays, strongestHour].map((source) => [source.id, source])).values());
  const dayComparison = rankedDays
    .map((source) => `${source.entityId}: ${source.metrics.find((item) => item.key === "averageRevenue")?.display} בממוצע (${number(count(source))} קמפיינים)`)
    .join(" לעומת ");
  const hourDisplay = strongestHour.metrics.find((item) => item.key === "averageRevenue")?.display ?? "לא זמין";
  const confidence: AiGroundedInference["confidence"] = sources.every((source) => count(source) >= 3) ? "high" : "medium";

  return {
    answer: `${strongestDay.entityId} הוא היום העדיף לפי הטווח שנבחר. ${dayComparison}. שעת השליחה החזקה בכלל הקמפיינים היא ${strongestHour.entityId}, עם ${hourDisplay} בממוצע לקמפיין.`,
    facts: sources.map((source) => ({
      text: `${source.title}: ${source.metrics.map((item) => `${item.label} ${item.display}`).join(" · ")}`,
      evidenceIds: [source.id],
    })),
    calculations: rankedDays.length > 1 ? [{
      text: `הפער בממוצע לקמפיין בין ${rankedDays[0].entityId} ל-${rankedDays[1].entityId} הוא ${money(average(rankedDays[0]) - average(rankedDays[1]), input.account.currency)}.`,
      formula: `${rankedDays[0].metrics.find((item) => item.key === "averageRevenue")?.display} - ${rankedDays[1].metrics.find((item) => item.key === "averageRevenue")?.display}`,
      evidenceIds: rankedDays.slice(0, 2).map((source) => source.id),
    }] : [],
    inferences: [{
      text: count(strongestDay) < 3 || count(strongestHour) < 3
        ? "זו אינדיקציה שימושית, אך המדגם קטן ולכן כדאי לאמת אותה בעוד שליחות."
        : `לתכנון השליחה הבאה עדיף להתחיל ב-${strongestDay.entityId} סביב ${strongestHour.entityId}, ואז למדוד מול חלון חלופי.`,
      confidence,
      evidenceIds: [strongestDay.id, strongestHour.id],
    }],
    sources,
  };
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
    const visibleMetrics = source.metrics.filter((item) => ["revenue", "purchases", "smsCost", "roas", "unsubscribed", "unsubscribeRate"].includes(item.key)).slice(0, 5);
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
