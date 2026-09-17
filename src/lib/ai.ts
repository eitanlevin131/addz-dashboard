import { aiInsights } from "./demo-data";
import {
  normalizeAiGroundedResponse,
  type AiEvidenceSource,
  type AiGroundedResponse,
} from "./ai-grounding";
import { getAutomationSmsRecipients } from "./metrics";
import type {
  AiInsight,
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  NewsletterPlan,
  SmsCampaignReport,
} from "./types";
import type { SubjectLineEvidence } from "./subject-line-analysis";

export type AiAccountMemory = {
  brandVoice?: string;
  audiences?: string;
  products?: string;
  learnings?: string;
  constraints?: string;
  onboardingSummary?: string;
  onboardingQuestions?: string[];
  documents?: { name: string; content: string; createdAt: string }[];
};

export type AiClientProfile = {
  brandVoice: string;
  audiences: string[];
  products: string[];
  positioning: string;
  constraints: string[];
  contentAngles: string[];
  commercialMoments: string[];
  missingInfo: string[];
};

export type AiContextPack = {
  measurement: {
    source: "Flashy activity reports API";
    dateBasis: "campaign send date and automation activity date";
    revenueBasis: "revenue attributed to each activity under the account attribution window";
    limitation: string;
  };
  account: {
    name: string;
    currency: string;
    smsCreditPriceUsd: number;
    monthlySubscriptionCostUsd: number;
    agencyRetainerCostIls: number;
  };
  summary: MetricSummary;
  leaders: {
    email?: { name: string; subject: string; revenue: number; clicks: number; purchases: number };
    sms?: { name: string; message: string; revenue: number; cost: number; roas: number | null; purchases: number };
    automation?: { name: string; revenue: number; clicks: number; purchases: number };
  };
  weak: {
    sms?: { name: string; message: string; revenue: number; cost: number; roas: number | null };
    automation?: { name: string; revenue: number; clicks: number; sent: number };
  };
  patterns: {
    bestDays: { label: string; revenue: number; purchases: number; count: number }[];
    bestHours: { label: string; revenue: number; purchases: number; count: number }[];
    subjectWinners: { subject: string; campaign: string; revenue: number; openRate: number; clickRate: number }[];
    smsCopyExamples: { name: string; message: string; revenue: number; purchases: number; roas: number | null }[];
  };
  planning: {
    total: number;
    next: { date: string; title: string; channel: string; status: string }[];
  };
  memory: AiAccountMemory;
};

export type AiActionRecommendation = {
  title: string;
  priority: "high" | "medium" | "low";
  area: "campaigns" | "sms" | "automations" | "planning" | "strategy";
  why: string;
  action: string;
  expectedImpact: string;
  effort: "low" | "medium" | "high";
  kpi: string;
};

export type SmsCopyBrief = {
  objective: string;
  audience: string;
  offer: string;
  mustInclude?: string;
};

export type SmsCopyExample = {
  campaignId: number;
  name: string;
  message: string;
  revenue: number;
  purchases: number;
  roas: number | null;
};

export type SmsCopyVariant = {
  label: string;
  text: string;
  rationale: string;
  basedOnCampaignIds: number[];
};

export type SubjectLineBrief = {
  objective: string;
  audience: string;
  offer: string;
  tone: "direct" | "curious" | "promotional" | "brand";
  mustInclude?: string;
};

export type SubjectLineVariant = {
  subject: string;
  preheader: string;
};

export type SubjectLinePair = {
  label: string;
  hypothesis: string;
  confidence: "high" | "medium" | "low";
  variantA: SubjectLineVariant;
  variantB: SubjectLineVariant;
  basedOnCampaignIds: number[];
};

export type AiOpportunity = {
  id: string;
  title: string;
  area: "campaigns" | "sms" | "automations" | "planning";
  evidence: string;
  action: string;
  nextStep: string;
  potentialIls: number;
  confidence: number;
  effort: "low" | "medium" | "high";
  score: number;
  kpi: string;
};

export type AccountHealth = {
  score: number;
  grade: "excellent" | "good" | "watch" | "risk";
  summary: string;
  checks: { label: string; score: number; status: "good" | "watch" | "risk"; note: string }[];
};

export type NextBestSend = {
  channel: "email" | "sms" | "mixed";
  timing: string;
  audience: string;
  angle: string;
  reason: string;
  guardrail: string;
};

function money(value: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function effortWeight(effort: AiOpportunity["effort"]) {
  if (effort === "low") return 1;
  if (effort === "medium") return 0.72;
  return 0.48;
}

function opportunity(input: Omit<AiOpportunity, "score">): AiOpportunity {
  return {
    ...input,
    score: Math.round(input.potentialIls * input.confidence * effortWeight(input.effort)),
  };
}

export function ruleBasedInsights(
  clientId: string,
  summary: MetricSummary,
): AiInsight[] {
  const base = aiInsights.filter((insight) => insight.clientId === clientId);
  const generated: AiInsight[] = [];

  if (summary.roas && summary.roas < 4) {
    generated.push({
      id: `generated-roas-${clientId}`,
      clientId,
      category: "risk",
      priority: "high",
      title: "ROAS נמוך מהיעד",
      body: "היחס בין הכנסות לעלויות נמוך יחסית, בעיקר אחרי הכללת SMS ועלויות קבועות.",
      action: "להקטין שליחות SMS רחבות ולהעביר תקציב לקהלים עם רכישות אחרונות.",
    });
  }

  if (summary.conversionRate < 0.01) {
    generated.push({
      id: `generated-conversion-${clientId}`,
      clientId,
      category: "automation",
      priority: "medium",
      title: "שיעור רכישה נמוך ביחס לחשיפה",
      body: "יש מספיק שליחות וקליקים, אבל שיעור הרכישה מתוך נמענים נמוך.",
      action: "לבדוק התאמה בין ההבטחה בהודעה לבין עמוד הנחיתה והקופון.",
    });
  }

  return [...generated, ...base].slice(0, 5);
}

export function answerFromData(question: string, summary: MetricSummary) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes("sms") || lowerQuestion.includes("סמס")) {
    return `ב־SMS כדאי לבדוק קודם קהלים עם כוונת קנייה גבוהה. העלות החודשית המשוערת היא ${Math.round(
      summary.smsCost,
    ).toLocaleString("he-IL")} ש"ח, ולכן כל שליחה רחבה צריכה הצדקת הכנסה ברורה.`;
  }

  if (lowerQuestion.includes("roas") || lowerQuestion.includes("החזר")) {
    return `ה־ROAS הכללי כרגע הוא ${
      summary.roas ? summary.roas.toFixed(1) : "לא זמין"
    }. הרווח המשוער אחרי עלויות הוא ${Math.round(summary.profit).toLocaleString(
      "he-IL",
    )} ש"ח.`;
  }

  return "לפי הנתונים, כדאי להתחיל באופטימיזציה של זמני שליחה, שורות נושא עם מוצר ספציפי, והפרדה בין SMS לקהלים חמים לבין אימייל לקהל הרחב.";
}

export function buildAiContextPack(input: {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
  memory?: AiAccountMemory;
}): AiContextPack {
  const { account, summary, emails, sms, automations, plans, memory = {} } = input;
  const smsRows = sms
    .map((item) => {
      const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
      return {
        name: item.campaignName,
        message: item.messageText,
        revenue: item.revenueGenerated,
        cost,
        roas: cost > 0 ? item.revenueGenerated / cost : null,
        purchases: item.purchases,
      };
    })
    .filter((item) => item.cost > 0 || item.revenue > 0);
  const automationRows = automations.map((item) => ({
    name: item.automationName,
    revenue: item.revenueGenerated,
    clicks: item.totalClicks + (item.clickedSms ?? 0),
    purchases: item.purchases,
    sent: (item.sentEmails ?? 0) + getAutomationSmsRecipients(item),
  }));
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const campaignRows = [
    ...emails.map((item) => ({
      sentAt: item.sentAt,
      revenue: item.revenueGenerated,
      purchases: item.purchases,
      clicks: item.totalClicks,
      recipients: item.totalRecipients,
    })),
    ...sms.map((item) => ({
      sentAt: item.sentAt,
      revenue: item.revenueGenerated,
      purchases: item.purchases,
      clicks: item.totalClicks,
      recipients: item.totalRecipients,
    })),
  ];
  const aggregateBy = (labelFor: (sentAt: string) => string) => {
    const groups = new Map<string, { label: string; revenue: number; purchases: number; count: number }>();

    for (const item of campaignRows) {
      const label = labelFor(item.sentAt);
      const current = groups.get(label) ?? { label, revenue: 0, purchases: 0, count: 0 };
      current.revenue += item.revenue;
      current.purchases += item.purchases;
      current.count += 1;
      groups.set(label, current);
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.revenue - a.revenue || b.purchases - a.purchases || b.count - a.count,
    );
  };

  return {
    measurement: {
      source: "Flashy activity reports API",
      dateBasis: "campaign send date and automation activity date",
      revenueBasis: "revenue attributed to each activity under the account attribution window",
      limitation: "This is not Flashy Sales Overview revenue. Sales Overview filters purchases by conversion date and can include campaigns sent before the selected range; it is not available through the public API.",
    },
    account: {
      name: account.name,
      currency: account.currency,
      smsCreditPriceUsd: account.smsCreditPriceUsd,
      monthlySubscriptionCostUsd: account.monthlySubscriptionCostUsd,
      agencyRetainerCostIls: account.agencyRetainerCostIls,
    },
    summary,
    leaders: {
      email: [...emails]
        .sort((a, b) => b.revenueGenerated - a.revenueGenerated || b.totalClicks - a.totalClicks)
        .map((item) => ({
          name: item.campaignName,
          subject: item.subjectLine,
          revenue: item.revenueGenerated,
          clicks: item.totalClicks,
          purchases: item.purchases,
        }))[0],
      sms: [...smsRows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue)[0],
      automation: [...automationRows].sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases)[0],
    },
    weak: {
      sms: [...smsRows].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0) || b.cost - a.cost)[0],
      automation: [...automationRows]
        .filter((item) => item.sent > 0)
        .sort((a, b) => a.clicks - b.clicks || a.revenue - b.revenue)[0],
    },
    patterns: {
      bestDays: aggregateBy((sentAt) => dayNames[new Date(sentAt).getDay()]).slice(0, 3),
      bestHours: aggregateBy((sentAt) => `${String(new Date(sentAt).getHours()).padStart(2, "0")}:00`).slice(0, 3),
      subjectWinners: [...emails]
        .map((item) => ({
          subject: item.subjectLine,
          campaign: item.campaignName,
          revenue: item.revenueGenerated,
          openRate: item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : 0,
          clickRate: item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue || b.clickRate - a.clickRate || b.openRate - a.openRate)
        .slice(0, 5),
      smsCopyExamples: [...smsRows]
        .filter((item) => item.message.trim())
        .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue)
        .slice(0, 10),
    },
    planning: {
      total: plans.length,
      next: [...plans]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
        .map((plan) => ({
          date: plan.date,
          title: plan.title,
          channel: plan.channel,
          status: plan.status,
        })),
    },
    memory: {
      ...memory,
      documents: (memory.documents ?? []).map((document) => ({
        ...document,
        content: document.content.slice(0, 6000),
      })),
    },
  };
}

export function fallbackActionPlan(context: AiContextPack): AiActionRecommendation[] {
  const recommendations: AiActionRecommendation[] = [];

  if (context.leaders.email) {
    recommendations.push({
      title: "לשכפל את זווית הקמפיין המנצח",
      priority: "high",
      area: "campaigns",
      why: `${context.leaders.email.name} ייצר ${money(context.leaders.email.revenue, context.account.currency)}.`,
      action: "לבנות קמפיין המשך עם אותה הבטחה, לקהל שלא רכש, ולהחליף רק מוצר/דדליין.",
      expectedImpact: "יותר הכנסה מקהל שכבר הגיב למסר דומה.",
      effort: "low",
      kpi: "הכנסה, קליקים, רכישות",
    });
  }

  if (context.weak.sms && (context.weak.sms.roas ?? 0) < 3) {
    recommendations.push({
      title: "לצמצם SMS רחב לקהל חם",
      priority: "high",
      area: "sms",
      why: `${context.weak.sms.name} החזיר ROAS ${context.weak.sms.roas?.toFixed(1) ?? "0"}x.`,
      action: "להריץ את ה-SMS הבא רק לנוטשי עגלה/רוכשים אחרונים/קליקים אחרונים במקום לכל הרשימה.",
      expectedImpact: "פחות עלות SMS ושיפור ROAS.",
      effort: "medium",
      kpi: "ROAS SMS, עלות, רכישות",
    });
  }

  if (context.weak.automation && context.weak.automation.sent > 0) {
    recommendations.push({
      title: "לתקן אוטומציה עם תגובה נמוכה",
      priority: "medium",
      area: "automations",
      why: `${context.weak.automation.name} נשלחת אבל מייצרת מעט קליקים/הכנסה.`,
      action: "לבדוק טריגר, שורת נושא ותזמון. להתחיל בשינוי אחד בלבד כדי למדוד השפעה.",
      expectedImpact: "שיפור מעורבות ורכישות מאוטומציה קיימת.",
      effort: "medium",
      kpi: "Click rate, רכישות, הכנסה",
    });
  }

  if (context.patterns.bestDays[0] || context.patterns.bestHours[0]) {
    recommendations.push({
      title: "לתזמן קמפיינים לפי דפוסי ביצועים",
      priority: "medium",
      area: "planning",
      why: `היום/שעה החזקים: ${context.patterns.bestDays[0]?.label ?? "—"} ${context.patterns.bestHours[0]?.label ?? ""}.`,
      action: "לתכנן את הקמפיין המסחרי הבא סביב החלון החזק ולשמור ימים חלשים לתוכן רך.",
      expectedImpact: "יותר רכישות מאותו נפח שליחה.",
      effort: "low",
      kpi: "Revenue per campaign, רכישות",
    });
  }

  return recommendations.slice(0, 4);
}

export function buildOpportunityEngine(input: {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}): AiOpportunity[] {
  const { account, summary, emails, sms, automations, plans } = input;
  const avgOrderValue = summary.purchases > 0 ? summary.revenue / summary.purchases : Math.max(120, summary.revenue * 0.02);
  const opportunities: AiOpportunity[] = [];

  const emailWithClicksNoPurchases = [...emails]
    .filter((item) => item.totalClicks >= 80 && item.purchases <= 1)
    .sort((a, b) => b.totalClicks - a.totalClicks)[0];
  if (emailWithClicksNoPurchases) {
    const estimatedPurchases = Math.max(1, Math.round(emailWithClicksNoPurchases.totalClicks * 0.015));
    opportunities.push(
      opportunity({
        id: `email-clicks-no-purchase-${emailWithClicksNoPurchases.id}`,
        title: "קליקים בלי מספיק רכישות",
        area: "campaigns",
        evidence: `${emailWithClicksNoPurchases.campaignName} יצר ${emailWithClicksNoPurchases.totalClicks.toLocaleString("he-IL")} קליקים אבל רק ${emailWithClicksNoPurchases.purchases.toLocaleString("he-IL")} רכישות.`,
        action: "לבדוק התאמה בין ההבטחה במייל לעמוד/מוצר, ואז לשלוח follow-up רק למקליקים שלא רכשו.",
        nextStep: "לבנות קמפיין רימרקטינג למקליקים עם מסר שמסיר חסם רכישה אחד.",
        potentialIls: estimatedPurchases * avgOrderValue,
        confidence: 0.72,
        effort: "medium",
        kpi: "Click-to-purchase rate",
      }),
    );
  }

  const smsRows = sms
    .map((item) => {
      const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
      return { ...item, cost, roas: cost > 0 ? item.revenueGenerated / cost : null };
    })
    .filter((item) => item.cost > 0);
  const scalableSms = [...smsRows]
    .filter((item) => (item.roas ?? 0) >= 8 && item.purchases > 0)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  if (scalableSms) {
    opportunities.push(
      opportunity({
        id: `scale-sms-${scalableSms.id}`,
        title: "SMS שאפשר לשכפל בזהירות",
        area: "sms",
        evidence: `${scalableSms.campaignName} החזיר ROAS ${scalableSms.roas?.toFixed(1)}x עם ${money(scalableSms.revenueGenerated, account.currency)} הכנסה.`,
        action: "לשכפל את המסר לקהל חם סמוך, לא לכל הרשימה, ולשמור על אותה הצעת ערך.",
        nextStep: "להכין וריאציית SMS אחת לקהל רוכשים/מקליקים אחרונים.",
        potentialIls: scalableSms.revenueGenerated * 0.25,
        confidence: 0.78,
        effort: "low",
        kpi: "SMS ROAS",
      }),
    );
  }

  const wasteSms = [...smsRows]
    .filter((item) => (item.roas ?? 0) < 1.5 && item.cost > 100)
    .sort((a, b) => b.cost - a.cost)[0];
  if (wasteSms) {
    opportunities.push(
      opportunity({
        id: `cut-sms-waste-${wasteSms.id}`,
        title: "עלות SMS שצריך לעצור או לצמצם",
        area: "sms",
        evidence: `${wasteSms.campaignName} עלה ${money(wasteSms.cost, account.currency)} והחזיר ${money(wasteSms.revenueGenerated, account.currency)}.`,
        action: "לא להריץ שליחה דומה רחבה עד שמחליפים קהל/הצעה/תזמון.",
        nextStep: "להגדיר rule: SMS רחב יוצא רק אם יש קהל חם או הצעה עם הוכחת ביצועים.",
        potentialIls: Math.max(0, wasteSms.cost - wasteSms.revenueGenerated),
        confidence: 0.82,
        effort: "low",
        kpi: "עלות SMS שנחסכה",
      }),
    );
  }

  const automationRows = automations.map((item) => {
    const sent = (item.sentEmails ?? 0) + getAutomationSmsRecipients(item);
    return {
      ...item,
      sent,
      clickRate: sent > 0 ? (item.totalClicks + (item.clickedSms ?? 0)) / sent : 0,
    };
  });
  const strongAutomation = [...automationRows]
    .filter((item) => item.revenueGenerated > 0)
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  if (strongAutomation && strongAutomation.totalClicks > strongAutomation.purchases * 2) {
    opportunities.push(
      opportunity({
        id: `automation-followup-${strongAutomation.id}`,
        title: "אוטומציה שמכניסה כסף ויכולה לקבל follow-up",
        area: "automations",
        evidence: `${strongAutomation.automationName} יצרה ${money(strongAutomation.revenueGenerated, account.currency)} ו-${strongAutomation.totalClicks.toLocaleString("he-IL")} קליקים.`,
        action: "להוסיף שלב המשך למי שקליק ולא רכש, עם חסם/שאלה אחרת מהמסר הראשון.",
        nextStep: "להוסיף מייל follow-up אחרי 24 שעות למקליקים ללא רכישה.",
        potentialIls: strongAutomation.revenueGenerated * 0.12,
        confidence: 0.66,
        effort: "medium",
        kpi: "Automation revenue uplift",
      }),
    );
  }

  const weakAutomation = [...automationRows]
    .filter((item) => item.sent >= 100 && item.totalClicks === 0)
    .sort((a, b) => b.sent - a.sent)[0];
  if (weakAutomation) {
    opportunities.push(
      opportunity({
        id: `weak-automation-${weakAutomation.id}`,
        title: "אוטומציה פעילה בלי תגובה",
        area: "automations",
        evidence: `${weakAutomation.automationName} נשלחה ל-${weakAutomation.sent.toLocaleString("he-IL")} נמענים בלי קליקים.`,
        action: "לשנות טריגר/נושא/מסר ראשון, או לעצור זמנית אם זו שליחת SMS.",
        nextStep: "להחליף שורת נושא/פתיח ולמדוד 7 ימים לפני שינוי נוסף.",
        potentialIls: Math.max(avgOrderValue, summary.revenue * 0.015),
        confidence: 0.61,
        effort: "medium",
        kpi: "Automation click rate",
      }),
    );
  }

  const plannedChannels = new Set(plans.map((plan) => plan.channel));
  if (plans.length < 4 || !plannedChannels.has("sms")) {
    opportunities.push(
      opportunity({
        id: "planning-gap",
        title: "פער בתכנון החודשי",
        area: "planning",
        evidence: `בגאנט יש ${plans.length.toLocaleString("he-IL")} פריטים, ${plannedChannels.has("sms") ? "כולל SMS" : "בלי SMS מתוכנן"}.`,
        action: "לתכנן מראש קמפיין מסחרי אחד עם תמיכת SMS לקהל חם, במקום להגיב ברגע האחרון.",
        nextStep: "להוסיף לגאנט דיוור מסחרי אחד לשבועיים הקרובים + SMS רק לקהל חם.",
        potentialIls: Math.max(avgOrderValue * 2, summary.revenue * 0.03),
        confidence: 0.55,
        effort: "low",
        kpi: "Planned revenue actions",
      }),
    );
  }

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function buildAccountHealth(input: {
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}): AccountHealth {
  const { summary, emails, sms, automations, plans } = input;
  const smsShare = summary.revenue > 0 ? sms.reduce((total, item) => total + item.revenueGenerated, 0) / summary.revenue : 0;
  const activeAutomations = automations.filter((item) => item.revenueGenerated > 0 || item.totalClicks > 0).length;
  const weakAutomations = automations.filter((item) => {
    const sent = (item.sentEmails ?? 0) + getAutomationSmsRecipients(item);
    return sent > 0 && item.totalClicks === 0 && item.revenueGenerated === 0;
  }).length;
  const campaignVolumeScore = Math.min(100, (emails.length + sms.length) * 12);
  const checks: AccountHealth["checks"] = [
    {
      label: "רווחיות",
      score: summary.roas ? Math.min(100, Math.round(summary.roas * 10)) : 35,
      status: summary.roas && summary.roas >= 8 ? "good" : summary.roas && summary.roas >= 3 ? "watch" : "risk",
      note: `ROAS ${summary.roas ? `${summary.roas.toFixed(1)}x` : "לא זמין"}`,
    },
    {
      label: "קצב קמפיינים",
      score: campaignVolumeScore,
      status: campaignVolumeScore >= 70 ? "good" : campaignVolumeScore >= 35 ? "watch" : "risk",
      note: `${emails.length + sms.length} קמפיינים בטווח`,
    },
    {
      label: "אוטומציות",
      score: Math.max(0, Math.min(100, activeAutomations * 18 - weakAutomations * 10)),
      status: weakAutomations === 0 && activeAutomations >= 3 ? "good" : weakAutomations <= 2 ? "watch" : "risk",
      note: `${activeAutomations} פעילות, ${weakAutomations} דורשות טיפול`,
    },
    {
      label: "תלות ב-SMS",
      score: Math.round(Math.max(30, 100 - smsShare * 70)),
      status: smsShare < 0.45 ? "good" : smsShare < 0.7 ? "watch" : "risk",
      note: `${Math.round(smsShare * 100)}% מההכנסה מיוחסת ל-SMS`,
    },
    {
      label: "תכנון קדימה",
      score: Math.min(100, plans.length * 18),
      status: plans.length >= 4 ? "good" : plans.length >= 2 ? "watch" : "risk",
      note: `${plans.length} פריטים בגאנט`,
    },
  ];
  const score = Math.round(checks.reduce((total, item) => total + item.score, 0) / checks.length);
  const grade = score >= 82 ? "excellent" : score >= 65 ? "good" : score >= 45 ? "watch" : "risk";

  return {
    score,
    grade,
    summary:
      grade === "excellent"
        ? "החשבון בריא ומוכן להגדלה זהירה."
        : grade === "good"
          ? "החשבון עובד, ויש כמה נקודות לשיפור כדי להגדיל רווחיות."
          : grade === "watch"
            ? "החשבון דורש תשומת לב בכמה אזורים לפני שמגדילים נפח."
            : "החשבון בסיכון ודורש טיפול לפני הרחבת פעילות.",
    checks,
  };
}

export function buildNextBestSend(input: {
  context: AiContextPack;
  opportunities: AiOpportunity[];
}): NextBestSend {
  const { context, opportunities } = input;
  const topOpportunity = opportunities[0];
  const bestSubject = context.patterns.subjectWinners[0];
  const bestDay = context.patterns.bestDays[0]?.label ?? "היום החזק הבא בגאנט";
  const bestHour = context.patterns.bestHours[0]?.label ?? "09:00";

  if (topOpportunity?.area === "sms" && context.leaders.sms) {
    return {
      channel: "sms",
      timing: `${bestDay}, סביב ${bestHour}`,
      audience: "קהל חם בלבד: רוכשים אחרונים, נוטשי עגלה או מקליקים אחרונים",
      angle: context.leaders.sms.name,
      reason: "יש SMS עם החזר מוכח, אבל חשוב לא להרחיב אותו לכל הרשימה.",
      guardrail: "לא שולחים SMS רחב אם אין הצעה חזקה או קהל עם כוונת קנייה.",
    };
  }

  if (topOpportunity?.area === "automations" && context.leaders.automation) {
    return {
      channel: "email",
      timing: "24 שעות אחרי קליק ללא רכישה",
      audience: "מקליקים באוטומציה שלא רכשו",
      angle: "הסרת חסם רכישה או תזכורת עדינה להצעה",
      reason: "האוטומציה כבר מוכיחה כוונה, וה-follow-up יכול להוציא עוד ערך מאותו קהל.",
      guardrail: "משנים רק שלב אחד כדי למדוד השפעה נקייה.",
    };
  }

  return {
    channel: "email",
    timing: `${bestDay}, סביב ${bestHour}`,
    audience: "מקליקים/פותחים שלא רכשו מהקמפיין המוביל",
    angle: bestSubject?.subject || context.leaders.email?.subject || "וריאציה לזווית שהכניסה הכי הרבה",
    reason: "אימייל מאפשר לבדוק זווית מסחרית בלי עלות SMS נוספת.",
    guardrail: "אם אין תגובה במייל, לא ממשיכים ל-SMS לפני שמחדדים הצעה/קהל.",
  };
}

export function fallbackAgentAnswer(question: string, context: AiContextPack) {
  const q = question.toLowerCase();
  const { summary, leaders, weak, account } = context;

  if (q.includes("קמפיין") || q.includes("לשכפל")) {
    return leaders.email
      ? `הקמפיין שהכי כדאי לשכפל הוא "${leaders.email.name}". הוא ייצר ${money(
          leaders.email.revenue,
          account.currency,
        )}, ${leaders.email.clicks.toLocaleString("he-IL")} קליקים ו-${leaders.email.purchases.toLocaleString(
          "he-IL",
        )} רכישות. ההמלצה שלי: לקחת את אותה זווית מסר ולשלוח וריאציה לקהל שלא רכש.`
      : "אין מספיק קמפייני אימייל עם הכנסה בטווח הנוכחי. הייתי מתחיל בבדיקת קמפיינים עם קליקים גבוהים אבל הכנסה נמוכה.";
  }

  if (q.includes("sms") || q.includes("סמס")) {
    return weak.sms
      ? `ב-SMS צריך לבדוק קודם את "${weak.sms.name}". הוא עלה ${money(
          weak.sms.cost,
          account.currency,
        )} והחזיר ${money(weak.sms.revenue, account.currency)}. עד שמשפרים החזר, עדיף לשלוח SMS בעיקר לקהלים חמים ולא לשליחות רחבות.`
      : `ה-SMS נראה יציב יחסית. עלות ה-SMS בטווח היא ${money(summary.smsCost, account.currency)} מול הכנסה מיוחסת לפעילות של ${money(
          summary.revenue,
          account.currency,
        )}.`;
  }

  if (q.includes("אוטומ")) {
    return leaders.automation
      ? `האוטומציה החזקה היא "${leaders.automation.name}" עם ${money(
          leaders.automation.revenue,
          account.currency,
        )}. כדאי לבדוק אם אפשר להוסיף לה המשך אחרי קליק ללא רכישה.`
      : "אין כרגע אוטומציה מובילה מספיק ברורה. הייתי בודק קודם אוטומציות עם שליחות אבל בלי קליקים.";
  }

  return `לפי דוחות הפעילות: ההכנסה המיוחסת היא ${money(summary.revenue, account.currency)}, הרווח אחרי עלויות הוא ${money(
    summary.profit,
    account.currency,
  )}, וה-ROAS הוא ${summary.roas ? `${summary.roas.toFixed(1)}x` : "לא זמין"}. הפעולה הכי טובה עכשיו היא לשכפל את הפעילות המובילה ולבדוק את נקודת החולשה הכי יקרה.`;
}

export function fallbackAgentInsights(clientId: string, context: AiContextPack): AiInsight[] {
  const base = ruleBasedInsights(clientId, context.summary);
  const insights: AiInsight[] = [];

  if (context.leaders.email) {
    insights.push({
      id: `agent-email-${clientId}`,
      clientId,
      category: "subject",
      priority: "high",
      title: "קמפיין לשכפול",
      body: `${context.leaders.email.name} הוא קמפיין האימייל החזק בטווח עם ${money(
        context.leaders.email.revenue,
        context.account.currency,
      )}.`,
      action: "לבנות וריאציה נוספת לאותו מסר, לקהל שלא רכש בקמפיין המקורי.",
    });
  }

  if (context.weak.sms && (context.weak.sms.roas ?? 0) < 2) {
    insights.push({
      id: `agent-sms-${clientId}`,
      clientId,
      category: "sms",
      priority: "high",
      title: "SMS שדורש בדיקה",
      body: `${context.weak.sms.name} מחזיר ROAS ${context.weak.sms.roas?.toFixed(1) ?? "0"}x.`,
      action: "להוריד שליחות רוחב ולבדוק קהל חם, קופון ברור יותר או תזמון אחר.",
    });
  }

  if (context.leaders.automation) {
    insights.push({
      id: `agent-automation-${clientId}`,
      clientId,
      category: "automation",
      priority: "medium",
      title: "אוטומציה חזקה",
      body: `${context.leaders.automation.name} יצרה ${money(
        context.leaders.automation.revenue,
        context.account.currency,
      )}.`,
      action: "לבדוק האם אפשר להוסיף לה שלב המשך אחרי קליק ללא רכישה.",
    });
  }

  return [...insights, ...base].slice(0, 6);
}

export function getConfiguredOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

type OpenAiResponsesPayload = {
  error?: { message?: string; code?: string | null; type?: string };
  output?: { content?: { type?: string; text?: string }[] }[];
};

function readOpenAiOutput(payload: OpenAiResponsesPayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
}

async function requestOpenAiJson(instructions: string, input: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY לא מוגדר בשרת.");
  const model = getConfiguredOpenAiModel();

  const openAiBaseUrl = process.env.OPENAI_API_BASE_URL?.trim() || "https://api.openai.com";
  const response = await fetch(`${openAiBaseUrl.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      text: { format: { type: "json_object" } },
      ...(model.startsWith("gpt-5") ? { reasoning: { effort: "minimal" } } : {}),
      max_output_tokens: 3_000,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiResponsesPayload;
  if (!response.ok) {
    const reason = payload.error?.message?.trim();
    throw new Error(`OpenAI API error ${response.status}${reason ? `: ${reason.slice(0, 240)}` : ""}`);
  }

  const output = readOpenAiOutput(payload);
  if (!output) throw new Error("OpenAI החזיר תשובה ריקה.");
  return output;
}

export async function askOpenAiAgent(input: {
  question: string;
  context: AiContextPack;
  evidence: AiEvidenceSource[];
  currentView?: string;
  mode?: "chat" | "recommendations";
}): Promise<AiGroundedResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt =
    input.mode === "recommendations"
      ? "צור 4 המלצות קצרות ומעשיות לאופטימיזציה. החזר תשובה בעברית עם כותרות קצרות ופעולה לכל המלצה."
      : input.question;
  const raw = await requestOpenAiJson(
    "אתה סוכן AI לאופטימיזציית אימייל ו-SMS מרקטינג. החזר אובייקט JSON בלבד בעברית. התבסס רק על ה-Context Pack ועל Evidence Catalog. אל תמציא נתונים או מזהי מקור. כל עובדה, חישוב והסקה חייבים evidenceIds מתוך הקטלוג. facts מכיל רק נתונים שנמדדו; calculations מכיל תוצאה ונוסחה גלויה; inferences מכיל פרשנות או המלצה ורמת ביטחון. אם חסר מידע, אמור מה חסר. ההכנסות הן הכנסות מיוחסות לדוחות פעילות לפי מועד שליחה/פעילות, ולא Sales Overview לפי מועד רכישה.",
    `מסך נוכחי: ${input.currentView ?? "overview"}\n\nContext Pack JSON:\n${JSON.stringify(input.context)}\n\nEvidence Catalog JSON:\n${JSON.stringify(input.evidence)}\n\nשאלה/משימה:\n${prompt}\n\nהחזר אובייקט JSON במבנה הבא בלבד:\n{"answer":"תשובה קצרה וישירה","facts":[{"text":"נתון מדוד","evidenceIds":["source:id"]}],"calculations":[{"text":"תוצאת החישוב","formula":"המספרים והפעולה","evidenceIds":["source:id"]}],"inferences":[{"text":"הסקה או המלצה","confidence":"high|medium|low","evidenceIds":["source:id"]}]}`,
  );
  const parsed = JSON.parse(raw) as unknown;
  return normalizeAiGroundedResponse(parsed, input.evidence, fallbackAgentAnswer(input.question, input.context));
}

export async function askOpenAiActionPlan(context: AiContextPack) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const raw = await requestOpenAiJson(
    "אתה מנהל אופטימיזציית Email/SMS Marketing לסוכנות. החזר אובייקט JSON בלבד. אל תמציא מספרים. כבד את הגדרת measurement: נתוני ההכנסה הם הכנסות מיוחסות לפעילויות לפי מועד שליחה/פעילות ואינם Sales Overview לפי מועד רכישה. תן המלצות פרקטיות שמבוססות על הנתונים. כל המלצה חייבת להיות פעולה שאפשר לבצע השבוע.",
    `Context Pack:\n${JSON.stringify(context)}\n\nהחזר אובייקט JSON במבנה:\n{"recommendations":[{"title":"...","priority":"high|medium|low","area":"campaigns|sms|automations|planning|strategy","why":"...","action":"...","expectedImpact":"...","effort":"low|medium|high","kpi":"..."}]}\nעד 5 המלצות. עברית בלבד.`,
  );
  const parsed = JSON.parse(raw) as { recommendations?: AiActionRecommendation[] };

  return (parsed.recommendations ?? []).filter(Boolean).slice(0, 5);
}

export async function askOpenAiSmsCopy(input: {
  accountName: string;
  brief: SmsCopyBrief;
  memory: AiAccountMemory;
  examples: SmsCopyExample[];
}) {
  if (!process.env.OPENAI_API_KEY) return null;

  const allowedCampaignIds = new Set(input.examples.map((item) => item.campaignId));
  const raw = await requestOpenAiJson(
    [
      "אתה קופירייטר SMS בכיר לסוכנות שיווק.",
      "כתוב בעברית בלבד והחזר JSON בלבד.",
      "התבסס על הבריף, פרופיל הלקוח ודוגמאות הביצועים שסופקו.",
      "אסור להמציא הנחה, קוד קופון, מחיר, תאריך, מלאי או הבטחה שלא הופיעו בבריף.",
      "שמור על קול המותג, CTA אחד ברור וטקסט שמתאים ל-SMS.",
      "הודעות עבר הן השראה מבנית בלבד; אין להעתיק משפטים ארוכים או פרטים מסחריים ישנים.",
      "החזר שלוש וריאציות שונות באמת, ולכל אחת הסבר קצר ומזהי קמפיינים שעליהם התבססה.",
    ].join(" "),
    `לקוח: ${input.accountName}\n\nבריף:\n${JSON.stringify(input.brief)}\n\nפרופיל וזיכרון לקוח:\n${JSON.stringify({
      brandVoice: input.memory.brandVoice ?? "",
      audiences: input.memory.audiences ?? "",
      products: input.memory.products ?? "",
      learnings: input.memory.learnings ?? "",
      constraints: input.memory.constraints ?? "",
      documents: (input.memory.documents ?? []).slice(0, 6).map((document) => ({
        name: document.name,
        content: document.content.slice(0, 3_000),
      })),
    })}\n\nהודעות עבר ומדדים:\n${JSON.stringify(input.examples)}\n\nהחזר JSON במבנה:\n{"patterns":["דפוס מוכח 1","דפוס מוכח 2"],"variants":[{"label":"שם קצר","text":"טקסט SMS מלא","rationale":"למה הנוסח מתאים","basedOnCampaignIds":[123]}]}`,
  );
  const parsed = JSON.parse(raw) as { patterns?: unknown; variants?: unknown };
  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];
  const variants = Array.isArray(parsed.variants)
    ? parsed.variants.map((item) => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const basedOnCampaignIds = Array.isArray(value.basedOnCampaignIds)
          ? value.basedOnCampaignIds
              .map((candidate) => Number(candidate))
              .filter((candidate) => Number.isInteger(candidate) && allowedCampaignIds.has(candidate))
              .slice(0, 4)
          : [];
        return {
          label: String(value.label ?? "וריאציה").trim().slice(0, 80),
          text: String(value.text ?? "").trim().slice(0, 500),
          rationale: String(value.rationale ?? "").trim().slice(0, 500),
          basedOnCampaignIds,
        } satisfies SmsCopyVariant;
      }).filter((item) => item.text).slice(0, 3)
    : [];

  if (!variants.length) throw new Error("OpenAI לא החזיר טיוטות SMS תקינות.");
  return { patterns, variants };
}

export async function askOpenAiSubjectLines(input: {
  accountName: string;
  brief: SubjectLineBrief;
  memory: AiAccountMemory;
  examples: SubjectLineEvidence[];
}) {
  if (!process.env.OPENAI_API_KEY) return null;

  const allowedCampaignIds = new Set(input.examples.map((item) => item.campaignId));
  const raw = await requestOpenAiJson(
    [
      "אתה קופירייטר אימייל בכיר שמנסח ניסויי A/B לשורות נושא.",
      "כתוב בעברית בלבד והחזר JSON בלבד.",
      "המדדים מצביעים על קורלציה בלבד; אל תטען ששורת הנושא לבדה גרמה לביצועים.",
      "כל זוג A/B חייב לשנות משתנה מרכזי אחד בלבד ולהציג השערה מדידה.",
      "אסור להמציא הנחה, מחיר, קוד קופון, מוצר, מלאי, תאריך או הבטחה שלא הופיעו בבריף.",
      "השתמש בקמפיינים ההיסטוריים כהשראה מבנית, בלי להעתיק ניסוחים ארוכים.",
      "החזר שלושה זוגות שונים ולכל זוג מזהי קמפיינים אמיתיים שעליהם התבססת.",
    ].join(" "),
    `לקוח: ${input.accountName}\n\nבריף:\n${JSON.stringify(input.brief)}\n\nפרופיל וזיכרון לקוח:\n${JSON.stringify({
      brandVoice: input.memory.brandVoice ?? "",
      audiences: input.memory.audiences ?? "",
      products: input.memory.products ?? "",
      learnings: input.memory.learnings ?? "",
      constraints: input.memory.constraints ?? "",
      documents: (input.memory.documents ?? []).slice(0, 6).map((document) => ({
        name: document.name,
        content: document.content.slice(0, 3_000),
      })),
    })}\n\nקמפיינים היסטוריים ומדדים:\n${JSON.stringify(input.examples)}\n\nהחזר JSON במבנה:\n{"patterns":["דפוס שנצפה בנתונים"],"pairs":[{"label":"שם הבדיקה","hypothesis":"מה משתנה ומה המדד שנבדוק","confidence":"high|medium|low","variantA":{"subject":"...","preheader":"..."},"variantB":{"subject":"...","preheader":"..."},"basedOnCampaignIds":[123]}]}`,
  );
  const parsed = JSON.parse(raw) as { patterns?: unknown; pairs?: unknown };
  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];
  const pairs = Array.isArray(parsed.pairs)
    ? parsed.pairs.map((item) => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const variant = (candidate: unknown): SubjectLineVariant => {
          const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
          return {
            subject: String(row.subject ?? "").trim().slice(0, 180),
            preheader: String(row.preheader ?? "").trim().slice(0, 240),
          };
        };
        const confidence = value.confidence === "high" || value.confidence === "low" ? value.confidence : "medium";
        const basedOnCampaignIds = Array.isArray(value.basedOnCampaignIds)
          ? value.basedOnCampaignIds
              .map((candidate) => Number(candidate))
              .filter((candidate) => Number.isInteger(candidate) && allowedCampaignIds.has(candidate))
              .slice(0, 5)
          : [];
        return {
          label: String(value.label ?? "בדיקת A/B").trim().slice(0, 100),
          hypothesis: String(value.hypothesis ?? "").trim().slice(0, 500),
          confidence,
          variantA: variant(value.variantA),
          variantB: variant(value.variantB),
          basedOnCampaignIds,
        } satisfies SubjectLinePair;
      }).filter((item) => item.variantA.subject && item.variantB.subject && item.basedOnCampaignIds.length).slice(0, 3)
    : [];

  if (!pairs.length) throw new Error("OpenAI לא החזיר זוגות שורות נושא עם מקורות תקינים.");
  return { patterns, pairs };
}

export function fallbackOnboarding(context: AiContextPack) {
  const documents = context.memory.documents ?? [];
  const documentNames = documents.map((document) => document.name).join(", ") || "לא הועלו מסמכים";

  return {
    summary: `נסרקו ${documents.length} מסמכים: ${documentNames}. כדי לחבר את ה-AI טוב יותר לפרויקט, צריך להשלים בעיקר קהלי יעד, מוצרים מרכזיים, טון מותג ומגבלות מסחריות.`,
    profile: {
      brandVoice: context.memory.brandVoice || "עדיין לא זוהה טון מותג ברור מתוך המסמכים.",
      audiences: context.memory.audiences
        ? context.memory.audiences.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 5)
        : ["לקוחות פעילים", "לקוחות שהתעניינו ולא רכשו", "לקוחות חוזרים"],
      products: context.memory.products
        ? context.memory.products.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 5)
        : ["מוצרים מרכזיים יזוהו אחרי מסמכי אסטרטגיה/קטגוריות"],
      positioning: "חסר מיצוב ברור. מומלץ להעלות בריף מותג או מסמך אסטרטגיה.",
      constraints: context.memory.constraints
        ? context.memory.constraints.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 5)
        : ["לא להמציא מבצעים או הבטחות שלא קיימים במסמכים"],
      contentAngles: ["הוכחת ערך", "מוצר מוביל", "סיבה לקנייה עכשיו"],
      commercialMoments: ["חגים", "השקות", "סופי חודש", "אירועי עונה"],
      missingInfo: [
        "קהלי יעד לפי רווחיות",
        "קטגוריות או מוצרים אסטרטגיים",
        "מגבלות מבצעיות וטון שאסור להשתמש בו",
      ],
    } satisfies AiClientProfile,
    questions: [
      "מי 2-3 הקהלים הכי רווחיים או חשובים למותג?",
      "אילו מוצרים או קטגוריות הכי חשוב לקדם ברבעון הקרוב?",
      "איזה סוג מבצעים/מסרים הלקוח לא רוצה להשתמש בהם?",
      "מה נחשב הצלחה מבחינתכם: הכנסה, רכישות, רווחיות, שמירה על מותג או שילוב שלהם?",
      "יש עונות, חגים או אירועים מסחריים שחייבים לתכנן סביבם?",
    ],
  };
}

export async function askOpenAiOnboarding(context: AiContextPack) {
  return askOpenAiOnboardingDocuments(context.memory.documents ?? [], context.memory);
}

export async function askOpenAiOnboardingDocuments(
  documents: { name: string; content: string; createdAt: string }[],
  memory: AiAccountMemory = {},
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const raw = await requestOpenAiJson(
    "אתה מבצע onboarding ללקוח Email/SMS Marketing לפי מסמכי אפיון/אסטרטגיה. החזר אובייקט JSON בלבד בעברית. הפוך את המסמכים לפרופיל לקוח מובנה, חד ושימושי להמלצות AI. אל תמציא עובדות. אם משהו חסר, שים אותו ב-missingInfo.",
    `מסמכי הלקוח:\n${JSON.stringify(documents.map((document) => ({ ...document, content: document.content.slice(0, 12_000) })))}\n\nמידע קיים:\n${JSON.stringify(memory)}\n\nהחזר אובייקט JSON במבנה:\n{"summary":"סיכום קצר של מה שהבנת מהמסמכים","profile":{"brandVoice":"טון מותג במשפט קצר","audiences":["קהל 1","קהל 2"],"products":["מוצר/קטגוריה 1"],"positioning":"מיצוב והצעת ערך","constraints":["דברים לא לעשות"],"contentAngles":["זוויות תוכן מומלצות"],"commercialMoments":["עונות/חגים/רגעים מסחריים"],"missingInfo":["מה חסר כדי לדייק"]},"questions":["שאלה 1","שאלה 2","שאלה 3","שאלה 4","שאלה 5"]}`,
  );
  const parsed = JSON.parse(raw) as {
    summary?: string;
    profile?: Partial<AiClientProfile>;
    questions?: string[];
  };

  return {
    summary: parsed.summary ?? "",
    profile: {
      brandVoice: parsed.profile?.brandVoice ?? "",
      audiences: (parsed.profile?.audiences ?? []).filter(Boolean).slice(0, 7),
      products: (parsed.profile?.products ?? []).filter(Boolean).slice(0, 7),
      positioning: parsed.profile?.positioning ?? "",
      constraints: (parsed.profile?.constraints ?? []).filter(Boolean).slice(0, 7),
      contentAngles: (parsed.profile?.contentAngles ?? []).filter(Boolean).slice(0, 7),
      commercialMoments: (parsed.profile?.commercialMoments ?? []).filter(Boolean).slice(0, 7),
      missingInfo: (parsed.profile?.missingInfo ?? []).filter(Boolean).slice(0, 7),
    } satisfies AiClientProfile,
    questions: (parsed.questions ?? []).filter(Boolean).slice(0, 7),
  };
}
