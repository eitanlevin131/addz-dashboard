import { accountDate, reportDateInstant } from "./report-time.ts";
import { summarizeCampaignListHealth, type CampaignListHealth } from "./metrics.ts";
import type {
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  SmsCampaignReport,
} from "./types";

export type MonthlySummaryStatus = "draft" | "approved" | "sent";

export type MonthlySummaryManualInput = {
  siteRevenue: number | null;
  popupSignups: number | null;
  popupConversionRate: number | null;
  note: string;
};

export type MonthlySummaryLeader = {
  id: string;
  name: string;
  revenue: number;
  purchases: number;
  conversionRate: number | null;
};

export type MonthlySummaryChannel = {
  revenue: number;
  purchases: number;
  clicks: number;
  conversionRate: number | null;
  reportCount: number;
};

export type MonthlySummarySnapshot = {
  schemaVersion: 1;
  accountId: string;
  clientId: string;
  accountName: string;
  currency: string;
  timezone: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  lastSyncAt: string;
  totals: {
    attributedRevenue: number;
    campaignRevenue: number;
    automationRevenue: number;
    purchases: number;
    siteRevenue: number | null;
    attributedShare: number | null;
  };
  emailCampaigns: MonthlySummaryChannel;
  smsCampaigns: MonthlySummaryChannel & { remainingAverageRevenue: number | null };
  automations: MonthlySummaryChannel;
  leaders: {
    emailCampaigns: MonthlySummaryLeader[];
    smsCampaigns: MonthlySummaryLeader[];
    automations: MonthlySummaryLeader[];
  };
  popup: {
    signups: number | null;
    conversionRate: number | null;
  };
  listHealth?: {
    total: CampaignListHealth;
    email: CampaignListHealth;
    sms: CampaignListHealth;
    previousMonthRate: number | null;
    rateChange: number | null;
  };
  previousMonth: {
    month: string;
    attributedRevenue: number;
    revenueChange: number | null;
  } | null;
  completeness: {
    ready: boolean;
    missing: string[];
    warnings: string[];
  };
  source: {
    emailReports: number;
    smsReports: number;
    automationReports: number;
    attributionNote: string;
  };
};

type BuildMonthlySummaryInput = {
  clientId: string;
  account: FlashyAccount;
  month: string;
  manual: MonthlySummaryManualInput;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  generatedAt?: Date;
};

const hebrewMonths = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sum<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function percentChange(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : null;
}

export function monthlyPeriod(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("חודש הסיכום אינו תקין.");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${hebrewMonths[monthNumber - 1]} ${year}`;
}

function isInMonth(value: string, month: string, timezone: string) {
  const instant = new Date(reportDateInstant(value, timezone));
  return Number.isFinite(instant.getTime()) && accountDate(instant, timezone).startsWith(month);
}

function campaignChannel(reports: Array<EmailCampaignReport | SmsCampaignReport>): MonthlySummaryChannel {
  const purchases = sum(reports, (report) => report.purchases);
  const clicks = sum(reports, (report) => report.uniqueClicks || report.totalClicks);
  return {
    revenue: sum(reports, (report) => report.revenueGenerated),
    purchases,
    clicks,
    conversionRate: rate(purchases, clicks),
    reportCount: reports.length,
  };
}

function campaignLeaders(reports: Array<EmailCampaignReport | SmsCampaignReport>, limit: number) {
  return [...reports]
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated)
    .slice(0, limit)
    .map((report): MonthlySummaryLeader => {
      const clicks = report.uniqueClicks || report.totalClicks;
      return {
        id: String(report.campaignId),
        name: report.campaignName || "קמפיין ללא שם",
        revenue: report.revenueGenerated,
        purchases: report.purchases,
        conversionRate: rate(report.purchases, clicks),
      };
    });
}

function groupedAutomations(reports: AutomationReport[]) {
  const groups = new Map<number, MonthlySummaryLeader & { clicks: number; reportCount: number }>();
  for (const report of reports) {
    const current = groups.get(report.automationId) ?? {
      id: String(report.automationId),
      name: report.automationName || "אוטומציה ללא שם",
      revenue: 0,
      purchases: 0,
      clicks: 0,
      conversionRate: null,
      reportCount: 0,
    };
    current.name = report.automationName || current.name;
    current.revenue += report.revenueGenerated;
    current.purchases += report.purchases;
    current.clicks += report.totalClicks;
    current.reportCount += 1;
    current.conversionRate = rate(current.purchases, current.clicks);
    groups.set(report.automationId, current);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

function summaryRevenue(
  month: string,
  timezone: string,
  emails: EmailCampaignReport[],
  sms: SmsCampaignReport[],
  automations: AutomationReport[],
) {
  return sum(emails.filter((item) => isInMonth(item.sentAt, month, timezone)), (item) => item.revenueGenerated)
    + sum(sms.filter((item) => isInMonth(item.sentAt, month, timezone)), (item) => item.revenueGenerated)
    + sum(automations.filter((item) => isInMonth(item.date, month, timezone)), (item) => item.revenueGenerated);
}

export function buildMonthlySummary(input: BuildMonthlySummaryInput): MonthlySummarySnapshot {
  const { account, month } = input;
  const period = monthlyPeriod(month);
  const monthEmails = input.emails.filter((item) => isInMonth(item.sentAt, month, account.timezone));
  const monthSms = input.sms.filter((item) => isInMonth(item.sentAt, month, account.timezone));
  const monthAutomations = input.automations.filter((item) => isInMonth(item.date, month, account.timezone));
  const emailCampaigns = campaignChannel(monthEmails);
  const smsBase = campaignChannel(monthSms);
  const automationGroups = groupedAutomations(monthAutomations);
  const automationPurchases = sum(automationGroups, (item) => item.purchases);
  const automationClicks = sum(automationGroups, (item) => item.clicks);
  const automationRevenue = sum(automationGroups, (item) => item.revenue);
  const campaignRevenue = emailCampaigns.revenue + smsBase.revenue;
  const attributedRevenue = campaignRevenue + automationRevenue;
  const siteRevenue = finite(input.manual.siteRevenue);
  const smsLeaders = campaignLeaders(monthSms, 3);
  const remainingSms = [...monthSms].sort((a, b) => b.revenueGenerated - a.revenueGenerated).slice(1);
  const priorMonth = previousMonth(month);
  const listHealth = summarizeCampaignListHealth([...monthEmails, ...monthSms]);
  const emailListHealth = summarizeCampaignListHealth(monthEmails);
  const smsListHealth = summarizeCampaignListHealth(monthSms);
  const previousListHealth = summarizeCampaignListHealth([
    ...input.emails.filter((item) => isInMonth(item.sentAt, priorMonth, account.timezone)),
    ...input.sms.filter((item) => isInMonth(item.sentAt, priorMonth, account.timezone)),
  ]);
  const previousAttributedRevenue = summaryRevenue(
    priorMonth,
    account.timezone,
    input.emails,
    input.sms,
    input.automations,
  );
  const missing = [
    siteRevenue === null ? "מחזור אתר" : null,
    finite(input.manual.popupSignups) === null ? "נרשמי Popup" : null,
    finite(input.manual.popupConversionRate) === null ? "המרת Popup" : null,
  ].filter((item): item is string => Boolean(item));
  const reportCount = monthEmails.length + monthSms.length + monthAutomations.length;
  const warnings = [
    reportCount === 0 ? "לא נמצאה פעילות Flashy בחודש שנבחר." : null,
    account.syncStatus === "failed" ? "סנכרון Flashy האחרון נכשל." : null,
    account.syncStatus === "stale" ? "נתוני Flashy אינם עדכניים." : null,
  ].filter((item): item is string => Boolean(item));

  return {
    schemaVersion: 1,
    accountId: account.id,
    clientId: input.clientId,
    accountName: account.name,
    currency: account.currency,
    timezone: account.timezone,
    month,
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    lastSyncAt: account.lastSyncAt,
    totals: {
      attributedRevenue,
      campaignRevenue,
      automationRevenue,
      purchases: emailCampaigns.purchases + smsBase.purchases + automationPurchases,
      siteRevenue,
      attributedShare: siteRevenue && siteRevenue > 0 ? attributedRevenue / siteRevenue : null,
    },
    emailCampaigns,
    smsCampaigns: {
      ...smsBase,
      remainingAverageRevenue: remainingSms.length
        ? sum(remainingSms, (item) => item.revenueGenerated) / remainingSms.length
        : null,
    },
    automations: {
      revenue: automationRevenue,
      purchases: automationPurchases,
      clicks: automationClicks,
      conversionRate: rate(automationPurchases, automationClicks),
      reportCount: automationGroups.length,
    },
    leaders: {
      emailCampaigns: campaignLeaders(monthEmails, 3),
      smsCampaigns: smsLeaders,
      automations: automationGroups.slice(0, 4).map((item) => ({
        id: item.id,
        name: item.name,
        revenue: item.revenue,
        purchases: item.purchases,
        conversionRate: item.conversionRate,
      })),
    },
    popup: {
      signups: finite(input.manual.popupSignups),
      conversionRate: finite(input.manual.popupConversionRate),
    },
    listHealth: {
      total: listHealth,
      email: emailListHealth,
      sms: smsListHealth,
      previousMonthRate: previousListHealth.unsubscribeRate,
      rateChange: listHealth.unsubscribeRate !== null && previousListHealth.unsubscribeRate !== null
        ? listHealth.unsubscribeRate - previousListHealth.unsubscribeRate
        : null,
    },
    previousMonth: {
      month: priorMonth,
      attributedRevenue: previousAttributedRevenue,
      revenueChange: percentChange(attributedRevenue, previousAttributedRevenue),
    },
    completeness: {
      ready: warnings.length === 0,
      missing,
      warnings,
    },
    source: {
      emailReports: monthEmails.length,
      smsReports: monthSms.length,
      automationReports: monthAutomations.length,
      attributionNote: "קמפיינים משויכים לפי מועד השליחה וחלון הייחוס של Flashy; אוטומציות לפי רשומות הדוח בחודש.",
    },
  };
}

function money(value: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(value);
}

function percent(value: number | null) {
  return value === null ? "לא זמין" : new Intl.NumberFormat("he-IL", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildMonthlyWhatsappText(snapshot: MonthlySummarySnapshot, shareUrl?: string) {
  const lines: string[] = [`*סיכום חודש ${monthLabel(snapshot.month)}*`, ""];
  const share = snapshot.totals.attributedShare === null
    ? ""
    : ` שהם ${percent(snapshot.totals.attributedShare)} מהמחזור הכללי באתר`;
  lines.push(`*סה״כ הכנסות שיוחסו לפעילות Flashy החודש > ${money(snapshot.totals.attributedRevenue, snapshot.currency)}${share}*`, "");

  if (snapshot.emailCampaigns.reportCount > 0) {
    lines.push(
      "הכנסות מקמפיינים במייל:",
      `${money(snapshot.emailCampaigns.revenue, snapshot.currency)} | המרה מקליק: ${percent(snapshot.emailCampaigns.conversionRate)} | מכירות: ${number(snapshot.emailCampaigns.purchases)}`,
      "",
      "המיילים המובילים החודש:",
      ...snapshot.leaders.emailCampaigns.map((item, index) => `${index === 0 ? "" : "ואחריו "}${item.name} שהכניס ${money(item.revenue, snapshot.currency)}`),
      "",
    );
  }

  if (snapshot.smsCampaigns.reportCount > 0) {
    lines.push(
      "הכנסות מקמפיינים ב־SMS:",
      `${money(snapshot.smsCampaigns.revenue, snapshot.currency)} | המרה מקליק: ${percent(snapshot.smsCampaigns.conversionRate)} | מכירות: ${number(snapshot.smsCampaigns.purchases)}`,
      "",
      "ה־SMS המוביל החודש:",
      `${snapshot.leaders.smsCampaigns[0]?.name ?? "—"} שהכניס ${money(snapshot.leaders.smsCampaigns[0]?.revenue ?? 0, snapshot.currency)}`,
    );
    if (snapshot.smsCampaigns.remainingAverageRevenue !== null) {
      lines.push(`שאר הודעות ה־SMS הכניסו בממוצע ${money(snapshot.smsCampaigns.remainingAverageRevenue, snapshot.currency)}`);
    }
    lines.push("");
  }

  lines.push(`*סה״כ הכנסות מקמפיינים Email ו־SMS > ${money(snapshot.totals.campaignRevenue, snapshot.currency)}*`, "");

  if (snapshot.automations.reportCount > 0) {
    lines.push(
      "הכנסות מאוטומציות:",
      `${money(snapshot.automations.revenue, snapshot.currency)} | המרה מקליק: ${percent(snapshot.automations.conversionRate)} | מכירות: ${number(snapshot.automations.purchases)}`,
      "",
      "האוטומציות המכניסות ביותר:",
      ...snapshot.leaders.automations.map((item) => `${item.name} עם ${money(item.revenue, snapshot.currency)}`),
      "",
    );
  }

  if (snapshot.popup.signups !== null || snapshot.popup.conversionRate !== null) {
    const popupParts = [
      snapshot.popup.signups === null ? null : `${number(snapshot.popup.signups)} נרשמים חדשים`,
      snapshot.popup.conversionRate === null ? null : `${percent(snapshot.popup.conversionRate)} המרה`,
    ].filter(Boolean);
    lines.push("פופ אפ:", popupParts.join(" ב־"), "");
  }

  if (snapshot.listHealth && snapshot.listHealth.total.recipients > 0) {
    lines.push(
      "בריאות הרשימה:",
      `${number(snapshot.listHealth.total.unsubscribed)} הסרות · ${percent(snapshot.listHealth.total.unsubscribeRate)} מהנמענים בקמפיינים`,
      "",
    );
  }

  if (shareUrl) lines.push("לצפייה בסיכום המלא והאינטראקטיבי:", shareUrl);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function withoutMonthlySummaryShareLink(text: string) {
  return text.replace(/\n*לצפייה בסיכום המלא והאינטראקטיבי:\nhttps?:\/\/\S+\s*$/u, "").trim();
}

export function withMonthlySummaryShareLink(text: string, shareUrl: string) {
  return `${withoutMonthlySummaryShareLink(text)}\n\nלצפייה בסיכום המלא והאינטראקטיבי:\n${shareUrl}`;
}

export function monthlyCopyNumbers(text: string) {
  return (text.match(/\d[\d,.\u00a0]*/g) ?? [])
    .map((value) => value.replace(/[\s\u00a0,]/g, ""))
    .sort();
}

export function preservesMonthlyCopyNumbers(original: string, candidate: string) {
  return JSON.stringify(monthlyCopyNumbers(original)) === JSON.stringify(monthlyCopyNumbers(candidate));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export function buildMonthlySummaryEmailHtml(snapshot: MonthlySummarySnapshot, shareUrl: string, note = "") {
  const rows = [
    ["קמפיינים במייל", snapshot.emailCampaigns.revenue, snapshot.emailCampaigns.purchases],
    ["קמפיינים ב־SMS", snapshot.smsCampaigns.revenue, snapshot.smsCampaigns.purchases],
    ["אוטומציות", snapshot.automations.revenue, snapshot.automations.purchases],
  ] as const;
  const listHealth = snapshot.listHealth && snapshot.listHealth.total.recipients > 0
    ? `<div style="margin-top:18px;padding:14px 16px;background:#f7f9fa;border-right:3px solid #20b9a8"><strong>בריאות הרשימה</strong><div style="margin-top:5px;color:#667085">${number(snapshot.listHealth.total.unsubscribed)} הסרות · ${escapeHtml(percent(snapshot.listHealth.total.unsubscribeRate))} מהנמענים בקמפיינים</div></div>`
    : "";
  return `<div dir="rtl" style="margin:0;background:#f5f7f8;padding:32px 16px;font-family:Arial,sans-serif;color:#080123"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e4e7ec;border-radius:10px;overflow:hidden"><div style="background:#080123;color:#fff;padding:22px 28px"><strong style="font-size:24px">addz <span style="color:#FFE045">Growth OS</span></strong><div style="margin-top:6px;color:#c8c4d3">סיכום ${escapeHtml(monthLabel(snapshot.month))}</div></div><div style="padding:28px"><h1 style="margin:0;font-size:28px">${escapeHtml(snapshot.accountName)}</h1>${note ? `<p style="line-height:1.7;color:#475467">${escapeHtml(note)}</p>` : ""}<div style="margin:24px 0;padding:20px;background:#fff9d8;border-right:4px solid #FFE045"><div style="font-size:13px;color:#667085">סה״כ הכנסה מיוחסת לפעילות Flashy</div><strong style="display:block;margin-top:6px;font-size:34px">${escapeHtml(money(snapshot.totals.attributedRevenue, snapshot.currency))}</strong>${snapshot.totals.attributedShare === null ? "" : `<span style="color:#667085">${escapeHtml(percent(snapshot.totals.attributedShare))} ממחזור האתר</span>`}</div><table style="width:100%;border-collapse:collapse">${rows.map(([label, revenue, purchases]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e4e7ec">${escapeHtml(label)}</td><td dir="ltr" style="padding:12px 0;border-bottom:1px solid #e4e7ec;text-align:left;font-weight:700">${escapeHtml(money(revenue, snapshot.currency))}</td><td style="padding:12px 12px;border-bottom:1px solid #e4e7ec;color:#667085">${number(purchases)} מכירות</td></tr>`).join("")}</table>${listHealth}<a href="${escapeHtml(shareUrl)}" style="display:block;margin-top:28px;padding:14px 20px;background:#FFE045;color:#080123;text-decoration:none;text-align:center;font-weight:700;border-radius:6px">לצפייה בסיכום האינטראקטיבי</a><p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#667085">${escapeHtml(snapshot.source.attributionNote)}</p></div></div></div>`;
}
