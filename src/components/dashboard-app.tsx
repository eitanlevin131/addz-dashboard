"use client";

import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  LineChart,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  automationReports,
  clients,
  emailReports,
  flashyAccounts,
  newsletterPlans,
  smsReports,
} from "@/lib/demo-data";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getAutomationSmsRecipients,
  summarizeAccount,
  summarizeSms,
} from "@/lib/metrics";
import {
  answerFromData,
  buildAccountHealth,
  buildAiContextPack,
  buildNextBestSend,
  buildOpportunityEngine,
  ruleBasedInsights,
  type AccountHealth,
  type AiAccountMemory,
  type AiActionRecommendation,
  type AiOpportunity,
  type NextBestSend,
} from "@/lib/ai";
import {
  normalizeAutomationReports,
  normalizeEmailReports,
  normalizeSmsReports,
  type RawFlashyRow,
} from "@/lib/flashy-normalize";
import type {
  AutomationReport,
  AiInsight,
  CampaignKind,
  Channel,
  Client,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  ModuleKey,
  NewsletterPlan,
  PlanStatus,
  SmsCampaignReport,
} from "@/lib/types";

type ViewKey =
  | "overview"
  | "sms"
  | "automations"
  | "campaigns"
  | "planner"
  | "ai"
  | "settings"
  | "admin";
type TimeRangeKey = "7d" | "14d" | "30d" | "custom" | "all";
type AutomationFilterKey = "all" | "email" | "sms" | "mixed";
type OverviewChannelFilter = "all" | "email" | "sms" | "automation";
type ActivityKindFilter = "all" | "campaign" | "automation";
type ActivityMediumFilter = "all" | "email" | "sms";
type HolidayRegion = "IL" | "US";
type SyncedHoliday = {
  date: string;
  name: string;
  region: HolidayRegion;
  source: "Hebcal" | "Nager.Date" | "local";
};

function LoginGate({ message }: { message: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setState("שולח קישור כניסה...");
    const result = await signIn("email", {
      email: email.trim(),
      redirect: false,
      callbackUrl: "/",
    });

    if (result?.error) {
      setState("השליחה נכשלה. בדוק שהוגדר RESEND_API_KEY ושהדומיין מאושר לשליחה.");
      return;
    }

    setState("נשלח קישור כניסה למייל. אחרי הכניסה הנתונים החיים ייטענו אוטומטית.");
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[oklch(9%_0.05_285)] px-4 text-white"
    >
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-6 text-[#080123] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#65738a]">Flashy Growth Desk</p>
            <h1 className="mt-1 text-3xl font-black tracking-normal">כניסה לנתונים חיים</h1>
          </div>
          <div className="grid size-12 place-items-center rounded-2xl bg-[#35dacd] text-lg font-black">
            FG
          </div>
        </div>

        <p className="mb-5 rounded-2xl border border-[#dfe7ee] bg-[#f7fafc] p-4 text-sm leading-6 text-[#4a5870]">
          {message || "צריך להתחבר כדי לראות את נתוני הלקוחות החיים."}
        </p>

        <form onSubmit={submitLogin} className="space-y-3">
          <label className="block text-sm font-bold text-[#263548]">
            אימייל
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@addz.digital"
              className="mt-2 h-12 w-full rounded-xl border border-[#dfe7ee] px-4 text-left text-base outline-none transition focus:border-[#35dacd]"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            className="h-12 w-full rounded-xl bg-[#080123] text-base font-black text-white transition hover:bg-[#15102c]"
          >
            שלח קישור כניסה
          </button>
        </form>

        {state && <p className="mt-4 text-sm leading-6 text-[#4a5870]">{state}</p>}
      </section>
    </div>
  );
}

const views: { key: ViewKey; label: string; icon: typeof Activity; module?: ModuleKey }[] = [
  { key: "overview", label: "כללי", icon: LineChart, module: "reports" },
  { key: "sms", label: "SMS", icon: MessageSquareText, module: "reports" },
  { key: "automations", label: "אוטומציות", icon: RefreshCw, module: "reports" },
  { key: "campaigns", label: "קמפיינים", icon: Send, module: "reports" },
  { key: "planner", label: "גאנט חודשי", icon: CalendarDays, module: "planner" },
  { key: "ai", label: "AI", icon: Bot, module: "ai" },
  { key: "settings", label: "הגדרות", icon: Settings },
  { key: "admin", label: "אדמין", icon: ShieldCheck },
];

const timeRanges: { key: TimeRangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 ימים", days: 7 },
  { key: "14d", label: "14 ימים", days: 14 },
  { key: "30d", label: "30 ימים", days: 30 },
  { key: "custom", label: "מותאם", days: null },
  { key: "all", label: "הכל", days: null },
];

const statusLabels = {
  draft: "טיוטה",
  ready: "מוכן",
  approved: "מאושר",
  sent: "נשלח",
};

const kindLabels: Record<CampaignKind, string> = {
  campaign: "קמפיין",
  automation: "אוטומציה",
};

const channelLabels: Record<Channel, string> = {
  email: "אימייל",
  sms: "SMS",
};

const automationFilterLabels: Record<AutomationFilterKey, string> = {
  all: "הכל",
  mixed: "מעורב",
  sms: "SMS",
  email: "אימייל",
};

const overviewChannelLabels: Record<OverviewChannelFilter, string> = {
  all: "הכל",
  email: "Email",
  sms: "SMS",
  automation: "אוטומציות",
};

const costViewKeys: ViewKey[] = ["overview", "sms", "automations", "campaigns"];

function formatUsdDecimal(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value);
}

function formatRoas(value: number | null | undefined) {
  return value && Number.isFinite(value) ? `${value.toFixed(1)}x` : "אין עלות";
}

function boundedPercent(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return Math.max(3, Math.min(100, (value / maxValue) * 100));
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function byAccount<T extends { accountId: string }>(items: T[], accountId: string) {
  return items.filter((item) => item.accountId === accountId);
}

function getAutomationType(report: AutomationReport): AutomationFilterKey {
  const sentEmails = report.sentEmails ?? 0;
  const sentSms = getAutomationSmsRecipients(report);

  if (sentEmails > 0 && sentSms > 0) return "mixed";
  if (sentSms > 0 || report.channel === "sms") return "sms";
  return "email";
}

function filterByTimeRange<T>(
  items: T[],
  rangeKey: TimeRangeKey,
  getDate: (item: T) => string,
  customStartDate: string,
  customEndDate: string,
) {
  const range = timeRanges.find((item) => item.key === rangeKey);
  if (rangeKey === "custom") {
    const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
    const end = customEndDate ? new Date(`${customEndDate}T23:59:59`) : null;

    return items.filter((item) => {
      const date = new Date(getDate(item));
      return (!start || date >= start) && (!end || date <= end);
    });
  }

  if (!range?.days) return items;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - range.days + 1);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return items.filter((item) => {
    const date = new Date(getDate(item));
    return date >= start && date <= end;
  });
}

function consolidateAutomations(automations: AutomationReport[]): AutomationReport[] {
  const groups = new Map<string, AutomationReport>();

  for (const automation of automations) {
    const key = `${automation.automationId}-${automation.channel}`;
    const current = groups.get(key);

    if (!current) {
      groups.set(key, { ...automation });
      continue;
    }

    groups.set(key, {
      ...current,
      date: new Date(automation.date) > new Date(current.date) ? automation.date : current.date,
      totalRecipients: current.totalRecipients + automation.totalRecipients,
      totalDelivered: current.totalDelivered + automation.totalDelivered,
      totalOpens: current.totalOpens + automation.totalOpens,
      totalClicks: current.totalClicks + automation.totalClicks,
      sentEmails: (current.sentEmails ?? 0) + (automation.sentEmails ?? 0),
      openedEmails: (current.openedEmails ?? 0) + (automation.openedEmails ?? 0),
      clickedEmails: (current.clickedEmails ?? 0) + (automation.clickedEmails ?? 0),
      sentSms: (current.sentSms ?? 0) + (automation.sentSms ?? 0),
      clickedSms: (current.clickedSms ?? 0) + (automation.clickedSms ?? 0),
      totalEntered: (current.totalEntered ?? 0) + (automation.totalEntered ?? 0),
      totalCompleted: (current.totalCompleted ?? 0) + (automation.totalCompleted ?? 0),
      failedMessages: (current.failedMessages ?? 0) + (automation.failedMessages ?? 0),
      purchases: current.purchases + automation.purchases,
      revenueGenerated: current.revenueGenerated + automation.revenueGenerated,
    });
  }

  return Array.from(groups.values()).sort((a, b) => b.revenueGenerated - a.revenueGenerated);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthBounds(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}

function isSameMonth(dateValue: string, monthValue: string) {
  return dateValue.slice(0, 7) === monthValue;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number) {
  const date = new Date(year, month, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (n - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const date = new Date(year, month + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function getHebrewDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
    day: "numeric",
    month: "long",
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? 0),
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

function getHolidaysForDate(date: Date, enabledRegions: HolidayRegion[]) {
  const dateKey = toDateInputValue(date);
  const year = date.getFullYear();
  const holidays: Array<{ name: string; region: HolidayRegion }> = [];

  if (enabledRegions.includes("US")) {
    const usDates = [
      { date: new Date(year, 0, 1), name: "New Year" },
      { date: nthWeekdayOfMonth(year, 0, 1, 3), name: "MLK Day" },
      { date: nthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents Day" },
      { date: lastWeekdayOfMonth(year, 4, 1), name: "Memorial Day" },
      { date: new Date(year, 5, 19), name: "Juneteenth" },
      { date: new Date(year, 6, 4), name: "Independence Day" },
      { date: nthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day" },
      { date: nthWeekdayOfMonth(year, 9, 1, 2), name: "Columbus Day" },
      { date: new Date(year, 10, 11), name: "Veterans Day" },
      { date: nthWeekdayOfMonth(year, 10, 4, 4), name: "Thanksgiving" },
      { date: new Date(year, 11, 25), name: "Christmas" },
    ];

    for (const holiday of usDates) {
      if (toDateInputValue(holiday.date) === dateKey) {
        holidays.push({ name: holiday.name, region: "US" });
      }
    }
  }

  if (enabledRegions.includes("IL")) {
    const hebrew = getHebrewDateParts(date);
    const isMonth = (...months: string[]) => months.some((month) => hebrew.month.includes(month));

    if (isMonth("Tishri") && [1, 2].includes(hebrew.day)) holidays.push({ name: "ראש השנה", region: "IL" });
    if (isMonth("Tishri") && hebrew.day === 10) holidays.push({ name: "יום כיפור", region: "IL" });
    if (isMonth("Tishri") && hebrew.day >= 15 && hebrew.day <= 21) holidays.push({ name: "סוכות", region: "IL" });
    if (isMonth("Tishri") && hebrew.day === 22) holidays.push({ name: "שמחת תורה", region: "IL" });
    if (isMonth("Kislev") && hebrew.day >= 25) holidays.push({ name: "חנוכה", region: "IL" });
    if (isMonth("Tevet") && hebrew.day <= 2) holidays.push({ name: "חנוכה", region: "IL" });
    if (isMonth("Shevat") && hebrew.day === 15) holidays.push({ name: "ט״ו בשבט", region: "IL" });
    if (isMonth("Adar") && hebrew.day === 14) holidays.push({ name: "פורים", region: "IL" });
    if (isMonth("Nisan") && hebrew.day >= 15 && hebrew.day <= 21) holidays.push({ name: "פסח", region: "IL" });
    if (isMonth("Iyar") && hebrew.day === 5) holidays.push({ name: "יום העצמאות", region: "IL" });
    if (isMonth("Sivan") && hebrew.day === 6) holidays.push({ name: "שבועות", region: "IL" });
    if (isMonth("Av") && hebrew.day === 9) holidays.push({ name: "תשעה באב", region: "IL" });
  }

  return holidays;
}

type LiveFlashyPayload = {
  hasWarnings?: boolean;
  account: {
    id: number;
    account?: string;
    name?: string;
    website?: string;
    credits?: string;
    timezone?: string;
    currency?: string;
  };
  reports: {
    emails: RawFlashyRow[];
    sms: RawFlashyRow[];
    automations: RawFlashyRow[];
  };
};

type DashboardDataPayload = {
  clients: Client[];
  accounts: FlashyAccount[];
  emailReports: EmailCampaignReport[];
  smsReports: SmsCampaignReport[];
  automationReports: AutomationReport[];
  newsletterPlans: NewsletterPlan[];
};

function MetricCard({
  title,
  value,
  caption,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  caption: string;
  icon: typeof Activity;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <article className="min-w-0 rounded-xl border border-[oklch(89%_0.008_285)] bg-white p-4 text-[oklch(15%_0.025_285)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-[oklch(48%_0.018_285)]">{title}</p>
          <p className="mt-2 text-[clamp(26px,2.7vw,36px)] font-bold leading-none tabular-nums">{value}</p>
        </div>
        <div
          className={classNames(
            "grid size-9 place-items-center rounded-lg border",
            tone === "good" && "border-[#b8fff3] bg-[#e8fbf8] text-[#008f82]",
            tone === "warn" && "border-[#fde68a] bg-[#fff4db] text-[#b45309]",
            tone === "neutral" && "border-[#dfe7ee] bg-[#eef3f7] text-[#263548]",
          )}
        >
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 inline-flex rounded-full bg-[oklch(66%_0.16_150_/_0.13)] px-2 py-1 text-[11px] text-[oklch(43%_0.13_150)]">
        {caption}
      </p>
    </article>
  );
}

function DecisionPanel({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }[];
}) {
  return (
    <section className="rounded-xl border border-[#dfe7ee] bg-white p-4 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-[#080123]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-[#65738a]">{subtitle}</p>}
      </div>
      <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-[#eef3f7] bg-[#fbfcfc] p-3">
            <p className="text-xs font-bold text-[#65738a]">{item.label}</p>
            <p
              className={classNames(
                "mt-1 text-base font-bold leading-tight",
                item.tone === "good" && "text-[#007d72]",
                item.tone === "warn" && "text-[#9a3412]",
                (!item.tone || item.tone === "neutral") && "text-[#080123]",
              )}
            >
              {item.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#40506a]">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RankedInsightList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; meta: string }[];
}) {
  return (
    <article className="rounded-xl border border-[#dfe7ee] bg-white p-4 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
      <h2 className="text-lg font-bold text-[#080123]">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid grid-cols-[32px_1fr] gap-3 rounded-lg bg-[#f7faf9] p-3">
              <div className="grid size-8 place-items-center rounded-full bg-[#080123] text-sm font-bold text-white">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-bold text-[#080123]">{item.label}</p>
                  <span className="shrink-0 text-sm font-black text-[#007d72]">{item.value}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#65738a]">{item.meta}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg bg-[#f7faf9] p-4 text-sm text-[#65738a]">אין מספיק נתונים בטווח הזה.</div>
        )}
      </div>
    </article>
  );
}

type PerformanceItem = {
  id: string;
  date: string;
  name: string;
  channel: "אימייל" | "SMS" | "אוטומציות";
  kind: "campaign" | "automation";
  medium: "email" | "sms";
  revenue: number;
  cost: number;
  purchases: number;
  clicks: number;
  opens: number;
  recipients: number;
  engagementRate: number;
};

function KPIGrid({ account, summary }: { account: FlashyAccount; summary: MetricSummary }) {
  const totalCost = summary.smsCost + summary.fixedCosts;
  const profitTone = summary.profit >= 0 ? "text-[#007d72]" : "text-[#9a3412]";
  const secondaryMetrics = [
    {
      label: "ROAS",
      value: formatRoas(summary.roas),
      detail: "כולל SMS ועלויות קבועות",
      icon: LineChart,
      tone: "good" as const,
    },
    {
      label: "עלות כוללת",
      value: formatCurrency(totalCost, account.currency),
      detail: `SMS ${formatCurrency(summary.smsCost, account.currency)}`,
      icon: Activity,
      tone: totalCost > 0 ? "warn" as const : "neutral" as const,
    },
    {
      label: "רכישות",
      value: formatNumber(summary.purchases),
      detail: `Conversion ${formatPercent(summary.conversionRate)}`,
      icon: CheckCircle2,
      tone: "neutral" as const,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-[oklch(100%_0_0_/_0.14)] bg-white text-[#080123] shadow-[0_16px_45px_rgba(8,1,35,0.12)]">
      <div className="grid gap-px bg-[#dfe7ee] xl:grid-cols-[1fr_1.15fr]">
        <div className="bg-[linear-gradient(135deg,#ffffff_0%,#edfffb_100%)] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-[#65738a]">הכנסות מיוחסות</p>
              <h2 className="mt-2 text-[clamp(34px,4.2vw,56px)] font-black leading-none tracking-normal">
                {formatCurrency(summary.revenue, account.currency)}
              </h2>
            </div>
            <div className="rounded-xl border border-[#cfeee9] bg-white/70 px-4 py-3 text-left">
              <p className="text-xs font-bold text-[#65738a]">רווח אחרי עלויות</p>
              <p className={classNames("mt-1 text-2xl font-black tabular-nums", profitTone)}>
                {formatCurrency(summary.profit, account.currency)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs font-bold text-[#65738a]">נמענים</p>
              <p className="mt-1 text-lg font-black">{formatNumber(summary.recipients)}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs font-bold text-[#65738a]">קליקים</p>
              <p className="mt-1 text-lg font-black">{formatNumber(summary.clicks)}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs font-bold text-[#65738a]">נמסרו</p>
              <p className="mt-1 text-lg font-black">{formatNumber(summary.delivered)}</p>
            </div>
          </div>
        </div>
        <div className="grid bg-white sm:grid-cols-3">
          {secondaryMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="border-b border-[#eef3f7] p-4 last:border-b-0 sm:border-b-0 sm:border-l">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#65738a]">{metric.label}</p>
                    <p className="mt-2 text-[clamp(22px,2.6vw,32px)] font-black leading-none tabular-nums">
                      {metric.value}
                    </p>
                  </div>
                  <div
                    className={classNames(
                      "grid size-9 place-items-center rounded-xl border",
                      metric.tone === "good" && "border-[#b8fff3] bg-[#e8fbf8] text-[#008f82]",
                      metric.tone === "warn" && "border-[#fde68a] bg-[#fff4db] text-[#b45309]",
                      metric.tone === "neutral" && "border-[#dfe7ee] bg-[#eef3f7] text-[#263548]",
                    )}
                  >
                    <Icon size={17} />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#65738a]">{metric.detail}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RevenueCostChart({
  account,
  items,
}: {
  account: FlashyAccount;
  items: PerformanceItem[];
}) {
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");
  const [mediumFilter, setMediumFilter] = useState<ActivityMediumFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const filteredItems = items.filter((item) => {
    const kindMatches = kindFilter === "all" || item.kind === kindFilter;
    const mediumMatches = mediumFilter === "all" || item.medium === mediumFilter;
    return kindMatches && mediumMatches;
  });
  const sortedItems = [...filteredItems].sort(
    (a, b) => b.revenue - a.revenue || b.purchases - a.purchases || b.engagementRate - a.engagementRate,
  );
  const visibleItems = sortedItems.slice(0, expanded ? sortedItems.length : 4);
  const maxRevenue = Math.max(1, ...visibleItems.map((item) => item.revenue));
  const totalRevenue = filteredItems.reduce((total, item) => total + item.revenue, 0);
  const totalPurchases = filteredItems.reduce((total, item) => total + item.purchases, 0);
  const totalSmsCost = filteredItems.reduce((total, item) => total + (item.medium === "sms" ? item.cost : 0), 0);
  const emailItems = filteredItems.filter((item) => item.medium === "email");
  const averageEmailEngagement = emailItems.length
    ? emailItems.reduce((total, item) => total + item.engagementRate, 0) / emailItems.length
    : 0;
  const kindOptions: { key: ActivityKindFilter; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "campaign", label: "קמפיינים" },
    { key: "automation", label: "אוטומציות" },
  ];
  const mediumOptions: { key: ActivityMediumFilter; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "email", label: "Email" },
    { key: "sms", label: "SMS" },
  ];

  return (
    <article className="col-span-12 rounded-2xl border border-[oklch(89%_0.008_285)] bg-white p-[18px] text-[oklch(15%_0.025_285)] shadow-[0_10px_30px_rgba(8,1,35,0.05)] xl:col-span-8">
      <div className="mb-[18px] flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="m-0 text-[22px] font-bold">פעילויות מובילות</h2>
          <p className="mt-1 text-sm text-[oklch(48%_0.018_285)]">
            דירוג נקי של הקמפיינים והאוטומציות לפי הכנסה, עם המדד הנכון לכל ערוץ.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[330px]">
          <div className="rounded-xl bg-[#f4f7f6] px-3 py-2">
            <div className="text-[oklch(48%_0.018_285)]">הכנסה</div>
            <div className="mt-1 font-bold">{formatCurrency(totalRevenue, account.currency)}</div>
          </div>
          <div className="rounded-xl bg-[#f4f7f6] px-3 py-2">
            <div className="text-[oklch(48%_0.018_285)]">רכישות</div>
            <div className="mt-1 font-bold">{formatNumber(totalPurchases)}</div>
          </div>
          <div className="rounded-xl bg-[#f4f7f6] px-3 py-2">
            <div className="text-[oklch(48%_0.018_285)]">{mediumFilter === "email" ? "מעורבות" : "עלות SMS"}</div>
            <div className="mt-1 font-bold">
              {mediumFilter === "email" ? formatPercent(averageEmailEngagement) : formatCurrency(totalSmsCost, account.currency)}
            </div>
          </div>
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {kindOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setKindFilter(option.key);
                setExpanded(false);
              }}
              className={classNames(
                "rounded-full border px-3 py-2 text-sm transition",
                kindFilter === option.key
                  ? "border-transparent bg-[oklch(15%_0.025_285)] text-white"
                  : "border-[oklch(89%_0.008_285)] bg-white text-[oklch(48%_0.018_285)] hover:text-[oklch(15%_0.025_285)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {mediumOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setMediumFilter(option.key);
                setExpanded(false);
              }}
              className={classNames(
                "rounded-full border px-3 py-2 text-sm transition",
                mediumFilter === option.key
                  ? "border-transparent bg-[oklch(82%_0.135_185)] font-bold text-[oklch(15%_0.025_285)]"
                  : "border-[oklch(89%_0.008_285)] bg-white text-[oklch(48%_0.018_285)] hover:text-[oklch(15%_0.025_285)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {visibleItems.length ? (
        <div className="overflow-hidden rounded-xl border border-[oklch(89%_0.008_285)]">
          <div className="hidden grid-cols-[44px_1fr_128px_150px_120px] gap-3 bg-[#f4f7f6] px-4 py-3 text-xs font-bold text-[oklch(48%_0.018_285)] md:grid">
            <span>דירוג</span>
            <span>פעילות</span>
            <span className="text-left">הכנסה</span>
            <span className="text-left">מדד מרכזי</span>
            <span className="text-left">נפח</span>
          </div>
          <div className="divide-y divide-[oklch(89%_0.008_285)]">
            {visibleItems.map((item, index) => (
              <div
                key={item.id}
                className={classNames(
                  "grid gap-3 px-4 py-4 md:grid-cols-[44px_1fr_128px_150px_120px] md:items-center",
                  index === 0 && "bg-[oklch(82%_0.135_185_/_0.12)]",
                )}
              >
                <div className="flex items-center justify-between md:block">
                  <span className="grid size-8 place-items-center rounded-full bg-[oklch(15%_0.025_285)] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-xs font-bold text-[oklch(48%_0.018_285)] md:hidden">
                    {item.medium === "sms" ? "SMS" : "Email"}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-bold md:text-base">{item.name}</p>
                    <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[11px] font-bold text-[oklch(48%_0.018_285)]">
                      {item.kind === "campaign" ? "קמפיין" : "אוטומציה"}
                    </span>
                    <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[11px] font-bold text-[oklch(48%_0.018_285)]">
                      {item.medium === "email" ? "Email" : "SMS"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[oklch(91%_0.008_285)]">
                    <div
                      className="h-full rounded-full bg-[oklch(82%_0.135_185)]"
                      style={{ width: `${boundedPercent(item.revenue, maxRevenue)}%` }}
                    />
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-base font-bold">{formatCurrency(item.revenue, account.currency)}</div>
                  <div className="text-xs text-[oklch(48%_0.018_285)]">{formatNumber(item.purchases)} רכישות</div>
                </div>
                <div className="text-left">
                  <div className="text-base font-bold">
                    {item.medium === "sms"
                      ? item.cost > 0
                        ? formatRoas(item.revenue / item.cost)
                        : "ROAS —"
                      : formatPercent(item.engagementRate)}
                  </div>
                  <div className="text-xs text-[oklch(48%_0.018_285)]">
                    {item.medium === "sms"
                      ? item.cost > 0
                        ? `עלות ${formatCurrency(item.cost, account.currency)}`
                        : "אין עלות SMS"
                      : `${formatNumber(item.opens)} פתיחות / ${formatNumber(item.clicks)} קליקים`}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-base font-bold">{formatNumber(item.recipients)}</div>
                  <div className="text-xs text-[oklch(48%_0.018_285)]">נמענים</div>
                </div>
              </div>
            ))}
          </div>
          {sortedItems.length > 4 && (
            <button
              onClick={() => setExpanded((current) => !current)}
              className="min-h-11 w-full bg-[#f4f7f6] px-4 text-sm font-bold text-[oklch(15%_0.025_285)] transition hover:bg-[oklch(82%_0.135_185_/_0.18)]"
            >
              {expanded ? "הצג פחות" : `הצג הכל (${formatNumber(sortedItems.length)})`}
            </button>
          )}
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-xl bg-[#f4f7f6] text-sm text-[#65738a]">—</div>
      )}
    </article>
  );
}

function ChannelBreakdown({
  account,
  channelData,
}: {
  account: FlashyAccount;
  channelData: {
    channel: string;
    revenue: number;
    cost: number;
    profit: number;
    count: number;
    recipients: number;
    roas: number | null;
    revenuePerRecipient: number;
    share: number;
  }[];
}) {
  return (
    <article className="col-span-12 rounded-2xl border border-[oklch(89%_0.008_285)] bg-white p-[18px] text-[oklch(15%_0.025_285)] xl:col-span-4">
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] font-bold">חלוקת ערוצים</h2>
        <span className="text-[13px] text-[oklch(48%_0.018_285)]">הכנסה</span>
      </div>
      <div className="grid gap-3">
        {channelData.map((item) => (
          <div key={item.channel} className="grid grid-cols-[74px_1fr_58px] items-center gap-2 text-sm">
            <strong>{item.channel}</strong>
            <div className="h-2.5 overflow-hidden rounded-full bg-[oklch(91%_0.008_285)]">
              <div
                className="h-full rounded-full bg-[oklch(82%_0.135_185)]"
                style={{ width: `${Math.max(3, item.share * 100)}%` }}
              />
            </div>
            <span>{formatPercent(item.share)}</span>
            <span className="col-start-2 col-end-4 text-xs text-[oklch(48%_0.018_285)]">
              {formatCurrency(item.revenue, account.currency)} · ROAS {formatRoas(item.roas)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function AIInsightPanel({
  bestSms,
  weakItem,
  account,
}: {
  bestSms?: PerformanceItem;
  weakItem?: PerformanceItem;
  account: FlashyAccount;
}) {
  const title = bestSms ? `להרחיב את ${bestSms.channel} בזהירות.` : "אין המלצה אוטומטית כרגע.";
  const copy = bestSms
    ? `${bestSms.name} מייצר ${formatCurrency(bestSms.revenue, account.currency)} מול ${formatCurrency(bestSms.cost, account.currency)} עלות. מומלץ לשכפל וריאציה אחת, ולבדוק את ${weakItem?.name ?? "הפריט החלש"} לפני הגדלת נפח.`
    : "ברגע שיצטבר מספיק דאטה, נציג כאן המלצת אופטימיזציה ברורה במקום טקסט גנרי.";

  return (
    <article className="col-span-12 grid gap-4 rounded-2xl border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.07)] p-[18px] text-[oklch(98%_0_0)] backdrop-blur xl:grid-cols-[1fr_300px]">
      <div>
        <span className="mb-2 block text-[13px] text-[oklch(78%_0.015_285)]">AI insight</span>
        <h2 className="m-0 text-[28px] font-bold">{title}</h2>
        <p className="mt-2 leading-7 text-[oklch(78%_0.015_285)]">{copy}</p>
      </div>
      <div className="grid content-center gap-2">
        <button className="min-h-10 rounded-lg bg-[oklch(82%_0.135_185)] px-4 py-2 font-bold text-[oklch(15%_0.025_285)]">צור משימה</button>
        <button className="min-h-10 rounded-lg border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.08)] px-4 py-2 text-white">פתח AI</button>
      </div>
    </article>
  );
}

function ClientSelector({
  clients,
  selectedClientId,
  onChange,
  mobile = false,
}: {
  clients: Client[];
  selectedClientId: string;
  onChange: (clientId: string) => void;
  mobile?: boolean;
}) {
  return (
    <div className={classNames("rounded-xl border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.06)] p-2.5", mobile && "mb-4 lg:hidden")}>
      <label className="mb-1.5 block text-[11px] text-[oklch(78%_0.015_285)]" htmlFor={mobile ? "client-select-mobile" : "client-select"}>
        לקוח פעיל
      </label>
      <div className="relative">
        <select
          id={mobile ? "client-select-mobile" : "client-select"}
          value={selectedClientId}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-9 w-full appearance-none truncate rounded-lg border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.08)] px-2.5 text-sm text-white outline-none focus:border-[oklch(82%_0.135_185)]"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id} className="text-[#111]">
              {client.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute left-2.5 top-2.5 text-white/55" size={16} />
      </div>
    </div>
  );
}

function Sidebar({
  clients,
  selectedClientId,
  visibleViews,
  view,
  account,
  dataSource,
  dataNotice,
  clientView,
  onSelectClient,
  onSelectView,
}: {
  clients: Client[];
  selectedClientId: string;
  visibleViews: typeof views;
  view: ViewKey;
  account: FlashyAccount;
  dataSource: "demo" | "neon" | "loading";
  dataNotice: string;
  clientView: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectView: (view: ViewKey) => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-3 border-l border-[oklch(100%_0_0_/_0.18)] bg-[oklch(9%_0.05_285_/_0.94)] px-3 py-4 text-white lg:flex">
      <div className="flex items-center gap-2 px-1 text-sm font-bold">
        <span className="grid size-9 place-items-center rounded-[10px] border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.06)] text-[oklch(82%_0.135_185)]">FG</span>
        <span className="truncate">Growth Desk</span>
      </div>
      <ClientSelector clients={clients} selectedClientId={selectedClientId} onChange={onSelectClient} />
      <nav className="grid gap-1" aria-label="ניווט ראשי">
        {visibleViews.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onSelectView(item.key)}
              className={classNames(
                "flex min-h-10 items-center gap-2 rounded-[10px] px-2.5 py-2 text-right text-sm font-medium transition",
                view === item.key
                  ? "bg-[oklch(100%_0_0_/_0.08)] text-white"
                  : "text-[oklch(78%_0.015_285)] hover:bg-[oklch(100%_0_0_/_0.08)] hover:text-white",
              )}
            >
              <Icon className="shrink-0" size={17} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      {!clientView && (
        <div className="rounded-xl border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.06)] p-2.5 text-xs leading-5 text-[oklch(78%_0.015_285)]">
          <div className="mb-1 font-bold text-white">עלויות חשבון</div>
          <div>SMS: {formatUsdDecimal(account.smsCreditPriceUsd)}</div>
          <div>מנוי: {formatUsdDecimal(account.monthlySubscriptionCostUsd)}</div>
          <div>ריטיינר: {formatCurrency(account.agencyRetainerCostIls, "ILS")}</div>
          <button
            onClick={() => onSelectView("settings")}
            className="mt-2 min-h-9 w-full rounded-lg bg-[oklch(82%_0.135_185)] px-3 font-bold text-[oklch(15%_0.025_285)]"
          >
            הגדרות
          </button>
        </div>
      )}
      <div className="mt-auto rounded-xl border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(100%_0_0_/_0.05)] p-2.5 text-xs leading-5 text-[oklch(78%_0.015_285)]">
        <div className="font-bold text-white">
          {dataSource === "neon" ? "Neon מחובר" : dataSource === "loading" ? "טוען נתונים" : "דמו"}
        </div>
        <div className="mt-1 line-clamp-2">{dataNotice}</div>
      </div>
    </aside>
  );
}

function Overview({
  account,
  summary,
  emails,
  sms,
  automations,
  showDeepAnalysis,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  showDeepAnalysis: boolean;
}) {
  const [channelFilter, setChannelFilter] = useState<OverviewChannelFilter>("all");
  const performanceItems: PerformanceItem[] = [
    ...emails.map((item) => ({
      id: `email-${item.id}`,
      date: item.sentAt.slice(0, 10),
      name: item.campaignName,
      channel: "אימייל" as const,
      kind: "campaign" as const,
      medium: "email" as const,
      revenue: item.revenueGenerated,
      cost: 0,
      purchases: item.purchases,
      clicks: item.uniqueClicks,
      opens: item.totalOpens,
      recipients: item.totalRecipients,
      engagementRate:
        item.totalDelivered > 0
          ? (item.totalOpens + item.uniqueClicks) / (item.totalDelivered * 2)
          : 0,
    })),
    ...sms.map((item) => ({
      id: `sms-${item.id}`,
      date: item.sentAt.slice(0, 10),
      name: item.campaignName,
      channel: "SMS" as const,
      kind: "campaign" as const,
      medium: "sms" as const,
      revenue: item.revenueGenerated,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      purchases: item.purchases,
      clicks: item.totalClicks,
      opens: 0,
      recipients: item.totalRecipients,
      engagementRate: item.totalDelivered > 0 ? item.totalClicks / item.totalDelivered : 0,
    })),
    ...automations.map((item) => {
      const smsRecipients = getAutomationSmsRecipients(item);
      const medium: "email" | "sms" = smsRecipients > 0 || item.channel === "sms" ? "sms" : "email";
      const delivered = medium === "sms" ? smsRecipients : item.sentEmails ?? item.totalDelivered;
      const opens = medium === "email" ? item.openedEmails ?? item.totalOpens : 0;
      const clicks = medium === "sms" ? item.clickedSms ?? item.totalClicks : item.totalClicks;

      return {
        id: `automation-${item.id}`,
        date: item.date,
        name: item.automationName,
        channel: "אוטומציות" as const,
        kind: "automation" as const,
        medium,
        revenue: item.revenueGenerated,
        cost: smsRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
        purchases: item.purchases,
        clicks,
        opens,
        recipients: medium === "sms" ? smsRecipients : item.totalRecipients,
        engagementRate: delivered > 0 ? (opens + clicks) / (delivered * 2) : 0,
      };
    }),
  ];
  const filteredPerformanceItems = performanceItems.filter((item) => {
    if (channelFilter === "all") return true;
    if (channelFilter === "email") return item.channel === "אימייל";
    if (channelFilter === "sms") return item.channel === "SMS";
    return item.channel === "אוטומציות";
  });
  const channelData = ["אימייל", "SMS", "אוטומציות"].map((channel) => {
    const items = performanceItems.filter((item) => item.channel === channel);
    const revenue = items.reduce((total, item) => total + item.revenue, 0);
    const cost = items.reduce((total, item) => total + item.cost, 0);
    const recipients = items.reduce((total, item) => total + item.recipients, 0);

    return {
      channel,
      revenue,
      cost,
      profit: revenue - cost,
      count: items.length,
      recipients,
      roas: cost > 0 ? revenue / cost : null,
      revenuePerRecipient: recipients > 0 ? revenue / recipients : 0,
      share: summary.revenue > 0 ? revenue / summary.revenue : 0,
    };
  });
  const topChannel = [...channelData].sort((a, b) => b.revenue - a.revenue)[0];
  const topPerformers = [...performanceItems]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
  const needsAttention = [...performanceItems]
    .filter((item) => item.cost > 0 || item.revenue === 0)
    .sort((a, b) => {
      const roasA = a.cost > 0 ? a.revenue / a.cost : a.revenue > 0 ? 999_999 : 0;
      const roasB = b.cost > 0 ? b.revenue / b.cost : b.revenue > 0 ? 999_999 : 0;
      return roasA - roasB || b.cost - a.cost;
    })
    .slice(0, 6);
  const bestItem = topPerformers[0];
  const lowestRoasItem = needsAttention[0];
  const bestSms = performanceItems
    .filter((item) => item.channel === "SMS" && item.cost > 0)
    .sort((a, b) => b.revenue / b.cost - a.revenue / a.cost)[0];
  const totalActivities = performanceItems.length;
  const profitableActivities = performanceItems.filter((item) => item.revenue > item.cost).length;
  const fixedCostsNote = summary.fixedCosts > 0
    ? `כולל ${formatCurrency(summary.fixedCosts, account.currency)} עלויות קבועות.`
    : "לא הוגדרו עלויות קבועות.";

  return (
    <section className="grid grid-cols-12 gap-3">
      <div className="col-span-12">
        <KPIGrid account={account} summary={summary} />
      </div>

      <div className="col-span-12">
        <DecisionPanel
          title="תמונת מצב מהירה"
          items={[
            {
              label: "ערוץ מוביל",
              value: topChannel?.channel ?? "—",
              tone: "good",
              detail: topChannel
                ? `${formatCurrency(topChannel.revenue, account.currency)} הכנסה, ${formatPercent(topChannel.share)} מהטווח.`
                : "אין עדיין מספיק נתונים לערוץ מוביל.",
            },
            {
              label: "פעילות לשכפול",
              value: bestItem?.name ?? "אין פעילות מובילה",
              tone: "good",
              detail: bestItem
                ? `${bestItem.channel}, ${formatCurrency(bestItem.revenue, account.currency)} הכנסה ו-${formatNumber(bestItem.purchases)} רכישות.`
                : "כשיש פעילות מנצחת, היא תופיע כאן.",
            },
            {
              label: "מוקד בדיקה",
              value: lowestRoasItem?.name ?? "אין חריגה ברורה",
              tone: lowestRoasItem ? "warn" : "neutral",
              detail: lowestRoasItem
                ? `${lowestRoasItem.channel}, ${formatCurrency(lowestRoasItem.cost, account.currency)} עלות מול ${formatCurrency(lowestRoasItem.revenue, account.currency)} הכנסה.`
                : fixedCostsNote,
            },
          ]}
        />
      </div>

      <div className="col-span-12 flex flex-col gap-3 rounded-2xl border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(100%_0_0_/_0.05)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[oklch(78%_0.015_285)]">
          מציג {formatNumber(totalActivities)} פעילויות, מתוכן {formatNumber(profitableActivities)} עם החזר חיובי.
        </div>
        <div className="flex flex-wrap gap-2">
        {(["all", "email", "sms", "automation"] as OverviewChannelFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setChannelFilter(filter)}
            className={classNames(
              "rounded-full border px-3.5 py-2 text-sm transition",
              channelFilter === filter
                ? "border-transparent bg-[oklch(82%_0.135_185)] font-bold text-[oklch(15%_0.025_285)]"
                : "border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.06)] text-[oklch(78%_0.015_285)] hover:text-white",
            )}
          >
            {overviewChannelLabels[filter]}
          </button>
        ))}
        </div>
      </div>

      <RevenueCostChart account={account} items={filteredPerformanceItems} />
      <ChannelBreakdown account={account} channelData={channelData} />
      <AIInsightPanel account={account} bestSms={bestSms ?? bestItem} weakItem={lowestRoasItem} />

      {showDeepAnalysis && (
      <div className="col-span-12 grid gap-5 xl:grid-cols-2">
        <DataTable
          title="המנצחים בתקופה"
          columns={["שם", "ערוץ", "הכנסה", "רכישות", "קליקים"]}
          rows={topPerformers.map((item) => [
            item.name,
            item.channel,
            formatCurrency(item.revenue, account.currency),
            formatNumber(item.purchases),
            formatNumber(item.clicks),
          ])}
        />
        <DataTable
          title="דורשים בדיקה"
          columns={["שם", "ערוץ", "עלות", "הכנסה", "ROAS"]}
          rows={needsAttention.map((item) => [
            item.name,
            item.channel,
            formatCurrency(item.cost, account.currency),
            formatCurrency(item.revenue, account.currency),
            item.cost > 0 ? `${(item.revenue / item.cost).toFixed(1)}x` : "ללא הכנסה",
          ])}
        />
      </div>
      )}
    </section>
  );
}

function ClientOverview({
  account,
  summary,
  emails,
  sms,
  automations,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
}) {
  const activities: PerformanceItem[] = [
    ...emails.map((item) => ({
      id: `email-${item.id}`,
      date: item.sentAt.slice(0, 10),
      name: item.campaignName,
      channel: "אימייל" as const,
      kind: "campaign" as const,
      medium: "email" as const,
      revenue: item.revenueGenerated,
      cost: 0,
      purchases: item.purchases,
      clicks: item.uniqueClicks,
      opens: item.totalOpens,
      recipients: item.totalRecipients,
      engagementRate: item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : 0,
    })),
    ...sms.map((item) => ({
      id: `sms-${item.id}`,
      date: item.sentAt.slice(0, 10),
      name: item.campaignName,
      channel: "SMS" as const,
      kind: "campaign" as const,
      medium: "sms" as const,
      revenue: item.revenueGenerated,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      purchases: item.purchases,
      clicks: item.totalClicks,
      opens: 0,
      recipients: item.totalRecipients,
      engagementRate: item.totalDelivered > 0 ? item.totalClicks / item.totalDelivered : 0,
    })),
    ...automations.map((item) => {
      const smsRecipients = getAutomationSmsRecipients(item);
      const medium: "email" | "sms" = smsRecipients > 0 || item.channel === "sms" ? "sms" : "email";
      const delivered = medium === "sms" ? smsRecipients : item.sentEmails ?? item.totalDelivered;
      const clicks = medium === "sms" ? item.clickedSms ?? item.totalClicks : item.totalClicks;

      return {
        id: `automation-${item.id}`,
        date: item.date,
        name: item.automationName,
        channel: "אוטומציות" as const,
        kind: "automation" as const,
        medium,
        revenue: item.revenueGenerated,
        cost: smsRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
        purchases: item.purchases,
        clicks,
        opens: medium === "email" ? item.openedEmails ?? item.totalOpens : 0,
        recipients: medium === "sms" ? smsRecipients : item.totalRecipients,
        engagementRate: delivered > 0 ? clicks / delivered : 0,
      };
    }),
  ];
  const channelData = ["אימייל", "SMS", "אוטומציות"].map((channel) => {
    const items = activities.filter((item) => item.channel === channel);
    const revenue = items.reduce((total, item) => total + item.revenue, 0);

    return {
      channel,
      revenue,
      purchases: items.reduce((total, item) => total + item.purchases, 0),
      count: items.length,
      share: summary.revenue > 0 ? revenue / summary.revenue : 0,
    };
  });
  const topChannel = [...channelData].sort((a, b) => b.revenue - a.revenue)[0];
  const topActivities = [...activities].sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases);
  const bestCampaign = topActivities.find((item) => item.kind === "campaign");
  const bestAutomation = topActivities.find((item) => item.kind === "automation");
  const recentActivities = [...activities]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);
  const improvementFocus = [...activities]
    .filter((item) => item.cost > 0 || item.clicks === 0 || item.revenue === 0)
    .sort((a, b) => {
      const roasA = a.cost > 0 ? a.revenue / a.cost : a.revenue > 0 ? 999_999 : 0;
      const roasB = b.cost > 0 ? b.revenue / b.cost : b.revenue > 0 ? 999_999 : 0;
      return roasA - roasB || a.clicks - b.clicks;
    })[0];

  return (
    <section className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white text-[#080123] shadow-[0_16px_45px_rgba(8,1,35,0.12)]">
        <div className="grid gap-px bg-[#dfe7ee] md:grid-cols-4">
          {[
            { label: "הכנסות", value: formatCurrency(summary.revenue, account.currency), caption: "מיוחסות לדיוור" },
            { label: "רווח", value: formatCurrency(summary.profit, account.currency), caption: "אחרי עלויות שליחה" },
            { label: "ROAS", value: formatRoas(summary.roas), caption: "החזר השקעה" },
            { label: "רכישות", value: formatNumber(summary.purchases), caption: `Conversion ${formatPercent(summary.conversionRate)}` },
          ].map((item) => (
            <div key={item.label} className="bg-white p-4">
              <p className="text-xs font-bold text-[#65738a]">{item.label}</p>
              <p className="mt-2 text-[clamp(28px,3vw,42px)] font-black leading-none">{item.value}</p>
              <p className="mt-2 text-xs text-[#65738a]">{item.caption}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl border border-[#dfe7ee] bg-white p-5 text-[#080123] shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <h2 className="text-xl font-black">מה עבד הכי טוב</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "ערוץ מוביל",
                value: topChannel?.channel ?? "—",
                meta: topChannel
                  ? `${formatCurrency(topChannel.revenue, account.currency)} · ${formatPercent(topChannel.share)} מההכנסה`
                  : "אין מספיק נתונים",
              },
              {
                label: "קמפיין מוביל",
                value: bestCampaign?.name ?? "—",
                meta: bestCampaign
                  ? `${formatCurrency(bestCampaign.revenue, account.currency)} · ${formatNumber(bestCampaign.purchases)} רכישות`
                  : "אין קמפיין מוביל בטווח",
              },
              {
                label: "אוטומציה מובילה",
                value: bestAutomation?.name ?? "—",
                meta: bestAutomation
                  ? `${formatCurrency(bestAutomation.revenue, account.currency)} · ${formatNumber(bestAutomation.purchases)} רכישות`
                  : "אין אוטומציה מובילה בטווח",
              },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl bg-[#f7faf9] p-4">
                <p className="text-xs font-bold text-[#65738a]">{item.label}</p>
                <p className="mt-2 truncate text-lg font-black text-[#080123]">{item.value}</p>
                <p className="mt-2 text-xs leading-5 text-[#65738a]">{item.meta}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[#b8fff3] bg-[#edfffb] p-5 text-[#080123] shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <h2 className="text-xl font-black">מה אנחנו משפרים עכשיו</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#40506a]">
            <p>
              ממשיכים לשכפל את מה שמייצר הכנסה, במיוחד את {topChannel?.channel ?? "הערוץ המוביל"}.
            </p>
            <p>
              {improvementFocus
                ? `בודקים את "${improvementFocus.name}" כדי לשפר החזר, קליקים או הכנסה.`
                : "לא זוהתה כרגע נקודת חולשה חריגה בטווח הנבחר."}
            </p>
            <p>השלב הבא הוא להוציא יותר פעולות דומות למה שעבד, ופחות פעולות עם החזר נמוך.</p>
          </div>
        </article>
      </section>

      <article className="rounded-2xl border border-[#dfe7ee] bg-white p-5 text-[#080123] shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">פעילויות אחרונות</h2>
          <span className="text-xs font-bold text-[#65738a]">עד 4 פריטים</span>
        </div>
        <div className="mt-4 divide-y divide-[#eef3f7]">
          {recentActivities.length ? (
            recentActivities.map((item) => (
              <div key={item.id} className="grid gap-3 py-3 md:grid-cols-[1fr_110px_110px_110px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="mt-1 text-xs text-[#65738a]">
                    {new Date(item.date).toLocaleDateString("he-IL")} · {item.channel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#65738a]">הכנסה</p>
                  <p className="font-black">{formatCurrency(item.revenue, account.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#65738a]">רכישות</p>
                  <p className="font-black">{formatNumber(item.purchases)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#65738a]">{item.medium === "email" ? "קליקים" : "הקלקה"}</p>
                  <p className="font-black">
                    {item.medium === "email" ? formatNumber(item.clicks) : formatPercent(item.engagementRate)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-[#65738a]">אין פעילויות להצגה בטווח הזה.</p>
          )}
        </div>
      </article>
    </section>
  );
}

function ClientSmsDashboard({
  account,
  sms,
  automations,
}: {
  account: FlashyAccount;
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
}) {
  const smsAutomations = automations.filter((item) => getAutomationSmsRecipients(item) > 0);
  const summary = summarizeSms(account, sms, smsAutomations);
  const rows = [
    ...sms.map((item) => ({
      id: `sms-${item.id}`,
      name: item.campaignName,
      type: "קמפיין",
      revenue: item.revenueGenerated,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      purchases: item.purchases,
      recipients: item.totalRecipients,
      clicks: item.totalClicks,
    })),
    ...smsAutomations.map((item) => {
      const recipients = getAutomationSmsRecipients(item);

      return {
        id: `automation-${item.id}`,
        name: item.automationName,
        type: "אוטומציה",
        revenue: item.revenueGenerated,
        cost: recipients * account.smsCreditPriceUsd * account.usdIlsRate,
        purchases: item.purchases,
        recipients,
        clicks: item.clickedSms ?? item.totalClicks,
      };
    }),
  ].map((item) => ({ ...item, roas: item.cost > 0 ? item.revenue / item.cost : null }));
  const winners = [...rows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue).slice(0, 3);
  const focus = [...rows].filter((item) => item.cost > 0).sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard title="הכנסות SMS" value={formatCurrency(summary.revenue, account.currency)} caption={`${formatNumber(summary.purchases)} רכישות`} icon={TrendingUp} tone="good" />
        <MetricCard title="ROAS SMS" value={formatRoas(summary.roas)} caption="קמפיינים ואוטומציות" icon={LineChart} tone="good" />
        <MetricCard title="נמענים" value={formatNumber(summary.recipients)} caption={`${formatNumber(summary.clicks)} קליקים`} icon={MessageSquareText} />
      </div>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <RankedInsightList
          title="SMS שעבדו הכי טוב"
          items={winners.map((item) => ({
            label: item.name,
            value: formatCurrency(item.revenue, account.currency),
            meta: `${item.type} · ${formatRoas(item.roas)} · ${formatNumber(item.purchases)} רכישות`,
          }))}
        />
        <article className="rounded-xl border border-[#b8fff3] bg-[#edfffb] p-4 text-[#080123]">
          <h2 className="text-lg font-black">מה אנחנו עושים עכשיו</h2>
          <p className="mt-3 text-sm leading-6 text-[#40506a]">
            ממשיכים לשכפל הודעות עם החזר גבוה, ובודקים את {focus ? `"${focus.name}"` : "השליחות החלשות"} כדי לשפר הקלקות ורכישות.
          </p>
        </article>
      </section>
    </section>
  );
}

function ClientAutomationDashboard({
  account,
  automations,
}: {
  account: FlashyAccount;
  automations: AutomationReport[];
}) {
  const enriched = automations.map((item) => {
    const smsRecipients = getAutomationSmsRecipients(item);
    const smsCost = smsRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
    const messages = (item.sentEmails ?? (item.channel === "email" ? item.totalDelivered : 0)) + smsRecipients;

    return {
      ...item,
      type: getAutomationType(item),
      smsCost,
      messages,
      roas: smsCost > 0 ? item.revenueGenerated / smsCost : null,
      clickRate: messages > 0 ? (item.totalClicks + (item.clickedSms ?? 0)) / messages : 0,
    };
  });
  const revenue = enriched.reduce((total, item) => total + item.revenueGenerated, 0);
  const purchases = enriched.reduce((total, item) => total + item.purchases, 0);
  const top = [...enriched].sort((a, b) => b.revenueGenerated - a.revenueGenerated || b.purchases - a.purchases).slice(0, 3);
  const focus = [...enriched].sort((a, b) => a.clickRate - b.clickRate || a.revenueGenerated - b.revenueGenerated)[0];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard title="הכנסות אוטומציות" value={formatCurrency(revenue, account.currency)} caption={`${formatNumber(automations.length)} אוטומציות`} icon={RefreshCw} tone="good" />
        <MetricCard title="רכישות" value={formatNumber(purchases)} caption="מאוטומציות בטווח" icon={CheckCircle2} tone="good" />
        <MetricCard title="מעורבות" value={formatPercent(enriched.reduce((t, i) => t + i.clickRate, 0) / Math.max(1, enriched.length))} caption="ממוצע הקלקה" icon={Activity} />
      </div>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <RankedInsightList
          title="אוטומציות מובילות"
          items={top.map((item) => ({
            label: item.automationName,
            value: formatCurrency(item.revenueGenerated, account.currency),
            meta: `${automationFilterLabels[item.type]} · ${formatNumber(item.purchases)} רכישות · ${formatPercent(item.clickRate)} הקלקה`,
          }))}
        />
        <article className="rounded-xl border border-[#b8fff3] bg-[#edfffb] p-4 text-[#080123]">
          <h2 className="text-lg font-black">מה אנחנו משפרים עכשיו</h2>
          <p className="mt-3 text-sm leading-6 text-[#40506a]">
            מחזקים את האוטומציות שמייצרות הכנסה ובודקים את {focus ? `"${focus.automationName}"` : "האוטומציות עם המעורבות הנמוכה"} כדי לשפר מעורבות ורכישות.
          </p>
        </article>
      </section>
    </section>
  );
}

function ClientCampaignDashboard({
  account,
  emails,
  sms,
}: {
  account: FlashyAccount;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
}) {
  const allCampaigns = [
    ...emails.map((item) => ({
      name: item.campaignName,
      sentAt: item.sentAt,
      channel: "אימייל",
      revenue: item.revenueGenerated,
      purchases: item.purchases,
      clicks: item.totalClicks,
      recipients: item.totalRecipients,
      subject: item.subjectLine,
      openRate: item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : 0,
      clickRate: item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : 0,
    })),
    ...sms.map((item) => ({
      name: item.campaignName,
      sentAt: item.sentAt,
      channel: "SMS",
      revenue: item.revenueGenerated,
      purchases: item.purchases,
      clicks: item.totalClicks,
      recipients: item.totalRecipients,
      subject: "",
      openRate: 0,
      clickRate: item.totalDelivered > 0 ? item.totalClicks / item.totalDelivered : 0,
    })),
  ];
  const revenue = allCampaigns.reduce((total, item) => total + item.revenue, 0);
  const purchases = allCampaigns.reduce((total, item) => total + item.purchases, 0);
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const bestCampaigns = [...allCampaigns].sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases).slice(0, 3);
  const bestSubject = [...emails]
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated || b.totalClicks - a.totalClicks)[0];
  const bestDay = allCampaigns.reduce<Record<string, { revenue: number; count: number }>>((acc, item) => {
    const label = dayNames[new Date(item.sentAt).getDay()];
    acc[label] = acc[label] ?? { revenue: 0, count: 0 };
    acc[label].revenue += item.revenue;
    acc[label].count += 1;
    return acc;
  }, {});
  const bestDayEntry = Object.entries(bestDay).sort((a, b) => b[1].revenue - a[1].revenue)[0];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard title="הכנסות קמפיינים" value={formatCurrency(revenue, account.currency)} caption={`${formatNumber(allCampaigns.length)} קמפיינים`} icon={Send} tone="good" />
        <MetricCard title="רכישות" value={formatNumber(purchases)} caption="אימייל ו-SMS" icon={CheckCircle2} tone="good" />
        <MetricCard title="יום חזק" value={bestDayEntry?.[0] ?? "—"} caption={bestDayEntry ? formatCurrency(bestDayEntry[1].revenue, account.currency) : "אין מספיק נתונים"} icon={CalendarDays} />
      </div>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <RankedInsightList
          title="קמפיינים מובילים"
          items={bestCampaigns.map((item) => ({
            label: item.name,
            value: formatCurrency(item.revenue, account.currency),
            meta: `${item.channel} · ${formatNumber(item.purchases)} רכישות · ${formatPercent(item.clickRate)} הקלקה`,
          }))}
        />
        <article className="rounded-xl border border-[#b8fff3] bg-[#edfffb] p-4 text-[#080123]">
          <h2 className="text-lg font-black">מה למדנו</h2>
          <p className="mt-3 text-sm leading-6 text-[#40506a]">
            {bestSubject
              ? `שורת הנושא החזקה: "${bestSubject.subjectLine}". נשתמש בדפוס הזה בקמפיינים הבאים.`
              : "נמשיך לזהות ימים, שעות ומסרים שמייצרים יותר רכישות."}
          </p>
        </article>
      </section>
    </section>
  );
}

function SmsDashboard({
  account,
  sms,
  automations,
  showDeepAnalysis,
}: {
  account: FlashyAccount;
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  showDeepAnalysis: boolean;
}) {
  const [showAllSmsWinners, setShowAllSmsWinners] = useState(false);
  const [showAllSmsRisks, setShowAllSmsRisks] = useState(false);
  const smsAutomations = automations.filter((item) => getAutomationSmsRecipients(item) > 0);
  const summary = summarizeSms(account, sms, smsAutomations);
  const rows = [
    ...sms.map((item) => ({
      name: item.campaignName,
      type: "קמפיין",
      recipients: item.totalRecipients,
      revenue: item.revenueGenerated,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      purchases: item.purchases,
      clicks: item.totalClicks,
    })),
    ...smsAutomations.map((item) => ({
      name: item.automationName,
      type: "אוטומציה",
      recipients: getAutomationSmsRecipients(item),
      revenue: item.revenueGenerated,
      cost: getAutomationSmsRecipients(item) * account.smsCreditPriceUsd * account.usdIlsRate,
      purchases: item.purchases,
      clicks: item.clickedSms ?? item.totalClicks,
    })),
  ].map((row) => ({
    ...row,
    roas: row.cost > 0 ? row.revenue / row.cost : null,
    clickRate: row.recipients > 0 ? row.clicks / row.recipients : 0,
  }));
  const smsWinners = [...rows].sort(
    (a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue || b.purchases - a.purchases,
  );
  const smsNeedsAttention = [...rows]
    .filter((row) => row.cost > 0)
    .sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0) || b.cost - a.cost);
  const visibleSmsWinners = smsWinners.slice(0, showAllSmsWinners ? smsWinners.length : 4);
  const visibleSmsRisks = smsNeedsAttention.slice(0, showAllSmsRisks ? smsNeedsAttention.length : 4);
  const bestSms = [...rows]
    .filter((row) => row.cost > 0)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  const expensiveSms = [...rows]
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost)[0];
  const maxSmsRevenue = Math.max(1, ...visibleSmsWinners.map((row) => row.revenue));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          title="ROAS SMS"
          value={summary.roas ? `${summary.roas.toFixed(1)}x` : "אין עלות"}
          caption="קמפיינים ואוטומציות יחד"
          icon={MessageSquareText}
          tone="good"
        />
        <MetricCard
          title="עלות SMS"
          value={formatCurrency(summary.smsCost, account.currency)}
          caption={`${formatCurrency(summary.smsCostUsd, "USD")} לפי ${formatNumber(
            summary.recipients,
          )} נמענים`}
          icon={Activity}
        />
        <MetricCard
          title="הכנסות SMS"
          value={formatCurrency(summary.revenue, account.currency)}
          caption={`${formatNumber(summary.purchases)} רכישות`}
          icon={TrendingUp}
          tone="good"
        />
      </div>
      <DecisionPanel
        title="החלטות SMS"
        items={[
          {
            label: "להמשיך",
            value: bestSms?.name ?? "אין מועמד ברור",
            tone: "good",
            detail: bestSms
              ? `ROAS ${formatRoas(bestSms.roas)}, הכנסה ${formatCurrency(bestSms.revenue, account.currency)} על ${formatNumber(bestSms.recipients)} נמענים.`
              : "אין כרגע SMS עם עלות והחזר ברור.",
          },
          {
            label: "לבדוק",
            value: expensiveSms?.name ?? "אין עלות חריגה",
            tone: expensiveSms ? "warn" : "neutral",
            detail: expensiveSms
              ? `עלות ${formatCurrency(expensiveSms.cost, account.currency)}. לשכפל רק אם ROAS ${formatRoas(expensiveSms.roas)} עומד ביעד.`
              : "אין קמפיין/אוטומציה עם עלות שמצריכה בדיקה.",
          },
          {
            label: "תמונת מצב",
            value: `${formatNumber(summary.recipients)} נמענים`,
            detail: `${formatCurrency(summary.smsCost, account.currency)} עלות מול ${formatCurrency(summary.revenue, account.currency)} הכנסה.`,
          },
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="border-b border-[#eef3f7] p-4">
            <h2 className="text-xl font-bold text-[#080123]">SMS משתלמים</h2>
          </div>
          {visibleSmsWinners.length ? (
            <div className="divide-y divide-[#eef3f7]">
              {visibleSmsWinners.map((row, index) => (
                <div key={`${row.type}-${row.name}`} className="grid gap-3 p-4 md:grid-cols-[36px_1fr_115px_105px] md:items-center">
                  <div className="grid size-8 place-items-center rounded-full bg-[#080123] text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-[#080123]">{row.name}</p>
                      <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[11px] font-bold text-[#65738a]">
                        {row.type}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5eaef]">
                      <div
                        className="h-full rounded-full bg-[oklch(82%_0.135_185)]"
                        style={{ width: `${boundedPercent(row.revenue, maxSmsRevenue)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[#65738a]">
                      {formatNumber(row.recipients)} נמענים · {formatNumber(row.clicks)} קליקים
                    </p>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#080123]">{formatRoas(row.roas)}</div>
                    <div className="text-xs text-[#65738a]">{formatCurrency(row.cost, account.currency)} עלות</div>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#080123]">
                      {formatCurrency(row.revenue, account.currency)}
                    </div>
                    <div className="text-xs text-[#65738a]">{formatNumber(row.purchases)} רכישות</div>
                  </div>
                </div>
              ))}
              {smsWinners.length > 4 && (
                <button
                  onClick={() => setShowAllSmsWinners((current) => !current)}
                  className="min-h-11 w-full bg-[#f4f7f6] px-4 text-sm font-bold text-[#080123] transition hover:bg-[oklch(82%_0.135_185_/_0.18)]"
                >
                  {showAllSmsWinners ? "הצג פחות" : `הצג הכל (${formatNumber(smsWinners.length)})`}
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#65738a]">אין SMS להצגה בטווח הזה.</div>
          )}
        </article>

        <article className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="border-b border-[#eef3f7] p-4">
            <h2 className="text-xl font-bold text-[#080123]">SMS לבדיקה</h2>
          </div>
          {visibleSmsRisks.length ? (
            <div className="divide-y divide-[#eef3f7]">
              {visibleSmsRisks.map((row) => (
                <div key={`${row.type}-${row.name}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#080123]">{row.name}</p>
                      <p className="mt-1 text-xs text-[#65738a]">
                        {row.type} · {formatNumber(row.recipients)} נמענים · {formatPercent(row.clickRate)} הקלקה
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#fff6df] px-2 py-1 text-xs font-bold text-[#9a5b00]">
                      {formatRoas(row.roas)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">עלות</div>
                      <div className="mt-1 font-bold text-[#080123]">{formatCurrency(row.cost, account.currency)}</div>
                    </div>
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">הכנסה</div>
                      <div className="mt-1 font-bold text-[#080123]">
                        {formatCurrency(row.revenue, account.currency)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">רכישות</div>
                      <div className="mt-1 font-bold text-[#080123]">{formatNumber(row.purchases)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {smsNeedsAttention.length > 4 && (
                <button
                  onClick={() => setShowAllSmsRisks((current) => !current)}
                  className="min-h-11 w-full bg-[#f4f7f6] px-4 text-sm font-bold text-[#080123] transition hover:bg-[oklch(82%_0.135_185_/_0.18)]"
                >
                  {showAllSmsRisks ? "הצג פחות" : `הצג הכל (${formatNumber(smsNeedsAttention.length)})`}
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#65738a]">אין SMS בעייתיים בטווח הזה.</div>
          )}
        </article>
      </section>
      {showDeepAnalysis && (
      <>
      <DataTable
        title="פירוק SMS"
        columns={["שם", "סוג", "נמענים", "קליקים", "עלות", "הכנסה", "רכישות", "ROAS"]}
        rows={rows.map((row) => [
          row.name,
          row.type,
          formatNumber(row.recipients),
          formatNumber(row.clicks),
          formatCurrency(row.cost, account.currency),
          formatCurrency(row.revenue, account.currency),
          formatNumber(row.purchases),
          formatRoas(row.roas),
          ])}
      />
      </>
      )}
    </div>
  );
}

function AutomationDashboard({
  account,
  automations,
  showDeepAnalysis,
}: {
  account: FlashyAccount;
  automations: AutomationReport[];
  showDeepAnalysis: boolean;
}) {
  const [filter, setFilter] = useState<AutomationFilterKey>("all");
  const [showAllTopAutomations, setShowAllTopAutomations] = useState(false);
  const [showAllAttentionAutomations, setShowAllAttentionAutomations] = useState(false);
  const enrichedAutomations = automations.map((item) => {
    const smsRecipients = getAutomationSmsRecipients(item);
    const smsCost = smsRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
    const emailSent = item.sentEmails ?? (item.channel === "email" ? item.totalDelivered : 0);
    const emailOpens = item.openedEmails ?? item.totalOpens;
    const emailClicks = item.clickedEmails ?? item.totalClicks;
    const totalMessages = emailSent + smsRecipients;
    const completionBase = item.totalEntered ?? item.totalRecipients;

    return {
      ...item,
      automationType: getAutomationType(item),
      smsRecipients,
      smsCost,
      emailSent,
      emailOpens,
      emailClicks,
      totalMessages,
      completionRate: completionBase > 0 ? (item.totalCompleted ?? 0) / completionBase : 0,
      openRate: emailSent > 0 ? emailOpens / emailSent : 0,
      clickRate: totalMessages > 0 ? (emailClicks + (item.clickedSms ?? 0)) / totalMessages : 0,
      roas: smsCost > 0 ? item.revenueGenerated / smsCost : null,
    };
  });
  const filteredAutomations = enrichedAutomations.filter(
    (item) => filter === "all" || item.automationType === filter,
  );
  const automationRevenue = filteredAutomations.reduce(
    (total, item) => total + item.revenueGenerated,
    0,
  );
  const automationSmsCost = filteredAutomations.reduce((total, item) => total + item.smsCost, 0);
  const automationSmsSent = filteredAutomations.reduce(
    (total, item) => total + item.smsRecipients,
    0,
  );
  const automationPurchases = filteredAutomations.reduce((total, item) => total + item.purchases, 0);
  const automationSegments = (["email", "sms", "mixed"] as AutomationFilterKey[])
    .map((type) => {
      const items = enrichedAutomations.filter((item) => item.automationType === type);
      const revenue = items.reduce((total, item) => total + item.revenueGenerated, 0);
      const smsCost = items.reduce((total, item) => total + item.smsCost, 0);
      const clicks = items.reduce((total, item) => total + item.totalClicks + (item.clickedSms ?? 0), 0);
      const messages = items.reduce((total, item) => total + item.totalMessages, 0);

      return {
        type,
        items,
        revenue,
        smsCost,
        clicks,
        messages,
        roas: smsCost > 0 ? revenue / smsCost : null,
      };
    })
    .filter((segment) => segment.items.length > 0);
  const weakAutomations = filteredAutomations.filter(
    (item) =>
      (item.sentEmails ?? 0) + item.smsRecipients > 0 &&
      item.revenueGenerated === 0 &&
      item.totalClicks === 0,
  ).length;
  const highPotentialAutomation = [...filteredAutomations]
    .filter((item) => item.revenueGenerated > 0)
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  const weakPaidAutomation = [...filteredAutomations]
    .filter((item) => item.smsCost > 0)
    .sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0];
  const topAutomations = [...filteredAutomations]
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated || b.purchases - a.purchases || b.clickRate - a.clickRate);
  const attentionAutomations = [...filteredAutomations]
    .filter(
      (item) =>
        item.revenueGenerated === 0 ||
        item.totalClicks === 0 ||
        (item.smsCost > 0 && item.revenueGenerated < item.smsCost) ||
        (item.failedMessages ?? 0) > 0,
    )
    .sort((a, b) => {
      const scoreA = (a.smsCost > 0 && a.revenueGenerated < a.smsCost ? 0 : 1) + (a.totalClicks > 0 ? 1 : 0) + (a.revenueGenerated > 0 ? 1 : 0);
      const scoreB = (b.smsCost > 0 && b.revenueGenerated < b.smsCost ? 0 : 1) + (b.totalClicks > 0 ? 1 : 0) + (b.revenueGenerated > 0 ? 1 : 0);
      return scoreA - scoreB || b.smsCost - a.smsCost;
    });
  const visibleTopAutomations = topAutomations.slice(0, showAllTopAutomations ? topAutomations.length : 4);
  const visibleAttentionAutomations = attentionAutomations.slice(
    0,
    showAllAttentionAutomations ? attentionAutomations.length : 4,
  );
  const maxAutomationRevenue = Math.max(1, ...visibleTopAutomations.map((item) => item.revenueGenerated));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="הכנסות אוטומציות"
          value={formatCurrency(automationRevenue, account.currency)}
          caption={`${formatNumber(filteredAutomations.length)} אוטומציות בטווח`}
          icon={TrendingUp}
          tone="good"
        />
        <MetricCard
          title="עלות SMS באוטומציות"
          value={formatCurrency(automationSmsCost, account.currency)}
          caption={`${formatNumber(automationSmsSent)} הודעות SMS שנשלחו`}
          icon={MessageSquareText}
        />
        <MetricCard
          title="ROAS SMS אוטומציות"
          value={formatRoas(automationSmsCost > 0 ? automationRevenue / automationSmsCost : null)}
          caption="לפי עלות SMS בלבד"
          icon={LineChart}
          tone="good"
        />
        <MetricCard
          title="דורשות בדיקה"
          value={formatNumber(weakAutomations)}
          caption={`${formatNumber(automationPurchases)} רכישות בטווח`}
          icon={Activity}
          tone={weakAutomations > 0 ? "warn" : "neutral"}
        />
      </div>

      <section className="rounded-xl border border-[#dfe7ee] bg-white p-4 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-bold text-[#080123]">סינון אוטומציות</h2>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {(["all", "mixed", "sms", "email"] as AutomationFilterKey[]).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={classNames(
                  "h-9 rounded-md px-3 text-sm font-medium transition",
                  filter === item
                    ? "bg-[#080123] text-white"
                    : "bg-slate-100 text-[#263548] hover:bg-slate-200",
                )}
              >
                {automationFilterLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {automationSegments.map((segment) => (
          <button
            key={segment.type}
            onClick={() => setFilter(segment.type)}
            className={classNames(
              "rounded-xl border p-4 text-right transition",
              filter === segment.type
                ? "border-[#6fffe5] bg-[#edfffb] text-[#080123]"
                : "border-[#dfe7ee] bg-white text-[#080123] hover:border-[#b8fff3]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">{automationFilterLabels[segment.type]}</span>
              <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-xs text-[#65738a]">
                {formatNumber(segment.items.length)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#65738a]">
              <div>
                <p>הכנסה</p>
                <p className="mt-1 text-base font-black text-[#080123]">
                  {formatCurrency(segment.revenue, account.currency)}
                </p>
              </div>
              <div>
                <p>{segment.smsCost > 0 ? "ROAS SMS" : "הקלקה"}</p>
                <p className="mt-1 text-base font-black text-[#080123]">
                  {segment.smsCost > 0
                    ? formatRoas(segment.roas)
                    : formatPercent(segment.messages > 0 ? segment.clicks / segment.messages : 0)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <article className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="border-b border-[#eef3f7] p-4">
            <h2 className="text-xl font-bold text-[#080123]">אוטומציות מובילות</h2>
          </div>
          {visibleTopAutomations.length ? (
            <div className="divide-y divide-[#eef3f7]">
              {visibleTopAutomations.map((item, index) => (
                <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[36px_1fr_130px_130px] md:items-center">
                  <div className="grid size-8 place-items-center rounded-full bg-[#080123] text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-[#080123]">{item.automationName}</p>
                      <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[11px] font-bold text-[#65738a]">
                        {automationFilterLabels[item.automationType]}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5eaef]">
                      <div
                        className="h-full rounded-full bg-[oklch(82%_0.135_185)]"
                        style={{ width: `${boundedPercent(item.revenueGenerated, maxAutomationRevenue)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[#65738a]">
                      {formatNumber(item.totalMessages)} הודעות · {formatPercent(item.clickRate)} הקלקה
                    </p>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#080123]">
                      {formatCurrency(item.revenueGenerated, account.currency)}
                    </div>
                    <div className="text-xs text-[#65738a]">{formatNumber(item.purchases)} רכישות</div>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#080123]">
                      {item.smsCost > 0 ? formatRoas(item.roas) : formatPercent(item.openRate)}
                    </div>
                    <div className="text-xs text-[#65738a]">
                      {item.smsCost > 0
                        ? `עלות ${formatCurrency(item.smsCost, account.currency)}`
                        : `${formatNumber(item.emailOpens)} פתיחות`}
                    </div>
                  </div>
                </div>
              ))}
              {topAutomations.length > 4 && (
                <button
                  onClick={() => setShowAllTopAutomations((current) => !current)}
                  className="min-h-11 w-full bg-[#f4f7f6] px-4 text-sm font-bold text-[#080123] transition hover:bg-[oklch(82%_0.135_185_/_0.18)]"
                >
                  {showAllTopAutomations ? "הצג פחות" : `הצג הכל (${formatNumber(topAutomations.length)})`}
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#65738a]">אין אוטומציות להצגה בטווח הזה.</div>
          )}
        </article>

        <article className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="border-b border-[#eef3f7] p-4">
            <h2 className="text-xl font-bold text-[#080123]">דורשות טיפול</h2>
          </div>
          {visibleAttentionAutomations.length ? (
            <div className="divide-y divide-[#eef3f7]">
              {visibleAttentionAutomations.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#080123]">{item.automationName}</p>
                      <p className="mt-1 text-xs text-[#65738a]">
                        {automationFilterLabels[item.automationType]} · {formatNumber(item.totalMessages)} הודעות
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#fff6df] px-2 py-1 text-xs font-bold text-[#9a5b00]">
                      בדיקה
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">הכנסה</div>
                      <div className="mt-1 font-bold text-[#080123]">
                        {formatCurrency(item.revenueGenerated, account.currency)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">קליקים</div>
                      <div className="mt-1 font-bold text-[#080123]">{formatNumber(item.totalClicks)}</div>
                    </div>
                    <div className="rounded-lg bg-[#f4f7f6] p-2">
                      <div className="text-[#65738a]">עלות SMS</div>
                      <div className="mt-1 font-bold text-[#080123]">
                        {item.smsCost > 0 ? formatCurrency(item.smsCost, account.currency) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {attentionAutomations.length > 4 && (
                <button
                  onClick={() => setShowAllAttentionAutomations((current) => !current)}
                  className="min-h-11 w-full bg-[#f4f7f6] px-4 text-sm font-bold text-[#080123] transition hover:bg-[oklch(82%_0.135_185_/_0.18)]"
                >
                  {showAllAttentionAutomations ? "הצג פחות" : `הצג הכל (${formatNumber(attentionAutomations.length)})`}
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#65738a]">לא זוהו אוטומציות בעייתיות בטווח הזה.</div>
          )}
        </article>
      </section>

      <DecisionPanel
        title="המלצת עבודה"
        items={[
          {
            label: "לשמר",
            value: highPotentialAutomation?.automationName ?? "אין מובילה ברורה",
            tone: "good",
            detail: highPotentialAutomation
              ? `${formatCurrency(highPotentialAutomation.revenueGenerated, account.currency)} הכנסה ו-${formatNumber(highPotentialAutomation.purchases)} רכישות.`
              : "כשיצטברו הכנסות מאוטומציות, נציג כאן את החזקה ביותר.",
          },
          {
            label: "לתקן",
            value: weakPaidAutomation?.automationName ?? "אין SMS חלש ברור",
            tone: weakPaidAutomation ? "warn" : "neutral",
            detail: weakPaidAutomation
              ? `עלות SMS ${formatCurrency(weakPaidAutomation.smsCost, account.currency)}, ROAS ${formatRoas(weakPaidAutomation.roas)}.`
              : "אין אוטומציה עם עלות SMS שדורשת עצירה מיידית.",
          },
          {
            label: "לבדוק",
            value: `${formatNumber(attentionAutomations.length)} אוטומציות`,
            detail: "נבדקות לפי הכנסה, קליקים, עלות SMS וכשלי שליחה.",
          },
        ]}
      />

      {showDeepAnalysis && (
      <>
      <DataTable
        title="אוטומציות אימייל ו־SMS"
        columns={[
          "אוטומציה",
          "סוג",
          "נכנסו",
          "הושלמו",
          "אימיילים",
          "פתיחות",
          "קליקים",
          "SMS",
          "עלות SMS",
          "רכישות",
          "הכנסה",
          "ROAS",
        ]}
        rows={filteredAutomations.map((item) => [
          item.automationName,
          automationFilterLabels[item.automationType],
          formatNumber(item.totalEntered ?? item.totalRecipients),
          formatNumber(item.totalCompleted ?? 0),
          formatNumber(item.sentEmails ?? (item.channel === "email" ? item.totalDelivered : 0)),
          formatNumber(item.openedEmails ?? item.totalOpens),
          formatNumber(item.totalClicks),
          formatNumber(item.smsRecipients),
          formatCurrency(item.smsCost, account.currency),
          formatNumber(item.purchases),
          formatCurrency(item.revenueGenerated, account.currency),
          item.roas ? `${item.roas.toFixed(1)}x` : "אין עלות",
        ])}
      />
      </>
      )}
    </div>
  );
}

function CampaignDashboard({
  account,
  emails,
  sms,
  showDeepAnalysis,
}: {
  account: FlashyAccount;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  showDeepAnalysis: boolean;
}) {
  const emailRevenue = emails.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsRevenue = sms.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsCost = sms.reduce(
    (total, item) => total + item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
    0,
  );
  const smsRoas = smsCost > 0 ? smsRevenue / smsCost : null;
  const campaignPurchases =
    emails.reduce((total, item) => total + item.purchases, 0) +
    sms.reduce((total, item) => total + item.purchases, 0);
  const emailLeaders = [...emails].sort((a, b) => b.revenueGenerated - a.revenueGenerated).slice(0, 8);
  const smsLeaders = [...sms].sort((a, b) => b.revenueGenerated - a.revenueGenerated).slice(0, 8);
  const weakCampaigns = [
    ...emails
      .filter((item) => item.revenueGenerated === 0 || item.totalClicks === 0)
      .map((item) => ({
        name: item.campaignName,
        channel: "אימייל",
        cost: 0,
        revenue: item.revenueGenerated,
        clicks: item.totalClicks,
      })),
    ...sms.map((item) => {
      const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;

      return {
        name: item.campaignName,
        channel: "SMS",
        cost,
        revenue: item.revenueGenerated,
        clicks: item.totalClicks,
      };
    }),
  ]
    .sort((a, b) => {
      const scoreA = a.cost > 0 ? a.revenue / a.cost : a.revenue > 0 ? 999_999 : 0;
      const scoreB = b.cost > 0 ? b.revenue / b.cost : b.revenue > 0 ? 999_999 : 0;
      return scoreA - scoreB || a.clicks - b.clicks;
    })
    .slice(0, 8);
  const allCampaignsForDecision = [
    ...emails.map((item) => ({
      name: item.campaignName,
      channel: "אימייל",
      sentAt: item.sentAt,
      revenue: item.revenueGenerated,
      cost: 0,
      purchases: item.purchases,
      clicks: item.totalClicks,
      recipients: item.totalRecipients,
      subject: item.subjectLine,
    })),
    ...sms.map((item) => {
      const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;

      return {
        name: item.campaignName,
        channel: "SMS",
        sentAt: item.sentAt,
        revenue: item.revenueGenerated,
        cost,
        purchases: item.purchases,
        clicks: item.totalClicks,
        recipients: item.totalRecipients,
        subject: "",
      };
    }),
  ];
  const campaignToRepeat = [...allCampaignsForDecision]
    .sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases)[0];
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const aggregateBy = (keyGetter: (item: (typeof allCampaignsForDecision)[number]) => string) => {
    const groups = new Map<
      string,
      { label: string; revenue: number; purchases: number; clicks: number; recipients: number; count: number }
    >();

    for (const item of allCampaignsForDecision) {
      const label = keyGetter(item);
      const current =
        groups.get(label) ?? { label, revenue: 0, purchases: 0, clicks: 0, recipients: 0, count: 0 };
      current.revenue += item.revenue;
      current.purchases += item.purchases;
      current.clicks += item.clicks;
      current.recipients += item.recipients;
      current.count += 1;
      groups.set(label, current);
    }

    return Array.from(groups.values()).sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.purchases - a.purchases ||
        b.clicks / Math.max(1, b.recipients) - a.clicks / Math.max(1, a.recipients),
    );
  };
  const bestDays = aggregateBy((item) => dayNames[new Date(item.sentAt).getDay()]).slice(0, 3);
  const bestHours = aggregateBy((item) => {
    const hour = new Date(item.sentAt).getHours();
    return `${String(hour).padStart(2, "0")}:00`;
  }).slice(0, 3);
  const subjectWinners = [...emails]
    .map((item) => ({
      subject: item.subjectLine,
      campaign: item.campaignName,
      revenue: item.revenueGenerated,
      openRate: item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : 0,
      clickRate: item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : 0,
      engagement: item.totalDelivered > 0 ? (item.totalOpens + item.totalClicks * 2) / item.totalDelivered : 0,
      clicks: item.totalClicks,
      purchases: item.purchases,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.engagement - a.engagement)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="הכנסות קמפיינים"
          value={formatCurrency(emailRevenue + smsRevenue, account.currency)}
          caption={`${formatNumber(emails.length + sms.length)} קמפיינים בטווח`}
          icon={Send}
          tone="good"
        />
        <MetricCard
          title="קמפייני אימייל"
          value={formatCurrency(emailRevenue, account.currency)}
          caption={`${formatNumber(emails.length)} שליחות`}
          icon={LineChart}
        />
        <MetricCard
          title="קמפייני SMS"
          value={formatCurrency(smsRevenue, account.currency)}
          caption={`ROAS ${formatRoas(smsRoas)} · ${formatCurrency(smsCost, account.currency)} עלות`}
          icon={MessageSquareText}
          tone="good"
        />
        <MetricCard
          title="רכישות"
          value={formatNumber(campaignPurchases)}
          caption="אימייל ו-SMS יחד"
          icon={CheckCircle2}
          tone="good"
        />
      </div>

      <DecisionPanel
        title="מה חשוב בקמפיינים"
        items={[
          {
            label: "יום חזק",
            value: bestDays[0]?.label ?? "אין מספיק נתונים",
            tone: "good",
            detail: bestDays[0]
              ? `${formatCurrency(bestDays[0].revenue, account.currency)} הכנסה מ-${formatNumber(bestDays[0].count)} קמפיינים.`
              : "נזהה את היום החזק ביותר לפי הכנסות ורכישות.",
          },
          {
            label: "שעה טובה",
            value: bestHours[0]?.label ?? "אין מספיק נתונים",
            detail: bestHours[0]
              ? `${formatCurrency(bestHours[0].revenue, account.currency)} הכנסה ו-${formatNumber(bestHours[0].purchases)} רכישות.`
              : "נזהה שעות שליחה שחוזרות כבעלות ביצועים טובים.",
          },
          {
            label: "שורת נושא",
            value: subjectWinners[0]?.subject ?? "אין שורות נושא",
            tone: "good",
            detail: subjectWinners[0]
              ? `${formatNumber(subjectWinners[0].clicks)} קליקים, ${formatCurrency(subjectWinners[0].revenue, account.currency)} הכנסה.`
              : "כשיהיו קמפייני אימייל, נציג כאן את שורת הנושא החזקה.",
          },
          {
            label: "לשכפל",
            value: campaignToRepeat?.name ?? "אין קמפיין מוביל",
            tone: "good",
            detail: campaignToRepeat
              ? `${campaignToRepeat.channel}, ${formatCurrency(campaignToRepeat.revenue, account.currency)} הכנסה ו-${formatNumber(campaignToRepeat.purchases)} רכישות.`
              : "כשיהיה קמפיין עם הכנסה, נציג כאן מה לשכפל.",
          },
        ]}
      />

      <section className="grid gap-3 xl:grid-cols-3">
        <RankedInsightList
          title="ימים חזקים"
          items={bestDays.map((item) => ({
            label: item.label,
            value: formatCurrency(item.revenue, account.currency),
            meta: `${formatNumber(item.count)} קמפיינים · ${formatNumber(item.purchases)} רכישות`,
          }))}
        />
        <RankedInsightList
          title="שעות טובות"
          items={bestHours.map((item) => ({
            label: item.label,
            value: formatCurrency(item.revenue, account.currency),
            meta: `${formatNumber(item.clicks)} קליקים · ${formatNumber(item.purchases)} רכישות`,
          }))}
        />
        <RankedInsightList
          title="שורות נושא"
          items={subjectWinners.slice(0, 3).map((item) => ({
            label: item.subject || item.campaign,
            value: formatCurrency(item.revenue, account.currency),
            meta: `${formatPercent(item.openRate)} פתיחה · ${formatPercent(item.clickRate)} הקלקה`,
          }))}
        />
      </section>

      {showDeepAnalysis && (
      <>
      <DataTable
        title="שורות נושא שעבדו"
        columns={["שורת נושא", "קמפיין", "הכנסה", "קליקים", "מעורבות"]}
        rows={subjectWinners.map((item) => [
          item.subject,
          item.campaign,
          formatCurrency(item.revenue, account.currency),
          formatNumber(item.clicks),
          formatPercent(item.engagement),
        ])}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable
          title="קמפייני אימייל מובילים"
          columns={["קמפיין", "שורת נושא", "פתיחות", "אחוז פתיחה", "קליקים", "אחוז הקלקה", "הכנסה"]}
          rows={emailLeaders.map((item) => [
            item.campaignName,
            item.subjectLine,
            formatNumber(item.totalOpens),
            formatPercent(item.totalDelivered > 0 ? item.totalOpens / item.totalDelivered : 0),
            formatNumber(item.totalClicks),
            formatPercent(item.totalDelivered > 0 ? item.uniqueClicks / item.totalDelivered : 0),
            formatCurrency(item.revenueGenerated, account.currency),
          ])}
        />
        <DataTable
          title="קמפייני SMS מובילים"
          columns={["קמפיין", "נמענים", "קליקים", "עלות", "הכנסה"]}
          rows={smsLeaders.map((item) => [
            item.campaignName,
            formatNumber(item.totalRecipients),
            formatNumber(item.totalClicks),
            formatCurrency(
              item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
              account.currency,
            ),
            formatCurrency(item.revenueGenerated, account.currency),
          ])}
        />
      </div>

      <DataTable
        title="קמפיינים שדורשים בדיקה"
        columns={["קמפיין", "ערוץ", "קליקים", "עלות", "הכנסה", "ROAS"]}
        rows={weakCampaigns.map((item) => [
          item.name,
          item.channel,
          formatNumber(item.clicks),
          formatCurrency(item.cost, account.currency),
          formatCurrency(item.revenue, account.currency),
          item.cost > 0 ? `${(item.revenue / item.cost).toFixed(1)}x` : "ללא עלות",
        ])}
      />
      </>
      )}
    </div>
  );
}

function Planner({
  client,
  account,
  emails,
  sms,
  plans,
  onUpsertPlan,
}: {
  client: Client;
  account: FlashyAccount;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  plans: NewsletterPlan[];
  onUpsertPlan: (plan: NewsletterPlan) => void;
}) {
  const [month, setMonth] = useState(toDateInputValue(new Date()).slice(0, 7));
  const emptyDraft = {
    date: toDateInputValue(new Date()),
    channel: "email" as Channel,
    kind: "campaign" as CampaignKind,
    status: "draft" as PlanStatus,
    title: "",
    owner: "",
    notes: "",
    flashyUrl: "",
    assetUrl: "",
  };
  const [draft, setDraft] = useState({
    ...emptyDraft,
  });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  const [syncedHolidays, setSyncedHolidays] = useState<Record<string, SyncedHoliday[]>>({});
  const [saveState, setSaveState] = useState("");
  const monthPlans = plans.filter((plan) => isSameMonth(plan.date, month));
  const liveEvents = [
    ...emails
      .filter((item) => isSameMonth(item.sentAt, month))
      .map((item) => ({
        id: `live-email-${item.id}`,
        date: item.sentAt.slice(0, 10),
        title: item.campaignName,
        channel: "email" as Channel,
        source: "Flashy",
        status: "נשלח",
        planStatus: undefined,
        caption: `${formatNumber(item.totalRecipients)} נמענים · ${formatCurrency(
          item.revenueGenerated,
          account.currency,
        )}`,
      })),
    ...sms
      .filter((item) => isSameMonth(item.sentAt, month))
      .map((item) => ({
        id: `live-sms-${item.id}`,
        date: item.sentAt.slice(0, 10),
        title: item.campaignName,
        channel: "sms" as Channel,
        source: "Flashy",
        status: "נשלח",
        planStatus: undefined,
        caption: `${formatNumber(item.totalRecipients)} נמענים · ${formatCurrency(
          item.revenueGenerated,
          account.currency,
        )}`,
      })),
    ...monthPlans.map((plan) => ({
      id: `plan-${plan.id}`,
      date: plan.date,
      title: plan.title,
      channel: plan.channel,
      source: "תכנון",
      status: statusLabels[plan.status],
      planStatus: plan.status,
      caption: plan.notes || `${kindLabels[plan.kind]} · ${plan.owner || "ללא בעלים"}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const { start, end } = getMonthBounds(month);
  const holidayStartDate = toDateInputValue(start);
  const holidayEndDate = toDateInputValue(end);
  useEffect(() => {
    const controller = new AbortController();

    async function loadHolidays() {
      try {
        const params = new URLSearchParams({
          start: holidayStartDate,
          end: holidayEndDate,
          regions: "IL,US",
        });
        const response = await fetch(`/api/holidays?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Holiday sync failed");

        const byDate: Record<string, SyncedHoliday[]> = {};
        for (const holiday of payload.data.holidays as SyncedHoliday[]) {
          byDate[holiday.date] = [...(byDate[holiday.date] ?? []), holiday];
        }
        setSyncedHolidays(byDate);
      } catch {
        if (controller.signal.aborted) return;
        setSyncedHolidays({});
      }
    }

    loadHolidays();

    return () => controller.abort();
  }, [holidayEndDate, holidayStartDate]);
  const monthDays = Array.from({ length: end.getDate() }, (_, index) => {
    const date = new Date(start);
    date.setDate(index + 1);
    const dateKey = toDateInputValue(date);
    const syncedDayHolidays = syncedHolidays[dateKey];
    return {
      date,
      dateKey,
      events: liveEvents.filter((event) => event.date === dateKey),
      holidays: syncedDayHolidays?.length ? syncedDayHolidays : getHolidaysForDate(date, ["IL", "US"]),
    };
  });
  const calendarCells: Array<null | (typeof monthDays)[number]> = [
    ...Array.from({ length: start.getDay() }, () => null),
    ...monthDays,
  ];

  function editPlan(plan: NewsletterPlan) {
    setEditingPlanId(plan.id);
    setDraft({
      date: plan.date,
      channel: plan.channel,
      kind: plan.kind,
      status: plan.status,
      title: plan.title,
      owner: plan.owner,
      notes: plan.notes,
      flashyUrl: plan.flashyUrl ?? "",
      assetUrl: plan.assetUrl ?? "",
    });
    setSaveState("עורך פריט קיים.");
  }

  function startQuickPlan(title: string, channel: Channel = "email", date = `${month}-01`) {
    setEditingPlanId(null);
    setDraft({
      ...emptyDraft,
      date,
      channel,
      title,
    });
    setMonth(date.slice(0, 7));
    setSaveState("פתחתי טיוטה חדשה מההמלצה.");
  }

  async function savePlan() {
    if (!draft.title.trim()) {
      setSaveState("צריך להזין שם או רעיון לדיוור.");
      return;
    }

    const plan: NewsletterPlan = {
      id: editingPlanId ?? crypto.randomUUID(),
      clientId: client.id,
      accountId: account.id,
      date: draft.date,
      channel: draft.channel,
      kind: draft.kind,
      status: draft.status,
      title: draft.title.trim(),
      owner: draft.owner.trim(),
      notes: draft.notes.trim(),
      flashyUrl: draft.flashyUrl.trim() || undefined,
      assetUrl: draft.assetUrl.trim() || undefined,
    };

    try {
      const response = await fetch("/api/newsletter-plans", {
        method: editingPlanId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plan),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירה נכשלה");
      onUpsertPlan(payload.data as NewsletterPlan);
      setSaveState(editingPlanId ? "הפריט עודכן ונשמר." : "הפריט נוסף ונשמר.");
      setEditingPlanId(null);
      setDraft((current) => ({
        ...current,
        title: "",
        notes: "",
        flashyUrl: "",
        assetUrl: "",
      }));
    } catch (error) {
      if (!editingPlanId) onUpsertPlan(plan);
      setSaveState(
        error instanceof Error
          ? `הפעולה עודכנה במסך, אבל השמירה הקבועה נכשלה: ${error.message}`
          : "הפעולה עודכנה במסך, אבל השמירה הקבועה נכשלה.",
      );
    }
  }

  async function movePlanToDate(planId: string, date: string) {
    const plan = monthPlans.find((item) => item.id === planId);
    if (!plan || plan.date === date) return;

    const updatedPlan = { ...plan, date };
    onUpsertPlan(updatedPlan);
    setSaveState("הדיוור הוזז ביומן.");

    try {
      const response = await fetch("/api/newsletter-plans", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updatedPlan),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירה נכשלה");
      onUpsertPlan(payload.data as NewsletterPlan);
      setSaveState("התאריך עודכן ונשמר.");
    } catch (error) {
      onUpsertPlan(plan);
      setSaveState(
        error instanceof Error
          ? `ההזזה נכשלה והפריט הוחזר: ${error.message}`
          : "ההזזה נכשלה והפריט הוחזר.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#080123]">גאנט דיוורים חודשי</h2>
            <p className="mt-1 text-sm leading-6 text-[#65738a]">
              לחיצה על יום מוסיפה דיוור, לחיצה על פריט מתוכנן פותחת עריכה. קמפיינים מ־Flashy מוצגים לצד התכנון.
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 rounded-lg border border-[#cfd9e3] bg-white px-3 text-sm font-semibold text-[#080123] outline-none [color-scheme:light] focus:border-[#6fffe5] focus:ring-2 focus:ring-[#6fffe5]/30"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="grid grid-cols-7 border-b border-[#dfe7ee] bg-[#f4f7f6] text-center text-xs font-medium text-[#65738a]">
            {["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-7">
            {calendarCells.map((day, index) => (
              <article
                key={day?.dateKey ?? `blank-${index}`}
                className={classNames("group min-h-44 bg-white p-3 transition hover:bg-[#fbfcfc]", !day && "hidden lg:block")}
                onDragOver={(event) => {
                  if (day && draggingPlanId) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (day && draggingPlanId) {
                    movePlanToDate(draggingPlanId, day.dateKey);
                    setDraggingPlanId(null);
                  }
                }}
              >
                {day && (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-[#080123]">{day.date.getDate()}</span>
                        <span className="mr-2 text-xs text-slate-400">
                          {day.date.toLocaleDateString("he-IL", { weekday: "short" })}
                        </span>
                      </div>
                      <button
                        onClick={() => startQuickPlan("דיוור חדש", "email", day.dateKey)}
                        className="inline-flex items-center gap-1 rounded-full border border-[#080123] bg-[#080123] px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-black lg:border-[#dfe7ee] lg:bg-white lg:text-[#40506a] lg:shadow-none lg:hover:border-[#080123] lg:hover:bg-[#080123] lg:hover:text-white"
                      >
                        <span className="text-sm leading-none">+</span>
                        <span>דיוור</span>
                      </button>
                    </div>
                    {day.holidays.length > 0 && (
                      <div className="mb-2 grid gap-1">
                        {day.holidays.map((holiday) => (
                          <span
                            key={`${holiday.region}-${holiday.name}`}
                            className={classNames(
                              "inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-bold shadow-sm",
                              holiday.region === "IL"
                                ? "border-blue-200 bg-blue-100 text-blue-800"
                                : "border-violet-200 bg-violet-100 text-violet-800",
                            )}
                          >
                            {holiday.region === "IL" ? "ישראל" : "US"} · {holiday.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {day.events.slice(0, 4).map((event) => (
                        <button
                          key={event.id}
                          draggable={event.source === "תכנון"}
                          onDragStart={() => {
                            const planId = event.id.startsWith("plan-") ? event.id.replace("plan-", "") : null;
                            setDraggingPlanId(planId);
                          }}
                          onDragEnd={() => setDraggingPlanId(null)}
                          onClick={() => {
                            const plan = monthPlans.find((item) => `plan-${item.id}` === event.id);
                            if (plan) editPlan(plan);
                          }}
                          className={classNames(
                            "w-full rounded-md border p-2 text-right text-xs leading-5",
                            event.source === "Flashy"
                              ? "border-teal-100 bg-teal-50 text-teal-900"
                              : event.planStatus === "approved"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900 transition hover:border-emerald-300"
                                : event.planStatus === "ready"
                                  ? "border-cyan-200 bg-cyan-50 text-cyan-900 transition hover:border-cyan-300"
                                  : event.planStatus === "sent"
                                    ? "border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300"
                                    : "border-amber-200 bg-amber-50 text-amber-900 transition hover:border-amber-300",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{channelLabels[event.channel]}</span>
                            <span>{event.source}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 font-medium">{event.title}</p>
                          <p className="mt-1 text-[#65738a]">{event.caption}</p>
                        </button>
                      ))}
                      {day.events.length > 4 && (
                        <div className="text-xs font-medium text-[#65738a]">
                          ועוד {day.events.length - 4} פריטים
                        </div>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>

      {(editingPlanId || draft.title.trim()) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#080123]/70 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#dfe7ee] bg-white p-5 shadow-[0_24px_80px_rgba(8,1,35,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-[#080123]">
                {editingPlanId ? "עריכת פריט תכנון" : "הוספת רעיון או ניוזלטר"}
              </h3>
              <button
                onClick={() => {
                  setDraft({ ...emptyDraft, date: `${month}-01` });
                  setEditingPlanId(null);
                }}
                className="h-9 rounded-md bg-slate-100 px-3 text-sm font-medium text-[#263548] hover:bg-slate-200"
              >
                סגור
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#263548]">
                תאריך שליחה
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, date: event.target.value }));
                    setMonth(event.target.value.slice(0, 7));
                  }}
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                />
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                סטטוס
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, status: event.target.value as PlanStatus }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                >
                  {(Object.keys(statusLabels) as PlanStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                ערוץ
                <select
                  value={draft.channel}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, channel: event.target.value as Channel }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                >
                  <option value="email">אימייל</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                סוג
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, kind: event.target.value as CampaignKind }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                >
                  <option value="campaign">קמפיין</option>
                  <option value="automation">אוטומציה</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-[#263548] sm:col-span-2">
                נושא / רעיון
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="לדוגמה: ערך מכירתי - דיטוקס לנשימה"
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                />
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                בעלים
                <input
                  value={draft.owner}
                  onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                />
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                לינק Flashy
                <input
                  value={draft.flashyUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, flashyUrl: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
                  dir="ltr"
                />
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                לינק נכסים
                <input
                  value={draft.assetUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, assetUrl: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
                  dir="ltr"
                />
              </label>
              <label className="block text-sm font-medium text-[#263548] sm:col-span-2">
                הערות, החרגות, קופון
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-2 min-h-24 w-full rounded-md border border-[#dfe7ee] p-3 text-sm outline-none focus:border-[#6fffe5]"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={savePlan}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#080123] px-4 text-sm font-medium text-white hover:bg-black"
              >
                <CalendarDays size={16} />
                {editingPlanId ? "שמור שינויים" : "הוסף לגאנט"}
              </button>
              {saveState && <p className="text-sm text-[#65738a]">{saveState}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function buildAiInsights({
  clientId,
  account,
  summary,
  emails,
  sms,
  automations,
  plans,
}: {
  clientId: string;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}) {
  const insights: AiInsight[] = [...ruleBasedInsights(clientId, summary)];
  const smsRows = sms
    .map((item) => {
      const cost = item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate;
      return {
        name: item.campaignName,
        cost,
        revenue: item.revenueGenerated,
        roas: cost > 0 ? item.revenueGenerated / cost : null,
        recipients: item.totalRecipients,
      };
    })
    .filter((item) => item.cost > 0);
  const weakSms = [...smsRows].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0];
  const strongEmail = [...emails].sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  const strongAutomation = [...automations].sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  const weakAutomation = automations.find(
    (item) => (item.sentEmails ?? 0) + getAutomationSmsRecipients(item) > 0 && item.totalClicks === 0,
  );
  const plannedByDate = plans.reduce<Record<string, number>>((acc, plan) => {
    acc[plan.date] = (acc[plan.date] ?? 0) + 1;
    return acc;
  }, {});
  const crowdedPlanDate = Object.entries(plannedByDate).find(([, count]) => count >= 3);
  const plannedSmsCount = plans.filter((plan) => plan.channel === "sms").length;
  const plannedEmailCount = plans.filter((plan) => plan.channel === "email").length;

  if (strongEmail) {
    insights.unshift({
      id: `ai-email-winner-${clientId}`,
      clientId,
      category: "subject",
      priority: "high",
      title: "לשכפל זווית קמפיין מנצחת",
      body: `${strongEmail.campaignName} הוביל את האימיילים עם ${formatCurrency(
        strongEmail.revenueGenerated,
        account.currency,
      )} הכנסה ו-${formatNumber(strongEmail.totalClicks)} קליקים.`,
      action: "להוציא וריאציה נוספת עם אותו סוג הבטחה/מוצר, אבל לקהל שלא רכש בקמפיין המקורי.",
    });
  }

  if (weakSms && (weakSms.roas ?? 0) < 1) {
    insights.unshift({
      id: `ai-sms-risk-${clientId}`,
      clientId,
      category: "sms",
      priority: "high",
      title: "SMS עם החזר נמוך",
      body: `${weakSms.name} עלה ${formatCurrency(weakSms.cost, account.currency)} והחזיר ${formatCurrency(
        weakSms.revenue,
        account.currency,
      )}.`,
      action: "להפסיק שליחה רחבה דומה ולבדוק גרסה לקהל חם בלבד: נוטשי עגלה, רוכשים אחרונים או נרשמי וובינר.",
    });
  }

  if (strongAutomation) {
    insights.unshift({
      id: `ai-automation-winner-${clientId}`,
      clientId,
      category: "automation",
      priority: "medium",
      title: "אוטומציה שמייצרת ערך",
      body: `${strongAutomation.automationName} ייצרה ${formatCurrency(
        strongAutomation.revenueGenerated,
        account.currency,
      )} בתקופה הנבחרת.`,
      action: "לבדוק אם יש לה SMS/מייל המשך, ואם לא, להוסיף שלב פולואפ עדין אחרי קליק ללא רכישה.",
    });
  }

  if (weakAutomation) {
    insights.unshift({
      id: `ai-automation-weak-${clientId}`,
      clientId,
      category: "risk",
      priority: "medium",
      title: "אוטומציה נשלחת בלי תגובה",
      body: `${weakAutomation.automationName} שלחה הודעות בטווח הנבחר אבל לא יצרה קליקים.`,
      action: "לבדוק טריגר, תזמון ושורת נושא. אם זו אוטומציית SMS, לצמצם קהל לפני המשך שליחה.",
    });
  }

  if (crowdedPlanDate) {
    insights.unshift({
      id: `ai-planner-crowded-${clientId}`,
      clientId,
      category: "send_time",
      priority: "medium",
      title: "עומס בגאנט",
      body: `בתאריך ${new Date(crowdedPlanDate[0]).toLocaleDateString("he-IL")} מתוכננים ${crowdedPlanDate[1]} דיוורים.`,
      action: "לפצל חלק מהשליחות ליום סמוך כדי לא לשחוק את הקהל ולא לערבב מסרים.",
    });
  }

  if (plannedEmailCount >= 2 && plannedSmsCount === 0) {
    insights.unshift({
      id: `ai-planner-no-sms-${clientId}`,
      clientId,
      category: "sms",
      priority: "low",
      title: "אין SMS תומך בתכנון",
      body: `יש ${plannedEmailCount} פריטי אימייל מתוכננים אבל אין SMS מתוכנן לחודש הזה.`,
      action: "לבחור רק קמפיין אחד עם פוטנציאל מסחרי ולהוסיף SMS לקהל חם, לא לכל הרשימה.",
    });
  }

  return insights.slice(0, 8);
}

function answerAiQuestion({
  question,
  account,
  summary,
  emails,
  sms,
  automations,
  plans,
}: {
  question: string;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}) {
  const lowerQuestion = question.toLowerCase();
  const topEmail = [...emails].sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  const topSms = [...sms].sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];
  const topAutomation = [...automations].sort((a, b) => b.revenueGenerated - a.revenueGenerated)[0];

  if (lowerQuestion.includes("נושא") || lowerQuestion.includes("subject")) {
    return topEmail
      ? `שורת הנושא/זווית שכדאי ללמוד ממנה היא מהקמפיין "${topEmail.campaignName}". הוא ייצר ${formatCurrency(
          topEmail.revenueGenerated,
          account.currency,
        )} ו-${formatNumber(topEmail.totalClicks)} קליקים. הייתי בונה ממנו 2 וריאציות: אחת עם אותה הבטחה, ואחת עם דחיפות/מלאי.`
      : "אין מספיק קמפייני אימייל בטווח הנוכחי כדי לבחור שורת נושא מנצחת.";
  }

  if (lowerQuestion.includes("sms") || lowerQuestion.includes("סמס")) {
    return topSms
      ? `ב-SMS המנצח כרגע הוא "${topSms.campaignName}" עם ${formatCurrency(
          topSms.revenueGenerated,
          account.currency,
        )}. העלות הכוללת בטווח היא ${formatCurrency(summary.smsCost, account.currency)}, לכן הייתי ממשיך SMS רק לקהלים חמים ולא לשליחות רוחב בלי טריגר קנייה.`
      : answerFromData(question, summary);
  }

  if (lowerQuestion.includes("אוטומ")) {
    return topAutomation
      ? `האוטומציה החזקה היא "${topAutomation.automationName}" עם ${formatCurrency(
          topAutomation.revenueGenerated,
          account.currency,
        )}. הפעולה המומלצת: לבדוק האם יש לה המשך אחרי קליק ללא רכישה ולהוסיף פולואפ אם חסר.`
      : "אין מספיק נתוני אוטומציות בטווח הנוכחי.";
  }

  if (lowerQuestion.includes("גאנט") || lowerQuestion.includes("תכנון")) {
    return `בגאנט יש ${formatNumber(plans.length)} פריטים מתוכננים. כדי לשפר אותו הייתי בודק שאין כמה שליחות באותו יום, ושכל קמפיין מסחרי גדול מקבל תמיכה אחת בלבד ב-SMS לקהל חם.`;
  }

  return answerFromData(question, summary);
}

function AiAssistant({
  clientId,
  account,
  summary,
  emails,
  sms,
  automations,
  plans,
}: {
  clientId: string;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}) {
  const [workspaceTab, setWorkspaceTab] = useState<"brief" | "engine" | "memory">("brief");
  const [memory, setMemory] = useState<AiAccountMemory>({});
  const [insights, setInsights] = useState<AiInsight[]>(
    buildAiInsights({ clientId, account, summary, emails, sms, automations, plans }),
  );
  const opportunities = buildOpportunityEngine({ account, summary, emails, sms, automations, plans });
  const aiContext = buildAiContextPack({ account, summary, emails, sms, automations, plans, memory });
  const accountHealth = buildAccountHealth({ summary, emails, sms, automations, plans });
  const nextBestSend = buildNextBestSend({ context: aiContext, opportunities });
  const [recommendations, setRecommendations] = useState<AiActionRecommendation[]>([]);
  const [provider, setProvider] = useState("rule-based-fallback");
  const [providerError, setProviderError] = useState("");
  const [aiState, setAiState] = useState("מוכן לשאלות על החשבון.");
  const [memoryState, setMemoryState] = useState("");
  const [onboardingQuestions, setOnboardingQuestions] = useState<string[]>([]);
  const totalOpportunityPotential = opportunities.reduce((total, item) => total + item.potentialIls, 0);
  const opportunityLabels: Record<AiOpportunity["area"], string> = {
    campaigns: "קמפיינים",
    sms: "SMS",
    automations: "אוטומציות",
    planning: "תכנון",
  };
  const effortLabels: Record<AiOpportunity["effort"], string> = {
    low: "מאמץ נמוך",
    medium: "מאמץ בינוני",
    high: "מאמץ גבוה",
  };
  const healthLabels: Record<AccountHealth["grade"], string> = {
    excellent: "מצוין",
    good: "טוב",
    watch: "דורש תשומת לב",
    risk: "בסיכון",
  };
  const nextBestSendLabels: Record<NextBestSend["channel"], string> = {
    email: "אימייל",
    sms: "SMS",
    mixed: "משולב",
  };
  const memoryDocumentCount = memory.documents?.length ?? 0;
  const readinessScore =
    45 +
    Math.min(20, opportunities.length * 4) +
    Math.min(15, memoryDocumentCount * 5) +
    (provider === "openai" ? 20 : 0);
  const workspaceTabs = [
    { key: "brief", label: "תקציר פעולה", detail: "מה חשוב עכשיו" },
    { key: "engine", label: "מנוע הזדמנויות", detail: `${opportunities.length} הזדמנויות` },
    { key: "memory", label: "זיכרון לקוח", detail: `${memoryDocumentCount} מסמכים` },
  ] as const;
  const memoryProfileCards = [
    { title: "טון מותג", value: memory.brandVoice },
    { title: "קהלים", value: memory.audiences },
    { title: "מוצרים/קטגוריות", value: memory.products },
    { title: "מגבלות", value: memory.constraints },
  ].filter((item) => item.value?.trim());
  useEffect(() => {
    let cancelled = false;
    async function loadMemory() {
      try {
        const response = await fetch(`/api/ai/memory?clientId=${encodeURIComponent(clientId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled && payload.success) {
          setMemory(payload.data ?? {});
          setMemoryState(payload.persisted ? "זיכרון החשבון נטען." : "זיכרון מקומי עד שיוגדר DB/טבלה.");
        }
      } catch {
        if (!cancelled) setMemoryState("לא הצלחתי לטעון זיכרון חשבון.");
      }
    }

    loadMemory();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function runAi(mode: "recommendations" | "onboarding") {
    setAiState(
      mode === "recommendations"
        ? "מייצר המלצות..."
        : "סורק את מסמכי הלקוח...",
    );
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          mode,
          question: "",
          account,
          summary,
          emails,
          sms,
          automations,
          plans,
          memory,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "בקשת AI נכשלה");

      setInsights(payload.insights ?? insights);
      setRecommendations(payload.recommendations ?? recommendations);
      if (payload.onboarding) {
        const profile = payload.onboarding.profile as
          | {
              brandVoice?: string;
              audiences?: string[];
              products?: string[];
              positioning?: string;
              constraints?: string[];
              contentAngles?: string[];
              commercialMoments?: string[];
              missingInfo?: string[];
            }
          | undefined;
        setMemory((current) => ({
          ...current,
          onboardingSummary: payload.onboarding.summary ?? current.onboardingSummary,
          onboardingQuestions: payload.onboarding.questions ?? current.onboardingQuestions,
          brandVoice: profile?.brandVoice || current.brandVoice,
          audiences: profile?.audiences?.length ? profile.audiences.join("\n") : current.audiences,
          products: profile?.products?.length ? profile.products.join("\n") : current.products,
          constraints: profile?.constraints?.length ? profile.constraints.join("\n") : current.constraints,
          learnings: [
            current.learnings,
            profile?.positioning ? `מיצוב: ${profile.positioning}` : "",
            profile?.contentAngles?.length ? `זוויות תוכן: ${profile.contentAngles.join(", ")}` : "",
            profile?.commercialMoments?.length ? `רגעים מסחריים: ${profile.commercialMoments.join(", ")}` : "",
            profile?.missingInfo?.length ? `מידע חסר: ${profile.missingInfo.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        }));
        setOnboardingQuestions(payload.onboarding.questions ?? []);
      }
      setProvider(payload.provider);
      setProviderError(payload.providerError ?? "");
      setAiState(
        payload.provider === "openai"
          ? mode === "onboarding"
            ? "המסמכים נסרקו ונוצרו שאלות עומק."
            : "תשובה ממודל AI אמיתי."
          : payload.providerError || "תשובה מחישוב פנימי כי אין מפתח AI פעיל.",
      );
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "הסוכן נכשל, הוצגה תשובת fallback.");
      setAiState(error instanceof Error ? error.message : "הסוכן נכשל, הוצגה תשובת fallback.");
    }
  }

  async function saveMemory() {
    setMemoryState("שומר זיכרון חשבון...");
    try {
      const response = await fetch("/api/ai/memory", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, ...memory }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת זיכרון נכשלה");
      setMemory(payload.data ?? memory);
      setMemoryState(payload.persisted ? "זיכרון החשבון נשמר." : "נשמר למסך, אבל לא נשמר קבוע ב-DB.");
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "שמירת הזיכרון נכשלה.");
    }
  }

  async function addMemoryDocument(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setMemoryState("המסמך גדול מדי. עד 5MB למסמך.");
      return;
    }
    if (!file.name.match(/\.(txt|md|csv|json|pdf|docx)$/i)) {
      setMemoryState("אפשר להעלות TXT / Markdown / CSV / JSON / PDF / DOCX.");
      return;
    }

    setMemoryState(`מחלץ טקסט מתוך "${file.name}"...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ai/documents/parse", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "חילוץ המסמך נכשל");

      const document = payload.data as { name: string; content: string; createdAt: string };
      setMemory((current) => ({
        ...current,
        documents: [document, ...(current.documents ?? [])].slice(0, 8),
      }));
      setMemoryState(`המסמך "${file.name}" נוסף לזיכרון (${formatNumber(document.content.length)} תווים). לחץ שמור.`);
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "חילוץ המסמך נכשל.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_14px_34px_rgba(8,1,35,0.08)]">
        <div className="border-b border-[#edf2f6] bg-[#fbfdfc] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#35d7c5]">Agency AI</p>
              <h2 className="mt-1 text-2xl font-black text-[#080123]">Command Center</h2>
              <p className="mt-1 text-sm leading-6 text-[#65738a]">
                שכבת עבודה פנימית שמחברת דוחות Flashy, עלויות, גאנט וזיכרון לקוח.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
              <div className="rounded-xl border border-[#dfe7ee] bg-white p-3">
                <p className="text-xs font-bold text-[#65738a]">מודל</p>
                <p className="mt-1 font-black text-[#080123]">{provider === "openai" ? "OpenAI" : "Fallback"}</p>
              </div>
              <div className="rounded-xl border border-[#dfe7ee] bg-white p-3">
                <p className="text-xs font-bold text-[#65738a]">מוכנות AI</p>
                <p className="mt-1 font-black text-[#080123]">{Math.min(100, readinessScore)}%</p>
              </div>
              <div className="rounded-xl border border-[#dfe7ee] bg-white p-3">
                <p className="text-xs font-bold text-[#65738a]">פוטנציאל</p>
                <p className="mt-1 font-black text-[#007d72]">
                  {formatCurrency(totalOpportunityPotential, account.currency)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setWorkspaceTab(tab.key)}
                className={classNames(
                  "rounded-xl border px-4 py-3 text-right transition",
                  workspaceTab === tab.key
                    ? "border-[#35d7c5] bg-[#080123] text-white shadow-[0_10px_24px_rgba(8,1,35,0.18)]"
                    : "border-[#dfe7ee] bg-white text-[#080123] hover:border-[#35d7c5]",
                )}
              >
                <span className="block text-sm font-black">{tab.label}</span>
                <span className={classNames("mt-1 block text-xs", workspaceTab === tab.key ? "text-slate-300" : "text-[#65738a]")}>
                  {tab.detail}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
        {providerError && (
          <div className="mt-3 rounded-md bg-[#fff4db] p-3 text-sm leading-6 text-[#7a4b00]">
            {providerError}
          </div>
        )}
        <p className="mt-3 rounded-xl bg-[#f7faf9] px-3 py-2 text-xs font-bold text-[#65738a]">
          סטטוס: {aiState}
        </p>
        {workspaceTab === "brief" && (
          <>
        <section className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <article className="rounded-2xl border border-[#dfe7ee] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#080123]">Account Health</h3>
                <p className="mt-1 text-sm leading-6 text-[#65738a]">{accountHealth.summary}</p>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-[#65738a]">{healthLabels[accountHealth.grade]}</p>
                <p className="text-4xl font-black text-[#080123]">{accountHealth.score}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {accountHealth.checks.map((check) => (
                <div key={check.label} className="grid grid-cols-[86px_1fr_42px] items-center gap-2 text-xs">
                  <span className="font-bold text-[#080123]">{check.label}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eef3f7]">
                    <div
                      className={classNames(
                        "h-full rounded-full",
                        check.status === "good" && "bg-[#35d7c5]",
                        check.status === "watch" && "bg-[#fbbf24]",
                        check.status === "risk" && "bg-[#fb7185]",
                      )}
                      style={{ width: `${Math.max(5, Math.min(100, check.score))}%` }}
                    />
                  </div>
                  <span className="text-left font-bold text-[#65738a]">{check.score}</span>
                  <span className="col-span-3 text-[#65738a]">{check.note}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-[#b8fff3] bg-[#edfffb] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#080123]">Next Best Send</h3>
                <p className="mt-1 text-sm leading-6 text-[#40506a]">הפעולה הבאה הכי הגיונית לפי הדאטה וההזדמנויות.</p>
              </div>
              <span className="rounded-full bg-[#080123] px-3 py-1 text-sm font-bold text-white">
                {nextBestSendLabels[nextBestSend.channel]}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-[#65738a]">תזמון</p>
                <p className="mt-1 font-black text-[#080123]">{nextBestSend.timing}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-[#65738a]">קהל</p>
                <p className="mt-1 font-black text-[#080123]">{nextBestSend.audience}</p>
              </div>
              <div className="rounded-xl bg-white p-3 sm:col-span-2">
                <p className="text-xs font-bold text-[#65738a]">זווית</p>
                <p className="mt-1 font-black text-[#080123]">{nextBestSend.angle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#40506a]">{nextBestSend.reason}</p>
            <p className="mt-2 rounded-lg bg-white p-3 text-xs font-bold leading-5 text-[#7a4b00]">
              Guardrail: {nextBestSend.guardrail}
            </p>
          </article>
        </section>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => runAi("recommendations")}
            className="min-h-10 rounded-lg bg-[#080123] px-4 text-sm font-bold text-white transition hover:bg-[#17102f]"
          >
            <Sparkles className="ml-2 inline" size={16} />
            צור תכנית פעולה
          </button>
          <span className="text-xs text-[#65738a]">המלצות עם עדיפות, KPI וצעד ביצוע.</span>
        </div>
        {recommendations.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#b8fff3] bg-[#edfffb] p-4">
            <h3 className="text-lg font-black text-[#080123]">תכנית פעולה מומלצת</h3>
            <div className="mt-3 grid gap-3">
              {recommendations.map((item, index) => (
                <article key={`${item.title}-${index}`} className="rounded-lg border border-[#cfeee9] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-[#080123] px-2 py-1 text-white">
                          {item.priority === "high" ? "עדיפות גבוהה" : item.priority === "medium" ? "עדיפות בינונית" : "עדיפות נמוכה"}
                        </span>
                        <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[#65738a]">{item.area}</span>
                        <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[#65738a]">מאמץ {item.effort}</span>
                      </div>
                      <h4 className="text-base font-black text-[#080123]">{item.title}</h4>
                    </div>
                    <div className="text-left text-xs font-bold text-[#007d72]">{item.kpi}</div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#40506a]">{item.why}</p>
                  <div className="mt-3 rounded-md bg-[#f7faf9] p-3 text-sm leading-6 text-[#263548]">
                    <strong>מה עושים:</strong> {item.action}
                  </div>
                  <p className="mt-2 text-xs text-[#65738a]">השפעה צפויה: {item.expectedImpact}</p>
                </article>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 space-y-3">
          {insights.map((insight) => (
            <article key={insight.id} className="rounded-lg border border-[#dfe7ee] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-[#080123]">{insight.title}</h3>
                <span
                  className={classNames(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    insight.priority === "high" && "bg-rose-50 text-rose-700",
                    insight.priority === "medium" && "bg-amber-50 text-amber-700",
                    insight.priority === "low" && "bg-slate-100 text-[#40506a]",
                  )}
                >
                  {insight.priority}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#40506a]">{insight.body}</p>
              <p className="mt-3 rounded-md bg-[#f4f7f6] p-3 text-sm text-[#263548]">{insight.action}</p>
            </article>
          ))}
        </div>
          </>
        )}
        {workspaceTab === "engine" && (
        <div className="rounded-2xl border border-[#cfeee9] bg-[#edfffb] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-black text-[#080123]">Opportunity Engine</h3>
              <p className="mt-1 text-sm leading-6 text-[#40506a]">
                הזדמנויות שמחושבות מהדאטה: פוטנציאל, ביטחון, מאמץ וצעד הבא.
              </p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 text-left">
              <p className="text-xs font-bold text-[#65738a]">פוטנציאל מזוהה</p>
              <p className="mt-1 text-2xl font-black text-[#007d72]">
                {formatCurrency(totalOpportunityPotential, account.currency)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {opportunities.length ? (
              opportunities.map((item) => (
                <article key={item.id} className="rounded-xl border border-[#cfeee9] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-[#080123] px-2 py-1 text-white">
                          {opportunityLabels[item.area]}
                        </span>
                        <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[#65738a]">
                          {effortLabels[item.effort]}
                        </span>
                        <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[#65738a]">
                          ביטחון {formatPercent(item.confidence)}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-[#080123]">{item.title}</h4>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-[#65738a]">פוטנציאל</p>
                      <p className="text-lg font-black text-[#007d72]">
                        {formatCurrency(item.potentialIls, account.currency)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#40506a]">{item.evidence}</p>
                  <div className="mt-3 rounded-lg bg-[#f7faf9] p-3 text-sm leading-6 text-[#263548]">
                    <strong>מה עושים:</strong> {item.action}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[#65738a] sm:grid-cols-2">
                    <p>
                      <strong className="text-[#080123]">צעד הבא:</strong> {item.nextStep}
                    </p>
                    <p>
                      <strong className="text-[#080123]">KPI:</strong> {item.kpi}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-xl bg-white p-4 text-sm text-[#65738a]">
                לא נמצאו הזדמנויות חדות בטווח הנוכחי. נסה להרחיב טווח או לסנכרן עוד נתונים.
              </div>
            )}
          </div>
        </div>
        )}
        {workspaceTab === "memory" && (
          <div className="rounded-2xl border border-[#dfe7ee] bg-white p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-black text-[#080123]">זיכרון לקוח ומסמכים</h3>
                <p className="mt-1 text-sm leading-6 text-[#65738a]">
                  מעלים בריף, אסטרטגיה או מסמכי אפיון, ואז ה־AI מייצר שאלות עומק שמשפרות את ההמלצות.
                </p>
              </div>
              <button
                onClick={saveMemory}
                className="min-h-10 rounded-lg bg-[#080123] px-4 text-sm font-bold text-white"
              >
                שמור זיכרון
              </button>
            </div>
            {memoryProfileCards.length > 0 && (
              <div className="mb-4 rounded-2xl border border-[#b8fff3] bg-[#edfffb] p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007d72]">Client Profile</p>
                    <h4 className="mt-1 text-lg font-black text-[#080123]">פרופיל לקוח מובנה מהמסמכים</h4>
                  </div>
                  <p className="text-xs font-bold text-[#65738a]">נשמר לזיכרון ומשפיע על הצ׳אט וההמלצות.</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {memoryProfileCards.map((item) => (
                    <article key={item.title} className="rounded-xl bg-white p-3">
                      <h5 className="text-xs font-black text-[#65738a]">{item.title}</h5>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#263548]">{item.value}</p>
                    </article>
                  ))}
                </div>
                {memory.learnings?.trim() && (
                  <div className="mt-3 rounded-xl bg-white p-3">
                    <h5 className="text-xs font-black text-[#65738a]">מיצוב, זוויות ורגעים מסחריים</h5>
                    <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm leading-6 text-[#263548]">{memory.learnings}</p>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-2xl border border-[#dfe7ee] bg-[#fbfdfc] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-black text-[#080123]">מסמכי לקוח</h4>
                  <p className="mt-1 text-xs leading-5 text-[#65738a]">
                    תומך TXT/MD/CSV/JSON/PDF/DOCX. המסמכים נכנסים ל־Context של הסוכן.
                  </p>
                </div>
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-[#080123] px-4 text-sm font-bold text-white">
                  העלה מסמך
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void addMemoryDocument(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              <textarea
                placeholder="אפשר גם להדביק כאן תקציר אסטרטגיה או בריף לקוח."
                className="mt-4 min-h-28 w-full rounded-xl border border-[#dfe7ee] bg-white p-3 text-sm text-[#263548] outline-none focus:border-[#6fffe5]"
                onBlur={(event) => {
                  const content = event.currentTarget.value.trim();
                  if (!content) return;
                  const document = {
                    name: `תקציר ידני ${new Date().toLocaleDateString("he-IL")}`,
                    content,
                    createdAt: new Date().toISOString(),
                  };
                  setMemory((current) => ({
                    ...current,
                    documents: [document, ...(current.documents ?? [])].slice(0, 8),
                  }));
                  event.currentTarget.value = "";
                  setMemoryState("התקציר נוסף לזיכרון. לחץ שמור כדי לשמור קבוע.");
                }}
              />
              {(memory.documents ?? []).length > 0 && (
                <div className="mt-4 grid gap-2">
                  {(memory.documents ?? []).map((document, index) => (
                    <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[#080123]">{document.name}</p>
                        <p className="text-[#65738a]">{formatNumber(document.content.length)} תווים</p>
                      </div>
                      <button
                        onClick={() =>
                          setMemory((current) => ({
                            ...current,
                            documents: (current.documents ?? []).filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                        className="shrink-0 rounded-md bg-[#fff4db] px-2 py-1 font-bold text-[#7a4b00]"
                      >
                        הסר
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => runAi("onboarding")}
                disabled={(memory.documents ?? []).length === 0}
                className="mt-4 min-h-11 w-full rounded-lg bg-[oklch(82%_0.135_185)] px-4 text-sm font-black text-[#080123] disabled:cursor-not-allowed disabled:opacity-50"
              >
                סרוק מסמכים וצור שאלות עומק
              </button>
            </div>
            {(memory.onboardingSummary || onboardingQuestions.length > 0 || (memory.onboardingQuestions ?? []).length > 0) && (
              <div className="mt-4 rounded-2xl border border-[#dfe7ee] bg-[#fbfdfc] p-4">
                {memory.onboardingSummary && (
                  <>
                    <h4 className="text-sm font-black text-[#080123]">מה ה־AI הבין מהמסמכים</h4>
                    <p className="mt-2 text-sm leading-6 text-[#40506a]">{memory.onboardingSummary}</p>
                  </>
                )}
                <h4 className="mt-4 text-sm font-black text-[#080123]">שאלות עומק להשלמה</h4>
                <div className="mt-2 space-y-2">
                  {(onboardingQuestions.length ? onboardingQuestions : memory.onboardingQuestions ?? []).map((item, index) => (
                    <label key={`${item}-${index}`} className="block rounded-xl bg-white p-3 text-sm text-[#263548]">
                      <span className="font-black text-[#080123]">{item}</span>
                      <textarea
                        placeholder="תשובה קצרה שתיכנס לזיכרון החשבון"
                        className="mt-2 min-h-16 w-full rounded-md border border-[#dfe7ee] p-2 text-sm outline-none focus:border-[#6fffe5]"
                        onBlur={(event) => {
                          const value = event.currentTarget.value.trim();
                          if (!value) return;
                          setMemory((current) => ({
                            ...current,
                            learnings: [current.learnings, `שאלה: ${item}\nתשובה: ${value}`].filter(Boolean).join("\n\n"),
                          }));
                          event.currentTarget.value = "";
                          setMemoryState("התשובה נוספה ללמידות. לחץ שמור כדי לשמור קבוע.");
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {memoryState && <p className="mt-3 text-xs text-[#65738a]">{memoryState}</p>}
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

function FloatingAiChat({
  clientId,
  view,
  account,
  summary,
  emails,
  sms,
  automations,
  plans,
}: {
  clientId: string;
  view: ViewKey;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("אני מחובר ללקוח, לטווח הנתונים הנוכחי ולמסך שבו אתה נמצא. שאל אותי מה לבדוק.");
  const [provider, setProvider] = useState("rule-based-fallback");
  const [providerError, setProviderError] = useState("");
  const [state, setState] = useState("מוכן");
  const [memory, setMemory] = useState<AiAccountMemory>({});
  const viewLabels: Record<ViewKey, string> = {
    overview: "כללי",
    sms: "SMS",
    automations: "אוטומציות",
    campaigns: "קמפיינים",
    planner: "גאנט",
    ai: "AI",
    settings: "הגדרות",
    admin: "אדמין",
  };
  const quickQuestions = [
    view === "sms" ? "איזו שליחת SMS הייתי עוצר?" : "מה הדבר הכי חשוב לשפר עכשיו?",
    view === "campaigns" ? "איזה קמפיין כדאי לשכפל?" : "איפה יש הזדמנות מהירה?",
    view === "automations" ? "איזו אוטומציה דורשת טיפול?" : "מה להסביר ללקוח בפגישה?",
  ];

  useEffect(() => {
    let cancelled = false;
    async function loadMemory() {
      try {
        const response = await fetch(`/api/ai/memory?clientId=${encodeURIComponent(clientId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled && payload.success) setMemory(payload.data ?? {});
      } catch {
        if (!cancelled) setMemory({});
      }
    }

    loadMemory();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function askAi(overrideQuestion?: string) {
    const resolvedQuestion = (overrideQuestion ?? question).trim();
    if (!resolvedQuestion) {
      setState("צריך לכתוב שאלה.");
      return;
    }

    setOpen(true);
    setState("שואל את הסוכן...");
    try {
      const contextualQuestion = `המשתמש נמצא במסך "${viewLabels[view]}". ענה לפי ההקשר הזה: ${resolvedQuestion}`;
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          mode: "chat",
          question: contextualQuestion,
          account,
          summary,
          emails,
          sms,
          automations,
          plans,
          memory,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "בקשת AI נכשלה");

      setAnswer(payload.answer);
      setProvider(payload.provider);
      setProviderError(payload.providerError ?? "");
      setState(payload.provider === "openai" ? "OpenAI פעיל" : payload.providerError || "Fallback פעיל");
      setQuestion("");
    } catch (error) {
      setAnswer(answerAiQuestion({ question: resolvedQuestion, account, summary, emails, sms, automations, plans }));
      setProvider("rule-based-fallback");
      setProviderError(error instanceof Error ? error.message : "הסוכן נכשל, הוצגה תשובת fallback.");
      setState("Fallback פעיל");
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[calc(100vw-2rem)] max-w-[420px] text-right text-[#080123] md:bottom-6 md:left-6">
      {open && (
        <section className="mb-3 overflow-hidden rounded-2xl border border-[#dfe7ee] bg-white shadow-[0_22px_60px_rgba(8,1,35,0.26)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#edf2f6] bg-[#080123] p-4 text-white">
            <div>
              <p className="text-xs font-black text-[#35d7c5]">AI Assistant</p>
              <h2 className="mt-1 text-lg font-black">שאל על {viewLabels[view]}</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-lg bg-white/10 text-sm font-black hover:bg-white/15"
              aria-label="סגור צ׳אט"
            >
              ×
            </button>
          </div>
          <div className="p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickQuestions.map((item) => (
                <button
                  key={item}
                  onClick={() => askAi(item)}
                  className="rounded-full bg-[#f4f7f6] px-3 py-2 text-xs font-bold text-[#263548] hover:bg-[#e8efed]"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-xl bg-[#f7faf9] p-3 text-sm leading-6 text-[#263548]">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#65738a]">
                <Bot size={14} />
                <span>{state}</span>
                <span className="rounded-full bg-white px-2 py-0.5">
                  {provider === "openai" ? "OpenAI" : "Fallback"}
                </span>
              </div>
              <p>{answer}</p>
              {providerError && <p className="mt-2 text-xs text-[#7a4b00]">{providerError}</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="שאל שאלה על הנתונים..."
                className="min-h-11 flex-1 resize-none rounded-xl border border-[#dfe7ee] p-3 text-sm outline-none focus:border-[#6fffe5]"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void askAi();
                }}
              />
              <button
                onClick={() => askAi()}
                className="min-h-11 rounded-xl bg-[oklch(82%_0.135_185)] px-4 text-sm font-black text-[#080123]"
              >
                שלח
              </button>
            </div>
          </div>
        </section>
      )}
      <button
        onClick={() => setOpen((current) => !current)}
        className="mr-auto flex min-h-12 items-center gap-2 rounded-2xl bg-[oklch(82%_0.135_185)] px-4 text-sm font-black text-[#080123] shadow-[0_18px_44px_rgba(8,1,35,0.28)] transition hover:translate-y-[-1px]"
      >
        <Sparkles size={18} />
        שאל את ה־AI
      </button>
    </div>
  );
}

function ClientAiSummary({
  account,
  summary,
  emails,
  sms,
  automations,
  plans,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
}) {
  const opportunities = buildOpportunityEngine({ account, summary, emails, sms, automations, plans });
  const aiContext = buildAiContextPack({ account, summary, emails, sms, automations, plans, memory: {} });
  const accountHealth = buildAccountHealth({ summary, emails, sms, automations, plans });
  const nextBestSend = buildNextBestSend({ context: aiContext, opportunities });
  const healthLabels: Record<AccountHealth["grade"], string> = {
    excellent: "מצוין",
    good: "טוב",
    watch: "דורש תשומת לב",
    risk: "צריך טיפול",
  };
  const nextBestSendLabels: Record<NextBestSend["channel"], string> = {
    email: "אימייל",
    sms: "SMS",
    mixed: "אימייל + SMS",
  };
  const topItems = [
    ...emails.map((item) => ({
      id: `email-${item.id}`,
      title: item.campaignName,
      label: "קמפיין אימייל",
      revenue: item.revenueGenerated,
      metric: `${formatPercent(item.totalDelivered ? item.totalOpens / item.totalDelivered : 0)} פתיחה · ${formatPercent(
        item.totalDelivered ? item.uniqueClicks / item.totalDelivered : 0,
      )} הקלקה`,
    })),
    ...sms.map((item) => ({
      id: `sms-${item.id}`,
      title: item.campaignName,
      label: "קמפיין SMS",
      revenue: item.revenueGenerated,
      metric: `${formatNumber(item.uniqueClicks)} קליקים · ${formatRoas(
        item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate > 0
          ? item.revenueGenerated / (item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate)
          : null,
      )} ROAS`,
    })),
    ...automations.map((item) => ({
      id: `automation-${item.id}`,
      title: item.automationName,
      label: "אוטומציה",
      revenue: item.revenueGenerated,
      metric: `${formatNumber((item.sentEmails ?? 0) + getAutomationSmsRecipients(item))} שליחות`,
    })),
  ]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);
  const visibleOpportunities = opportunities.slice(0, 2);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-[#dfe7ee] bg-white shadow-[0_14px_34px_rgba(8,1,35,0.08)]">
        <div className="grid gap-px bg-[#e8eef4] md:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#65738a]">מצב החשבון</p>
                <h2 className="mt-1 text-3xl font-black text-[#080123]">{healthLabels[accountHealth.grade]}</h2>
              </div>
              <div className="rounded-2xl border border-[#b8fff3] bg-[#edfffb] px-4 py-3 text-center">
                <p className="text-xs font-black text-[#65738a]">ציון</p>
                <p className="text-3xl font-black text-[#007d72]">{accountHealth.score}</p>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[#40506a]">{accountHealth.summary}</p>
          </div>
          <div className="grid gap-px bg-[#e8eef4] sm:grid-cols-3 md:grid-cols-1">
            <div className="bg-white p-5">
              <p className="text-sm font-black text-[#65738a]">הכנסות</p>
              <p className="mt-1 text-2xl font-black text-[#080123]">
                {formatCurrency(summary.revenue, account.currency)}
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-sm font-black text-[#65738a]">ROAS</p>
              <p className="mt-1 text-2xl font-black text-[#080123]">{formatRoas(summary.roas)}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-sm font-black text-[#65738a]">רכישות</p>
              <p className="mt-1 text-2xl font-black text-[#080123]">{formatNumber(summary.purchases)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <h2 className="text-xl font-black text-[#080123]">מה עבד הכי טוב</h2>
          <div className="mt-4 grid gap-3">
            {topItems.length ? (
              topItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#edf2f6] bg-[#fbfdfc] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#65738a]">{item.label}</p>
                      <h3 className="mt-1 line-clamp-2 text-base font-black text-[#080123]">{item.title}</h3>
                    </div>
                    <p className="shrink-0 text-lg font-black text-[#007d72]">
                      {formatCurrency(item.revenue, account.currency)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#65738a]">{item.metric}</p>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-[#f7faf9] p-4 text-sm text-[#65738a]">אין עדיין מספיק נתונים להצגה.</p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#b8fff3] bg-[#edfffb] p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#080123]">מה עושים עכשיו</h2>
              <p className="mt-1 text-sm leading-6 text-[#40506a]">הפעולה הבאה המומלצת לפי ביצועי החשבון.</p>
            </div>
            <span className="rounded-full bg-[#080123] px-3 py-1 text-sm font-black text-white">
              {nextBestSendLabels[nextBestSend.channel]}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-black text-[#65738a]">תזמון מומלץ</p>
              <p className="mt-1 text-lg font-black text-[#080123]">{nextBestSend.timing}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-black text-[#65738a]">קהל</p>
              <p className="mt-1 text-lg font-black text-[#080123]">{nextBestSend.audience}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-black text-[#65738a]">כיוון תוכן</p>
              <p className="mt-1 text-lg font-black text-[#080123]">{nextBestSend.angle}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#40506a]">{nextBestSend.reason}</p>
        </article>
      </section>

      {visibleOpportunities.length > 0 && (
        <section className="rounded-2xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <h2 className="text-xl font-black text-[#080123]">התמקדות לשבוע הקרוב</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleOpportunities.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#edf2f6] bg-[#fbfdfc] p-4">
                <h3 className="text-base font-black text-[#080123]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#40506a]">{item.action}</p>
                <p className="mt-3 rounded-lg bg-white p-3 text-sm font-bold text-[#007d72]">{item.nextStep}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminPanel({
  clientName,
  onCreateLiveClient,
}: {
  clientName: string;
  onCreateLiveClient: (input: {
    clientName: string;
    clientEmail: string;
    smsCreditPriceUsd: number;
    monthlySubscriptionCostUsd: number;
    agencyRetainerCostIls: number;
    usdIlsRate: number;
    payload: LiveFlashyPayload;
  }) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [smsCreditPriceUsd, setSmsCreditPriceUsd] = useState("0.12");
  const [monthlySubscriptionCostUsd, setMonthlySubscriptionCostUsd] = useState("0");
  const [agencyRetainerCostIls, setAgencyRetainerCostIls] = useState("0");
  const [usdIlsRate, setUsdIlsRate] = useState("3.7");
  const [livePayload, setLivePayload] = useState<LiveFlashyPayload | null>(null);
  const [testState, setTestState] = useState<
    | { status: "idle" }
    | { status: "loading"; message: string }
    | { status: "success"; message: string; details: string[] }
    | { status: "error"; message: string; details?: string[] }
  >({ status: "idle" });

  async function testFlashyConnection() {
    if (!apiKey.trim()) {
      setTestState({ status: "error", message: "צריך להזין API key כדי לבדוק חיבור." });
      return;
    }

    setTestState({ status: "loading", message: "בודק את החשבון ומושך דוחות 31 יום אחורה..." });
    setLivePayload(null);

    try {
      const response = await fetch("/api/flashy/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: "acc-glow", apiKey }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "בדיקת החיבור נכשלה");
      }

      setLivePayload(payload);
      setNewClientName((current) => current || payload.account.name || payload.account.account || "");
      setNewAccountName((current) => current || payload.account.name || payload.account.account || "");
      setTestState({
        status: payload.hasWarnings ? "error" : "success",
        message: `החיבור תקין: ${payload.account.name || payload.account.account}`,
        details: [
          `מזהה חשבון Flashy: ${payload.account.id}`,
          `קרדיטים זמינים: ${payload.account.credits}`,
          ...(payload.checks ?? []).map(
            (check: { label: string; ok: boolean; count?: number; status?: number; message?: string }) =>
              check.ok
                ? `${check.label}: תקין (${check.count ?? 0})`
                : `${check.label}: נכשל${check.status ? ` ${check.status}` : ""} - ${
                    check.message || "אין פירוט מ-Flashy"
                  }`,
          ),
        ],
      });
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "לא ניתן לבדוק את החיבור",
      });
    }
  }

  async function createLiveClient() {
    if (!livePayload) return;
    const resolvedClientName =
      newClientName.trim() ||
      newAccountName.trim() ||
      livePayload.account.name ||
      livePayload.account.account ||
      "לקוח Flashy";

    onCreateLiveClient({
      clientName: resolvedClientName,
      clientEmail: clientEmail.trim(),
      smsCreditPriceUsd: Number(smsCreditPriceUsd) || 0,
      monthlySubscriptionCostUsd: Number(monthlySubscriptionCostUsd) || 0,
      agencyRetainerCostIls: Number(agencyRetainerCostIls) || 0,
      usdIlsRate: Number(usdIlsRate) || 3.7,
      payload: livePayload,
    });

    const details = [
      clientEmail.trim()
        ? `משתמש לקוח: ${clientEmail.trim()} (Magic Link בהמשך)`
        : "לא הוזן אימייל משתמש לקוח",
      "הדוחות במסכים כעת משתמשים בדאטה החי שנמשך מ-Flashy.",
    ];

    try {
      const response = await fetch("/api/live-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey,
          clientName: resolvedClientName,
          clientEmail: clientEmail.trim(),
          flashyAccount: livePayload.account,
          smsCreditPriceUsd: Number(smsCreditPriceUsd) || 0,
          monthlySubscriptionCostUsd: Number(monthlySubscriptionCostUsd) || 0,
          agencyRetainerCostIls: Number(agencyRetainerCostIls) || 0,
          usdIlsRate: Number(usdIlsRate) || 3.7,
        }),
      });
      const payload = await response.json();

      setTestState({
        status: response.ok ? "success" : "error",
        message: response.ok
          ? `נוצר ונשמר לקוח: ${resolvedClientName}`
          : `נוצר לקוח מקומי, אבל עדיין לא נשמר ב-Neon`,
        details: response.ok ? [...details, `Neon client id: ${payload.data.clientId}`] : [...details, payload.message],
      });
    } catch (error) {
      setTestState({
        status: "error",
        message: `נוצר לקוח מקומי, אבל השמירה ב-Neon נכשלה`,
        details: [
          ...details,
          error instanceof Error ? error.message : "שגיאת רשת בשמירה ל-Neon",
        ],
      });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <h2 className="text-xl font-bold text-[#080123]">הוספת חשבון Flashy</h2>
        <p className="mt-1 text-sm leading-6 text-[#65738a]">
          מצב הבדיקה לא שומר את המפתח. הוא מאמת את החשבון מול Flashy ומנסה למשוך דוחות
          מה־31 יום האחרונים.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-[#263548]">
            שם לקוח
            <input
              type="text"
              value={newClientName}
              onChange={(event) => setNewClientName(event.target.value)}
              placeholder="שם לקוח"
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            שם חשבון Flashy
            <input
              type="text"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
              placeholder="שם חשבון Flashy"
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            אימייל משתמש לקוח
            <input
              type="email"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              placeholder="client@example.com"
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            מחיר קרדיט SMS בדולר
            <input
              type="number"
              step="0.0001"
              value={smsCreditPriceUsd}
              onChange={(event) => setSmsCreditPriceUsd(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            עלות מנוי חודשית בדולר
            <input
              type="number"
              step="0.01"
              value={monthlySubscriptionCostUsd}
              onChange={(event) => setMonthlySubscriptionCostUsd(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            ריטיינר חודשי בשקל
            <input
              type="number"
              step="1"
              value={agencyRetainerCostIls}
              onChange={(event) => setAgencyRetainerCostIls(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            שער דולר/שקל
            <input
              type="number"
              step="0.01"
              value={usdIlsRate}
              onChange={(event) => setUsdIlsRate(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548] md:col-span-2">
            API key לבדיקה
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="הדבק כאן את המפתח מתוך Flashy"
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
        </div>
        <button
          onClick={testFlashyConnection}
          disabled={testState.status === "loading"}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#080123] px-3 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <KeyRound size={16} />
          {testState.status === "loading" ? "בודק..." : "בדוק חיבור חי"}
        </button>
        {livePayload && !livePayload.hasWarnings && (
          <button
            onClick={createLiveClient}
            className="mt-4 mr-2 inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"
          >
            <CheckCircle2 size={16} />
            פתח לקוח והצג דוחות
          </button>
        )}
        {testState.status !== "idle" && (
          <div
            className={classNames(
              "mt-4 rounded-lg p-3 text-sm leading-6",
              testState.status === "success" && "bg-emerald-50 text-emerald-800",
              testState.status === "error" && "bg-rose-50 text-rose-800",
              testState.status === "loading" && "bg-[#f4f7f6] text-[#263548]",
            )}
          >
            <p className="font-medium">{testState.message}</p>
            {"details" in testState && testState.details && (
              <ul className="mt-2 space-y-1">
                {testState.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <h2 className="text-xl font-bold text-[#080123]">הרשאות מודולים</h2>
        <p className="mt-1 text-sm text-[#65738a]">לקוח נבחר: {clientName}</p>
        <div className="mt-4 space-y-3">
          {(["reports", "planner", "ai"] as ModuleKey[]).map((moduleKey) => (
            <label
              key={moduleKey}
              className="flex items-center justify-between rounded-lg border border-[#dfe7ee] p-3"
            >
              <span className="text-sm font-medium text-[#263548]">
                {moduleKey === "reports" ? "דוחות" : moduleKey === "planner" ? "גאנט" : "AI"}
              </span>
              <input type="checkbox" defaultChecked className="size-4 accent-slate-950" />
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-[#f4f7f6] p-3 text-sm leading-6 text-[#40506a]">
          ביישום Neon + Auth.js, הבידוד ייאכף בצד שרת דרך שיוך `client_users` והרשאות באפליקציה.
        </div>
      </section>
    </div>
  );
}

function AccountSettings({
  client,
  account,
  onUpdateAccount,
}: {
  client: Client;
  account: FlashyAccount;
  onUpdateAccount: (account: FlashyAccount) => void;
}) {
  const [smsCreditPriceUsd, setSmsCreditPriceUsd] = useState(String(account.smsCreditPriceUsd));
  const [monthlySubscriptionCostUsd, setMonthlySubscriptionCostUsd] = useState(
    String(account.monthlySubscriptionCostUsd),
  );
  const [agencyRetainerCostIls, setAgencyRetainerCostIls] = useState(
    String(account.agencyRetainerCostIls),
  );
  const [usdIlsRate, setUsdIlsRate] = useState(String(account.usdIlsRate));
  const fixedMonthlyCostIls =
    (Number(monthlySubscriptionCostUsd) || 0) * (Number(usdIlsRate) || 3.7) +
    (Number(agencyRetainerCostIls) || 0);
  const [saveState, setSaveState] = useState<
    | { status: "idle"; message: string }
    | { status: "saving"; message: string }
    | { status: "success"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle", message: "" });

  async function saveSettings() {
    const updatedAccount: FlashyAccount = {
      ...account,
      smsCreditPriceUsd: Number(smsCreditPriceUsd) || 0,
      monthlySubscriptionCostUsd: Number(monthlySubscriptionCostUsd) || 0,
      agencyRetainerCostIls: Number(agencyRetainerCostIls) || 0,
      usdIlsRate: Number(usdIlsRate) || 3.7,
    };

    setSaveState({ status: "saving", message: "שומר הגדרות..." });
    onUpdateAccount(updatedAccount);

    try {
      const response = await fetch("/api/flashy/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          smsCreditPriceUsd: updatedAccount.smsCreditPriceUsd,
          monthlySubscriptionCostUsd: updatedAccount.monthlySubscriptionCostUsd,
          agencyRetainerCostIls: updatedAccount.agencyRetainerCostIls,
          usdIlsRate: updatedAccount.usdIlsRate,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "השמירה נכשלה");
      }

      setSaveState({ status: "success", message: "העלויות נשמרו לחשבון הנוכחי." });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "הנתונים עודכנו במסך, אבל השמירה הקבועה נכשלה.",
      });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#080123]">הגדרות חשבון</h2>
            <p className="mt-1 text-sm leading-6 text-[#65738a]">
              ההגדרות כאן מחוברות ללקוח שנבחר בסיידבר ומשפיעות מיד על חישובי ROAS ורווחיות.
            </p>
          </div>
          <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-[#40506a]">
            Flashy #{account.flashyAccountId}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-4">
            <p className="text-sm text-[#65738a]">סטטוס</p>
            <p className="mt-2 text-lg font-bold text-[#007d72]">{account.active ? "פעיל" : "כבוי"}</p>
            <p className="mt-1 text-xs text-[#65738a]">Flashy #{account.flashyAccountId}</p>
          </div>
          <div className="rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-4">
            <p className="text-sm text-[#65738a]">סנכרון אחרון</p>
            <p className="mt-2 text-lg font-bold text-[#080123]">
              {new Date(account.lastSyncAt).toLocaleDateString("he-IL")}
            </p>
            <p className="mt-1 text-xs text-[#65738a]">{new Date(account.lastSyncAt).toLocaleTimeString("he-IL")}</p>
          </div>
          <div className="rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-4">
            <p className="text-sm text-[#65738a]">עלות קבועה חודשית</p>
            <p className="mt-2 text-lg font-bold text-[#080123]">{formatCurrency(fixedMonthlyCostIls, "ILS")}</p>
            <p className="mt-1 text-xs text-[#65738a]">מנוי מומר + ריטיינר</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-[#263548]">
            מחיר קרדיט SMS בדולר
            <input
              type="number"
              step="0.0001"
              value={smsCreditPriceUsd}
              onChange={(event) => setSmsCreditPriceUsd(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            עלות מנוי חודשית בדולר
            <input
              type="number"
              step="0.01"
              value={monthlySubscriptionCostUsd}
              onChange={(event) => setMonthlySubscriptionCostUsd(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            ריטיינר חודשי בשקל
            <input
              type="number"
              step="1"
              value={agencyRetainerCostIls}
              onChange={(event) => setAgencyRetainerCostIls(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-medium text-[#263548]">
            שער דולר/שקל לחישוב עלויות
            <input
              type="number"
              step="0.01"
              value={usdIlsRate}
              onChange={(event) => setUsdIlsRate(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
              dir="ltr"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
          <button
            onClick={saveSettings}
            disabled={saveState.status === "saving"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#080123] px-4 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <CheckCircle2 size={16} />
            {saveState.status === "saving" ? "שומר..." : "שמור הגדרות"}
          </button>
          {saveState.message && (
            <p
              className={classNames(
                "text-sm",
                saveState.status === "success" && "text-emerald-700",
                saveState.status === "error" && "text-rose-700",
                saveState.status === "saving" && "text-[#65738a]",
              )}
            >
              {saveState.message}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <h2 className="text-xl font-bold text-[#080123]">חשבון פעיל</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">לקוח</dt>
            <dd className="font-medium text-[#080123]">{client.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">שם ב-Flashy</dt>
            <dd className="font-medium text-[#080123]">{account.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">מטבע</dt>
            <dd className="font-medium text-[#080123]">{account.currency}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">אזור זמן</dt>
            <dd className="font-medium text-[#080123]">{account.timezone}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">קרדיט SMS</dt>
            <dd className="font-medium text-[#080123]">{formatUsdDecimal(Number(smsCreditPriceUsd) || 0)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">מנוי חודשי</dt>
            <dd className="font-medium text-[#080123]">
              {formatUsdDecimal(Number(monthlySubscriptionCostUsd) || 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#65738a]">ריטיינר</dt>
            <dd className="font-medium text-[#080123]">
              {formatCurrency(Number(agencyRetainerCostIls) || 0, "ILS")}
            </dd>
          </div>
        </dl>
        <div className="mt-4 rounded-md bg-[#f4f7f6] p-3 text-sm leading-6 text-[#40506a]">
          עלות SMS ומנוי נשמרות בדולר ומומרות לשקלים בדוחות לפי שער הדולר. הריטיינר נשמר בשקלים ומופיע רק בדאשבורד הכללי.
        </div>
        <div className="mt-3 rounded-md bg-[#fff8e8] p-3 text-sm leading-6 text-[#7a4b00]">
          מפתח Flashy לא מוצג בדפדפן. בדיקת חיבור מלאה מתבצעת רק דרך צד השרת כדי לשמור על אבטחה.
        </div>
      </section>
    </div>
  );
}

function DataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
      <div className="border-b border-[#dfe7ee] p-4">
        <h2 className="text-lg font-bold text-[#080123]">{title}</h2>
      </div>
      <div className="divide-y divide-[#eef3f7] md:hidden">
        {rows.length ? (
          rows.map((row, rowIndex) => (
            <article key={rowIndex} className="p-4">
              <div className="mb-3 min-w-0">
                <p className="truncate text-sm font-bold text-[#080123]">{row[0]}</p>
                {row[1] && <p className="mt-1 truncate text-xs text-[#65738a]">{row[1]}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {row.slice(2, 8).map((cell, index) => (
                  <div key={`${rowIndex}-mobile-${index}`} className="rounded-lg bg-[#f4f7f6] p-2 text-xs">
                    <p className="text-[#65738a]">{columns[index + 2]}</p>
                    <p className="mt-1 truncate font-bold text-[#080123]">{cell}</p>
                  </div>
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="p-6 text-center text-sm text-[#65738a]">אין נתונים להצגה.</div>
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-[#f4f7f6] text-[#65738a]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-5 py-3 font-bold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f7] text-[#263548]">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[#f8fbfa]">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-5 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DashboardApp() {
  const [localClients, setLocalClients] = useState<Client[]>(clients);
  const [localAccounts, setLocalAccounts] = useState<FlashyAccount[]>(flashyAccounts);
  const [localEmailReports, setLocalEmailReports] = useState<EmailCampaignReport[]>(emailReports);
  const [localSmsReports, setLocalSmsReports] = useState<SmsCampaignReport[]>(smsReports);
  const [localAutomationReports, setLocalAutomationReports] =
    useState<AutomationReport[]>(automationReports);
  const [localNewsletterPlans, setLocalNewsletterPlans] =
    useState<NewsletterPlan[]>(newsletterPlans);
  const [selectedClientId, setSelectedClientId] = useState(localClients[0].id);
  const [view, setView] = useState<ViewKey>("overview");
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [clientView, setClientView] = useState(false);
  const [dataSource, setDataSource] = useState<"demo" | "neon" | "loading">("loading");
  const [dataNotice, setDataNotice] = useState("טוען נתונים מ-Neon...");
  const [authRequired, setAuthRequired] = useState(false);
  const [refreshState, setRefreshState] = useState("");
  const selectedClient =
    localClients.find((client) => client.id === selectedClientId) ?? localClients[0];
  const account =
    localAccounts.find((item) => item.clientId === selectedClient.id) ?? localAccounts[0];
  const allAccountEmails = byAccount(localEmailReports, account.id);
  const allAccountSms = byAccount(localSmsReports, account.id);
  const accountEmails = filterByTimeRange(
    allAccountEmails,
    timeRange,
    (item) => item.sentAt,
    customStartDate,
    customEndDate,
  );
  const accountSms = filterByTimeRange(
    allAccountSms,
    timeRange,
    (item) => item.sentAt,
    customStartDate,
    customEndDate,
  );
  const accountAutomationRows = filterByTimeRange(
    byAccount(localAutomationReports, account.id),
    timeRange,
    (item) => item.date,
    customStartDate,
    customEndDate,
  );
  const accountAutomations = consolidateAutomations(accountAutomationRows);
  const accountPlans = localNewsletterPlans.filter((plan) => plan.clientId === selectedClient.id);
  const summary = summarizeAccount(account, accountEmails, accountSms, accountAutomations);

  const visibleViews = views.filter((item) => {
    if (clientView && (item.key === "admin" || item.key === "settings")) return false;
    return !item.module || selectedClient.visibleModules.includes(item.module) || item.key === "admin";
  });
  const effectiveShowDeepAnalysis = clientView ? false : showDeepAnalysis;
  const showTimeRange = costViewKeys.includes(view);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const response = await fetch("/api/dashboard-data", { cache: "no-store" });
        const payload = await response.json();

        if (cancelled) return;
        if (!response.ok || !payload.success) {
          if (response.status === 401 || response.status === 403) {
            setAuthRequired(true);
            setDataSource("loading");
            setDataNotice(payload.message || "צריך להתחבר כדי לגשת לנתונים.");
            return;
          }
          setDataSource("demo");
          setDataNotice(payload.message || "אין חיבור Neon פעיל, מוצגים נתוני דמו.");
          return;
        }

        const data = payload.data as DashboardDataPayload;
        if (!data.clients.length || !data.accounts.length) {
          setDataSource("demo");
          setDataNotice("Neon מחובר, אבל עדיין אין לקוחות שמורים. מוצגים נתוני דמו.");
          return;
        }

        setLocalClients(data.clients);
        setLocalAccounts(data.accounts);
        setLocalEmailReports(data.emailReports);
        setLocalSmsReports(data.smsReports);
        setLocalAutomationReports(data.automationReports);
        setLocalNewsletterPlans(data.newsletterPlans);
        setSelectedClientId(data.clients[0].id);
        setAuthRequired(false);
        setDataSource("neon");
        setDataNotice(`נטענו ${data.clients.length} לקוחות מ-Neon.`);
      } catch (error) {
        if (!cancelled) {
          setDataSource("demo");
          setDataNotice(
            error instanceof Error ? error.message : "טעינת Neon נכשלה, מוצגים נתוני דמו.",
          );
        }
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshDashboardData() {
    setRefreshState("מרענן נתונים...");
    try {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) {
        setAuthRequired(true);
        throw new Error(payload.message || "צריך להתחבר כדי לגשת לנתונים.");
      }
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת הנתונים נכשלה");

      const data = payload.data as DashboardDataPayload;
      setLocalClients(data.clients);
      setLocalAccounts(data.accounts);
      setLocalEmailReports(data.emailReports);
      setLocalSmsReports(data.smsReports);
      setLocalAutomationReports(data.automationReports);
      setLocalNewsletterPlans(data.newsletterPlans);
      setAuthRequired(false);
      setDataSource("neon");
      setDataNotice(`רוענן עכשיו: ${data.clients.length} לקוחות מ-Neon.`);
      setRefreshState("הנתונים רועננו.");
    } catch (error) {
      setRefreshState(error instanceof Error ? error.message : "הרענון נכשל.");
    }
  }

  function createLiveClient(input: {
    clientName: string;
    clientEmail: string;
    smsCreditPriceUsd: number;
    monthlySubscriptionCostUsd: number;
    agencyRetainerCostIls: number;
    usdIlsRate: number;
    payload: LiveFlashyPayload;
  }) {
    const clientId = `live-client-${input.payload.account.id}`;
    const accountId = `live-account-${input.payload.account.id}`;
    const liveClient: Client = {
      id: clientId,
      name: input.clientName,
      owner: input.clientEmail || "לקוח",
      industry: "לקוח Flashy חי",
      visibleModules: ["reports", "planner", "ai"],
    };
    const liveAccount: FlashyAccount = {
      id: accountId,
      clientId,
      flashyAccountId: input.payload.account.id,
      name: input.payload.account.name || input.payload.account.account || input.clientName,
      website: input.payload.account.website || "",
      currency: input.payload.account.currency || "ILS",
      timezone: input.payload.account.timezone || "Asia/Jerusalem",
      credits: Number(input.payload.account.credits) || 0,
      usdIlsRate: input.usdIlsRate,
      smsCreditPriceUsd: input.smsCreditPriceUsd,
      monthlySubscriptionCostUsd: input.monthlySubscriptionCostUsd,
      agencyRetainerCostIls: input.agencyRetainerCostIls,
      active: true,
      lastSyncAt: new Date().toISOString(),
    };

    setLocalClients((current) => [
      liveClient,
      ...current.filter((client) => client.id !== clientId),
    ]);
    setLocalAccounts((current) => [
      liveAccount,
      ...current.filter((item) => item.id !== accountId),
    ]);
    setLocalEmailReports((current) => [
      ...normalizeEmailReports(input.payload.reports.emails, accountId),
      ...current.filter((item) => item.accountId !== accountId),
    ]);
    setLocalSmsReports((current) => [
      ...normalizeSmsReports(input.payload.reports.sms, accountId),
      ...current.filter((item) => item.accountId !== accountId),
    ]);
    setLocalAutomationReports((current) => [
      ...normalizeAutomationReports(input.payload.reports.automations, accountId),
      ...current.filter((item) => item.accountId !== accountId),
    ]);
    setDataSource("neon");
    setDataNotice("הלקוח נטען לדאשבורד. אם Neon מחובר, הוא גם נשמר בדאטאבייס.");
    setSelectedClientId(clientId);
    setView("overview");
  }

  function updateAccountSettings(updatedAccount: FlashyAccount) {
    setLocalAccounts((current) =>
      current.map((item) => (item.id === updatedAccount.id ? updatedAccount : item)),
    );
  }

  function upsertNewsletterPlan(plan: NewsletterPlan) {
    setLocalNewsletterPlans((current) => [
      plan,
      ...current.filter((item) => item.id !== plan.id),
    ]);
  }

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setView("overview");
  };

  if (authRequired) {
    return <LoginGate message={dataNotice} />;
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[oklch(12%_0.055_285)] text-[oklch(98%_0_0)] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_0_0,oklch(82%_0.135_185_/_0.12),transparent_28rem)]" />
      <Sidebar
        clients={localClients}
        selectedClientId={selectedClientId}
        visibleViews={visibleViews}
        view={view}
        account={account}
        dataSource={dataSource}
        dataNotice={dataNotice}
        clientView={clientView}
        onSelectClient={selectClient}
        onSelectView={setView}
      />

      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[oklch(100%_0_0_/_0.18)] bg-[oklch(9%_0.05_285_/_0.94)] px-4 py-3 backdrop-blur lg:hidden">
        <strong className="shrink-0 text-lg">FG</strong>
        <div className="flex max-w-[78vw] gap-2 overflow-x-auto">
          {visibleViews.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={classNames(
                "h-9 shrink-0 rounded-lg px-3 text-sm",
                view === item.key
                  ? "bg-[oklch(82%_0.135_185)] font-bold text-[oklch(15%_0.025_285)]"
                  : "bg-[oklch(100%_0_0_/_0.08)] text-[oklch(78%_0.015_285)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="relative min-w-0 p-3 md:p-5">
        <ClientSelector
          clients={localClients}
          selectedClientId={selectedClientId}
          onChange={selectClient}
          mobile
        />
        <header className="mb-4 flex flex-col items-start justify-between gap-3 lg:flex-row">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[oklch(78%_0.015_285)]">
              <span>Flashy Account #{account.flashyAccountId}</span>
              <span className="rounded-md bg-[oklch(82%_0.135_185)] px-2 py-1 font-bold text-[oklch(15%_0.025_285)]">פעיל</span>
              <span>סנכרון אחרון: {new Date(account.lastSyncAt).toLocaleString("he-IL")}</span>
            </div>
            <h1 className="m-0 text-[clamp(28px,3.5vw,48px)] font-bold leading-none tracking-normal text-white">
              {account.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setClientView((current) => !current);
                setShowDeepAnalysis(false);
                if (!clientView && (view === "settings" || view === "admin")) setView("overview");
              }}
              className={classNames(
                "min-h-10 rounded-lg px-4 text-sm font-bold",
                clientView
                  ? "bg-[oklch(82%_0.135_185)] text-[oklch(15%_0.025_285)]"
                  : "border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.08)] text-white",
              )}
            >
              {clientView ? "תצוגת לקוח" : "תצוגת סוכנות"}
            </button>
            {!clientView && <button
              onClick={refreshDashboardData}
              className="min-h-10 rounded-lg border border-[oklch(100%_0_0_/_0.18)] bg-[oklch(100%_0_0_/_0.08)] px-4 text-sm text-white"
            >
              <RefreshCw className="ml-2 inline" size={16} />
              רענון
            </button>}
            {!clientView && <button
              onClick={() => setView("ai")}
              className="min-h-10 rounded-lg bg-[oklch(82%_0.135_185)] px-4 text-sm font-bold text-[oklch(15%_0.025_285)]"
            >
              <Sparkles className="ml-2 inline" size={16} />
              צור המלצה
            </button>}
          </div>
          {refreshState && <p className="text-sm text-[oklch(78%_0.015_285)]">{refreshState}</p>}
        </header>

        <div>
          {showTimeRange && (
            <section className="mb-4 rounded-xl border border-[#dfe7ee] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                    {timeRanges.map((range) => (
                      <button
                        key={range.key}
                        onClick={() => setTimeRange(range.key)}
                        className={classNames(
                          "h-9 min-w-16 rounded-md px-3 text-sm font-medium transition",
                          timeRange === range.key
                            ? "bg-[#080123] text-white"
                            : "bg-[#eef3f7] text-[#263548] hover:bg-[#dfe7ee]",
                        )}
                      >
                        {range.label}
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {!clientView && costViewKeys.includes(view) && (
                    <button
                      onClick={() => setShowDeepAnalysis((current) => !current)}
                      className={classNames(
                        "h-9 rounded-md px-3 text-sm font-bold transition",
                        showDeepAnalysis
                          ? "bg-[#080123] text-white"
                          : "bg-[#eef3f7] text-[#263548] hover:bg-[#dfe7ee]",
                      )}
                    >
                      {showDeepAnalysis ? "הסתר פירוט" : "פירוט נוסף"}
                    </button>
                  )}
                  {timeRange === "custom" && (
                    <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[320px]">
                      <label className="block text-xs font-medium text-[#65738a]">
                        <span className="mb-1 block">מ־</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(event) => setCustomStartDate(event.target.value)}
                          className="h-10 w-full rounded-md border border-[#dfe7ee] px-2 text-sm text-[#263548] outline-none focus:border-[#6fffe5]"
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#65738a]">
                        <span className="mb-1 block">עד</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(event) => setCustomEndDate(event.target.value)}
                          className="h-10 w-full rounded-md border border-[#dfe7ee] px-2 text-sm text-[#263548] outline-none focus:border-[#6fffe5]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
          {view === "overview" && (
            clientView ? (
              <ClientOverview
                account={account}
                summary={summary}
                emails={accountEmails}
                sms={accountSms}
                automations={accountAutomations}
              />
            ) : (
              <Overview
                account={account}
                summary={summary}
                emails={accountEmails}
                sms={accountSms}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
            )
          )}
          {view === "sms" && (
            clientView ? (
              <ClientSmsDashboard
                account={account}
                sms={accountSms}
                automations={accountAutomations}
              />
            ) : (
              <SmsDashboard
                account={account}
                sms={accountSms}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
            )
          )}
          {view === "automations" && (
            clientView ? (
              <ClientAutomationDashboard
                account={account}
                automations={accountAutomations}
              />
            ) : (
              <AutomationDashboard
                account={account}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
            )
          )}
          {view === "campaigns" && (
            clientView ? (
              <ClientCampaignDashboard
                account={account}
                emails={accountEmails}
                sms={accountSms}
              />
            ) : (
              <CampaignDashboard
                account={account}
                emails={accountEmails}
                sms={accountSms}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
            )
          )}
          {view === "planner" && (
            <Planner
              client={selectedClient}
              account={account}
              emails={allAccountEmails}
              sms={allAccountSms}
              plans={accountPlans}
              onUpsertPlan={upsertNewsletterPlan}
            />
          )}
          {view === "ai" && (
            clientView ? (
              <ClientAiSummary
                account={account}
                summary={summary}
                emails={accountEmails}
                sms={accountSms}
                automations={accountAutomations}
                plans={accountPlans}
              />
            ) : (
              <AiAssistant
                clientId={selectedClient.id}
                account={account}
                summary={summary}
                emails={accountEmails}
                sms={accountSms}
                automations={accountAutomations}
                plans={accountPlans}
              />
            )
          )}
          {view === "settings" && (
            <AccountSettings
              key={account.id}
              client={selectedClient}
              account={account}
              onUpdateAccount={updateAccountSettings}
            />
          )}
          {view === "admin" && (
            <AdminPanel
              clientName={selectedClient.name}
              onCreateLiveClient={createLiveClient}
            />
          )}
        </div>
      </main>
      {!clientView && (
        <FloatingAiChat
          clientId={selectedClient.id}
          view={view}
          account={account}
          summary={summary}
          emails={accountEmails}
          sms={accountSms}
          automations={accountAutomations}
          plans={accountPlans}
        />
      )}
    </div>
  );
}
