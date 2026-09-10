"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  LineChart,
  MessageSquareText,
  Minus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  chartColors,
  EngagementPlot,
  PeriodComparisonChart,
  RankedBars,
  SmsReturnChart,
  RevenueShareChart,
  WeekdayBars,
  type PeriodComparisonPoint,
} from "@/components/reporting-charts";
import { campaignTiming, measuredRate } from "@/lib/report-chart-data";
import { accountDate, accountLocalTimestamp, reportRange, reportDateInstant } from "@/lib/report-time";
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
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return "";

    const messages: Record<string, string> = {
      CredentialsSignin: "האימייל או הסיסמה אינם נכונים.",
      AccessDenied: "האימייל אינו מורשה להיכנס לחשבון הזה.",
    };

    return messages[error] ?? "הכניסה לא הושלמה. בדוק את הפרטים ונסה שוב.";
  });

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = email.trim();
    if (!identifier || !password) {
      setState("צריך להזין אימייל וסיסמה.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setState("מתחבר...");
    try {
    const result = await signIn("password", {
      email: identifier,
      password,
      redirect: false,
      callbackUrl: "/",
    });

    if (!result?.ok || result.error) {
      setState("פרטי הכניסה אינם תקינים, או שבוצעו ניסיונות רבים. אפשר לנסות שוב בעוד 15 דקות או לפנות למנהל המערכת.");
      return;
    }

    window.location.href = result?.url || "/";
    } catch {
      setState("לא ניתן להתחבר כרגע. נסה שוב בעוד רגע.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[oklch(9%_0.05_285)] px-4 text-white"
    >
      <section className="w-full max-w-md rounded-xl border border-[#e4e7ec] bg-white p-7 text-[#111318] shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#65738a]">Flashy Growth Desk</p>
            <h1 className="mt-1 text-3xl font-black tracking-normal">כניסה לדאשבורד</h1>
          </div>
          <div className="grid size-11 place-items-center rounded-lg bg-[#42dfcf] text-base font-black">
            FG
          </div>
        </div>

        <p className="mb-5 border-r-2 border-[#42dfcf] bg-[#f8fafb] px-4 py-3 text-sm leading-6 text-[#475467]">
          {message || "היכנסו עם האימייל והסיסמה שהוגדרו עבורכם."}
        </p>

        <form onSubmit={submitLogin} className="space-y-3">
          <label className="block text-sm font-bold text-[#263548]">
            אימייל
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@addz.digital"
              autoComplete="username"
              required
              maxLength={254}
              className="mt-2 h-11 w-full rounded-lg border border-[#d0d5dd] px-3.5 text-left text-base outline-none transition focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-bold text-[#263548]">
            סיסמה
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="הסיסמה שלך"
              autoComplete="current-password"
              required
              maxLength={128}
              className="mt-2 h-11 w-full rounded-lg border border-[#d0d5dd] px-3.5 text-left text-base outline-none transition focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-lg bg-[#0b0c10] text-sm font-bold text-white transition hover:bg-[#24262d]"
          >
            {submitting ? "מתחבר..." : "כניסה"}
          </button>
        </form>

        {state && <p role="status" className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#4a5870]">{state}</p>}
        <p className="mt-4 text-xs text-[#667085]">שכחת סיסמה? פנה למנהל החשבון בסוכנות.</p>
      </section>
    </div>
  );
}

function LiveDataIssue({ message }: { message: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[oklch(9%_0.05_285)] px-4 text-white"
    >
      <section className="w-full max-w-lg rounded-xl border border-[#e4e7ec] bg-white p-7 text-[#111318] shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <p className="text-sm font-bold text-[#65738a]">Flashy Growth Desk</p>
        <h1 className="mt-1 text-3xl font-black tracking-normal">הנתונים החיים לא נטענו</h1>
        <p className="mt-4 rounded-2xl border border-[#dfe7ee] bg-[#f7fafc] p-4 text-sm leading-6 text-[#4a5870]">
          {message}
        </p>
        <p className="mt-4 text-sm leading-6 text-[#65738a]">
          אחרי תיקון הרשאות או שיוך לקוח, רענן את העמוד.
        </p>
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
  return value != null && Number.isFinite(value) ? `${value.toFixed(1)}x` : "אין עלות";
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

function filterByTimeRange<T>(items: T[], rangeKey: TimeRangeKey, getDate: (item: T) => string, customStartDate: string, customEndDate: string, timezone: string) {
  const bounds = getTimeRangeBounds(rangeKey, customStartDate, customEndDate, timezone);
  return filterByBounds(items, bounds, getDate, timezone);
}

function filterByBounds<T>(
  items: T[],
  bounds: { start: string; end: string },
  getDate: (item: T) => string,
  timezone: string,
) {
  return items.filter(item => {
    const date = new Date(reportDateInstant(getDate(item), timezone)).getTime();
    return (!bounds.start || date >= Date.parse(bounds.start)) && (!bounds.end || date <= Date.parse(bounds.end));
  });
}

function getTimeRangeBounds(rangeKey: TimeRangeKey, customStartDate: string, customEndDate: string, timezone: string) {
  if (rangeKey === "all") return { start: "", end: "" };
  if (rangeKey === "custom") return {
    start: customStartDate ? accountLocalTimestamp(customStartDate, "00:00:00", timezone) : "",
    end: customEndDate ? accountLocalTimestamp(customEndDate, "23:59:59", timezone) : "",
  };
  return reportRange(timeRanges.find(item => item.key === rangeKey)?.days ?? 30, timezone);
}

function shiftCalendarDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPreviousRangeBounds(
  bounds: { start: string; end: string },
  timezone: string,
) {
  if (!bounds.start || !bounds.end) return null;
  const currentStart = accountDate(new Date(bounds.start), timezone);
  const currentEnd = accountDate(new Date(bounds.end), timezone);
  const durationDays =
    Math.round((Date.parse(currentEnd) - Date.parse(currentStart)) / 86_400_000) + 1;
  if (!Number.isFinite(durationDays) || durationDays < 1) return null;

  const previousEnd = shiftCalendarDate(currentStart, -1);
  const previousStart = shiftCalendarDate(previousEnd, -durationDays + 1);
  return {
    start: accountLocalTimestamp(previousStart, "00:00:00", timezone),
    end: accountLocalTimestamp(previousEnd, "23:59:59", timezone),
  };
}

function enumerateCalendarDates(bounds: { start: string; end: string }, timezone: string) {
  const start = accountDate(new Date(bounds.start), timezone);
  const end = accountDate(new Date(bounds.end), timezone);
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftCalendarDate(date, 1)) dates.push(date);
  return dates;
}

function buildPeriodComparisonPoints({
  currentBounds,
  previousBounds,
  currentEmails,
  currentSms,
  currentAutomations,
  previousEmails,
  previousSms,
  previousAutomations,
  timezone,
}: {
  currentBounds: { start: string; end: string };
  previousBounds: { start: string; end: string };
  currentEmails: EmailCampaignReport[];
  currentSms: SmsCampaignReport[];
  currentAutomations: AutomationReport[];
  previousEmails: EmailCampaignReport[];
  previousSms: SmsCampaignReport[];
  previousAutomations: AutomationReport[];
  timezone: string;
}): PeriodComparisonPoint[] {
  type DailyRevenue = { email: number; sms: number; automations: number };
  const current = new Map<string, DailyRevenue>();
  const previous = new Map<string, DailyRevenue>();
  const add = (
    target: Map<string, DailyRevenue>,
    dateValue: string,
    channel: keyof DailyRevenue,
    revenue: number,
  ) => {
    const date = accountDate(new Date(reportDateInstant(dateValue, timezone)), timezone);
    const day = target.get(date) ?? { email: 0, sms: 0, automations: 0 };
    day[channel] += revenue;
    target.set(date, day);
  };

  currentEmails.forEach((item) => add(current, item.sentAt, "email", item.revenueGenerated));
  currentSms.forEach((item) => add(current, item.sentAt, "sms", item.revenueGenerated));
  currentAutomations.forEach((item) => add(current, item.date, "automations", item.revenueGenerated));
  previousEmails.forEach((item) => add(previous, item.sentAt, "email", item.revenueGenerated));
  previousSms.forEach((item) => add(previous, item.sentAt, "sms", item.revenueGenerated));
  previousAutomations.forEach((item) => add(previous, item.date, "automations", item.revenueGenerated));

  const currentDates = enumerateCalendarDates(currentBounds, timezone);
  const previousDates = enumerateCalendarDates(previousBounds, timezone);
  const dateFormatter = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" });

  return currentDates.map((date, index) => {
    const currentDay = current.get(date) ?? { email: 0, sms: 0, automations: 0 };
    const previousDay = previous.get(previousDates[index]) ?? { email: 0, sms: 0, automations: 0 };
    return {
      label: dateFormatter.format(new Date(`${date}T12:00:00Z`)),
      ...currentDay,
      previousTotal: previousDay.email + previousDay.sms + previousDay.automations,
    };
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
  viewer?: {
    canManageUsers?: boolean;
    email: string;
    role: "admin" | "client";
  };
  clients: Client[];
  accounts: FlashyAccount[];
  emailReports: EmailCampaignReport[];
  smsReports: SmsCampaignReport[];
  automationReports: AutomationReport[];
  newsletterPlans: NewsletterPlan[];
};

type AdminUserAccess = {
  isOwner: boolean;
  id: string;
  name: string;
  email: string;
  role: "admin" | "client";
  hasPassword: boolean;
  createdAt: string;
  clients: {
    linkId: string;
    clientId: string | null;
    clientName: string;
    createdAt: string;
  }[];
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
    <article className="min-w-0 rounded-xl border border-[#e4e7ec] bg-white p-3 text-[#111318] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#667085]">{title}</p>
          <p className="mt-2 text-2xl font-bold leading-none tabular-nums tracking-normal sm:text-3xl">{value}</p>
        </div>
        <div
          className={classNames(
            "hidden size-8 place-items-center rounded-md sm:grid",
            tone === "good" && "bg-[#ecfdf9] text-[#087f72]",
            tone === "warn" && "bg-[#fff7ed] text-[#b45309]",
            tone === "neutral" && "bg-[#f2f4f7] text-[#475467]",
          )}
        >
          <Icon size={16} strokeWidth={1.8} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#667085]">{caption}</p>
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

interface FlashyReconcileResult {
  stored: {
    emailCampaigns: number;
    smsCampaigns: number;
    automations: number;
    emailRevenue: number;
    smsRevenue: number;
    campaignRevenue: number;
    automationRevenue: number;
  };
  flashy: {
    emailCampaigns: number;
    smsCampaigns: number;
    automations: number;
    emailRevenue: number;
    smsRevenue: number;
    campaignRevenue: number;
    automationRevenue: number;
  };
  delta: {
    campaignRevenue: number;
    automationRevenue: number;
  };
  campaignDifferences: {
    name: string;
    storedRevenue: number;
    liveRevenue: number;
    delta: number;
  }[];
  boundaryCampaignCandidates: {
    name: string;
    revenue: number;
  }[];
}

function comparisonChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (previous === 0) {
    if (current === 0) return { direction: "same" as const, label: "ללא שינוי" };
    return { direction: current > 0 ? "up" as const : "down" as const, label: "חדש" };
  }
  const change = (current - previous) / Math.abs(previous);
  if (Math.abs(change) < 0.0005) return { direction: "same" as const, label: "ללא שינוי" };
  return {
    direction: change > 0 ? "up" as const : "down" as const,
    label: `${formatPercent(Math.abs(change))} ${change > 0 ? "עלייה" : "ירידה"}`,
  };
}

function KPIGrid({
  account,
  summary,
  previousSummary,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
}) {
  const totalCost = summary.smsCost + summary.fixedCosts;
  const metrics = [
    {
      label: "הכנסות מפעילות",
      value: formatCurrency(summary.revenue, account.currency),
      rawValue: summary.revenue,
      previousValue: previousSummary?.revenue ?? null,
      formatPrevious: (value: number) => formatCurrency(value, account.currency),
      detail: "קמפיינים שנשלחו ואוטומציות שפעלו בטווח",
      tone: "good" as const,
    },
    {
      label: "רווח",
      value: formatCurrency(summary.profit, account.currency),
      rawValue: summary.profit,
      previousValue: previousSummary?.profit ?? null,
      formatPrevious: (value: number) => formatCurrency(value, account.currency),
      detail: `אחרי ${formatCurrency(totalCost, account.currency)} עלות`,
      tone: summary.profit >= 0 ? "good" as const : "warn" as const,
    },
    {
      label: "ROAS",
      value: formatRoas(summary.roas),
      rawValue: summary.roas,
      previousValue: previousSummary?.roas ?? null,
      formatPrevious: (value: number) => formatRoas(value),
      detail: "כולל SMS ועלויות קבועות",
      tone: "good" as const,
    },
    {
      label: "רכישות",
      value: formatNumber(summary.purchases),
      rawValue: summary.purchases,
      previousValue: previousSummary?.purchases ?? null,
      formatPrevious: (value: number) => formatNumber(value),
      detail: `Conversion ${formatPercent(summary.conversionRate)}`,
      tone: "neutral" as const,
    },
  ];

  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white xl:grid-cols-4">
      {metrics.map((metric) => {
        const comparison = comparisonChange(metric.rawValue, metric.previousValue);
        const ComparisonIcon = comparison?.direction === "up"
          ? ArrowUpRight
          : comparison?.direction === "down"
            ? ArrowDownRight
            : Minus;

        return (
          <article
            key={metric.label}
            className="min-w-0 border-b border-l border-[#e4e7ec] p-3.5 text-[#111318] even:border-l-0 xl:border-b-0 xl:p-4 xl:even:border-l xl:last:border-l-0"
          >
            <p className="text-xs font-medium text-[#667085]">{metric.label}</p>
            <p
              className={classNames(
                "mt-2 text-2xl font-bold leading-none tabular-nums tracking-normal sm:text-3xl",
                metric.tone === "good" && "text-[#111318]",
                metric.tone === "warn" && "text-[#9a3412]",
                metric.tone === "neutral" && "text-[#111318]",
              )}
            >
              {metric.value}
            </p>
            {comparison && metric.previousValue !== null && (
              <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
                <span
                  className={classNames(
                    "inline-flex items-center gap-0.5 font-bold",
                    comparison.direction === "up" && "text-[#087f72]",
                    comparison.direction === "down" && "text-[#b45309]",
                    comparison.direction === "same" && "text-[#667085]",
                  )}
                >
                  <ComparisonIcon size={13} strokeWidth={2} />
                  {comparison.label}
                </span>
                <span className="text-[#98a2b3]">קודם {metric.formatPrevious(metric.previousValue)}</span>
              </div>
            )}
            <p className="mt-2 truncate text-xs leading-5 text-[#667085]">{metric.detail}</p>
          </article>
        );
      })}
    </section>
  );
}

function DataReconciliationPanel({
  account,
  emails,
  sms,
  automations,
  rangeStart,
  rangeEnd,
}: {
  account: FlashyAccount;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  rangeStart: string;
  rangeEnd: string;
}) {
  const [flashyUiCampaignRevenue, setFlashyUiCampaignRevenue] = useState("");
  const [flashyUiAutomationRevenue, setFlashyUiAutomationRevenue] = useState("");
  const [reconcileResult, setReconcileResult] = useState<FlashyReconcileResult | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState("");
  const emailRevenue = emails.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsRevenue = sms.reduce((total, item) => total + item.revenueGenerated, 0);
  const campaignRevenue = emailRevenue + smsRevenue;
  const automationRevenue = automations.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsCampaignRecipients = sms.reduce((total, item) => total + item.totalRecipients, 0);
  const smsAutomationRecipients = automations.reduce(
    (total, item) => total + getAutomationSmsRecipients(item),
    0,
  );
  const smsCredits = smsCampaignRecipients + smsAutomationRecipients;
  const expectedSmsCost = smsCredits * account.smsCreditPriceUsd * account.usdIlsRate;
  const flashyUiCampaignValue = Number(flashyUiCampaignRevenue.replace(/[^\d.-]/g, "")) || 0;
  const flashyUiAutomationValue = Number(flashyUiAutomationRevenue.replace(/[^\d.-]/g, "")) || 0;
  const campaignUiDelta = flashyUiCampaignValue ? flashyUiCampaignValue - campaignRevenue : 0;
  const automationUiDelta = flashyUiAutomationValue ? flashyUiAutomationValue - automationRevenue : 0;
  const apiHasGap = reconcileResult
    ? Math.abs(reconcileResult.delta.campaignRevenue) > 1 ||
      Math.abs(reconcileResult.delta.automationRevenue) > 1
    : false;
  const uiHasGap = Math.abs(campaignUiDelta) > 1 || Math.abs(automationUiDelta) > 1;
  const qaConclusion = reconcileResult
    ? apiHasGap
      ? {
          title: "יש פער אמיתי מול Flashy API",
          body: "צריך לבדוק את רשימת הפריטים עם הפערים לפני שמציגים מסקנות ללקוח.",
          tone: "warn" as const,
        }
      : uiHasGap
        ? {
            title: reconcileResult.boundaryCampaignCandidates.length
              ? "יש פער מול Sales Overview, כנראה בגלל קמפיינים מוקדמים"
              : "יש פער מול Sales Overview, אבל לא מול דוחות ה־API",
            body: "דוחות הפעילות מסננים קמפיינים לפי מועד השליחה. Sales Overview מסנן רכישות לפי מועד ההמרה ולכן עשוי לכלול קמפיינים שנשלחו לפני הטווח.",
            tone: "neutral" as const,
          }
        : {
            title: "דוחות הפעילות תואמים ל־Flashy API",
            body: "הבדיקה מאמתת את נתוני הקמפיינים והאוטומציות מה־API. היא אינה משווה אוטומטית ל־Sales Overview, שאינו זמין דרך ה־API הציבורי.",
            tone: "good" as const,
          }
    : null;

  async function runReconcileCheck() {
    setReconcileStatus("בודק מול Flashy...");
    setReconcileResult(null);

    try {
      const response = await fetch("/api/flashy/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          start: rangeStart || undefined,
          end: rangeEnd || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "בדיקת ההתאמה נכשלה.");
      }
      setReconcileResult(payload.data as FlashyReconcileResult);
      setReconcileStatus("הבדיקה הושלמה.");
    } catch (error) {
      setReconcileStatus(error instanceof Error ? error.message : "בדיקת ההתאמה נכשלה.");
    }
  }

  const rows = [
    {
      label: "קמפייני אימייל",
      value: formatCurrency(emailRevenue, account.currency),
      detail: `${formatNumber(emails.length)} קמפיינים`,
    },
    {
      label: "קמפייני SMS",
      value: formatCurrency(smsRevenue, account.currency),
      detail: `${formatNumber(smsCampaignRecipients)} נמענים`,
    },
    {
      label: "אוטומציות",
      value: formatCurrency(automationRevenue, account.currency),
      detail: `${formatNumber(automations.length)} שורות מאוחדות`,
    },
  ];

  return (
    <section className="rounded-2xl border border-[#dfe7ee] bg-white p-5 text-[#080123] shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#eef3f7] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-black">בדיקת אמינות נתונים</h2>
          <p className="mt-1 text-sm leading-6 text-[#65738a]">
            אימות דוחות הפעילות מול Flashy API והשוואה אבחונית ל־Sales Overview.
          </p>
        </div>
        <div className="w-full rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-3 lg:max-w-[380px]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block text-sm font-bold text-[#263548]">
              קמפיינים ב־Sales Overview
              <input
                type="number"
                value={flashyUiCampaignRevenue}
                onChange={(event) => setFlashyUiCampaignRevenue(event.target.value)}
                placeholder="192700"
                className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] bg-white px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
                dir="ltr"
              />
            </label>
            <label className="block text-sm font-bold text-[#263548]">
              אוטומציות ב־Sales Overview
              <input
                type="number"
                value={flashyUiAutomationRevenue}
                onChange={(event) => setFlashyUiAutomationRevenue(event.target.value)}
                placeholder="60600"
                className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] bg-white px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
                dir="ltr"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={runReconcileCheck}
            className="mt-3 h-11 w-full rounded-md bg-[#38ddcf] px-4 text-sm font-black text-[#080123] transition hover:bg-[#67f5e8]"
          >
            השווה מול Flashy עכשיו
          </button>
          <p className="mt-2 text-xs leading-5 text-[#65738a]">
            השדות הידניים אינם משנים את נתוני הדאשבורד; הם משמשים רק לאבחון פערי ייחוס.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-4">
            <p className="text-sm font-bold text-[#65738a]">{row.label}</p>
            <p className="mt-2 text-2xl font-black">{row.value}</p>
            <p className="mt-1 text-xs text-[#65738a]">{row.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-[#f7faf9] p-4">
          <p className="text-xs font-black text-[#65738a]">קרדיטי SMS מחושבים</p>
          <p className="mt-1 text-xl font-black">{formatNumber(smsCredits)}</p>
          <p className="mt-1 text-xs text-[#65738a]">
            {formatNumber(smsCampaignRecipients)} קמפיינים + {formatNumber(smsAutomationRecipients)} אוטומציות
          </p>
        </div>
        <div className="rounded-xl bg-[#f7faf9] p-4">
          <p className="text-xs font-black text-[#65738a]">מחיר קרדיט</p>
          <p className="mt-1 text-xl font-black">{formatUsdDecimal(account.smsCreditPriceUsd)}</p>
          <p className="mt-1 text-xs text-[#65738a]">שער {account.usdIlsRate}</p>
        </div>
        <div className="rounded-xl bg-[#f7faf9] p-4">
          <p className="text-xs font-black text-[#65738a]">עלות SMS לפי נוסחה</p>
          <p className="mt-1 text-xl font-black">{formatCurrency(expectedSmsCost, account.currency)}</p>
          <p className="mt-1 text-xs text-[#65738a]">קרדיטים × מחיר × שער</p>
        </div>
        <div className="rounded-xl bg-[#f7faf9] p-4">
          <p className="text-xs font-black text-[#65738a]">פער מול Sales Overview</p>
          <p className={classNames("mt-1 text-xl font-black", Math.abs(campaignUiDelta + automationUiDelta) > 1 ? "text-[#9a3412]" : "text-[#007d72]")}>
            {flashyUiCampaignValue || flashyUiAutomationValue
              ? formatCurrency(campaignUiDelta + automationUiDelta, account.currency)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-[#65738a]">
            {flashyUiCampaignValue || flashyUiAutomationValue
              ? `קמפיינים ${formatCurrency(campaignUiDelta, account.currency)} · אוטומציות ${formatCurrency(automationUiDelta, account.currency)}`
              : "הזן מספרי Flashy UI להשוואה"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#dfe7ee] bg-[#fbfcfc] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black">השוואה חיה מול Flashy</h3>
              <p className="mt-1 text-xs text-[#65738a]">
                {reconcileStatus || "לחץ על הכפתור למעלה כדי להשוות דאשבורד מול Flashy API."}
              </p>
            </div>
            {reconcileResult && (
              <div className="text-sm font-black text-[#007d72]">
                פער API בקמפיינים: {formatCurrency(reconcileResult.delta.campaignRevenue, account.currency)}
              </div>
            )}
          </div>

          {qaConclusion && (
            <div
              className={classNames(
                "mt-3 rounded-lg border p-3",
                qaConclusion.tone === "good" && "border-[#b8fff3] bg-[#edfffb]",
                qaConclusion.tone === "warn" && "border-[#f4d7c5] bg-[#fff8f3]",
                qaConclusion.tone === "neutral" && "border-[#eef3f7] bg-white",
              )}
            >
              <p
                className={classNames(
                  "text-sm font-black",
                  qaConclusion.tone === "good" && "text-[#007d72]",
                  qaConclusion.tone === "warn" && "text-[#9a3412]",
                  qaConclusion.tone === "neutral" && "text-[#080123]",
                )}
              >
                {qaConclusion.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#40506a]">{qaConclusion.body}</p>
            </div>
          )}

          {(flashyUiCampaignValue > 0 || flashyUiAutomationValue > 0) && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-[#f4d7c5] bg-[#fff8f3] p-3">
                <p className="text-xs font-black text-[#9a3412]">פער מול Sales Overview - קמפיינים</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>דאשבורד: {formatCurrency(campaignRevenue, account.currency)}</span>
                  <span>Flashy UI: {formatCurrency(flashyUiCampaignValue, account.currency)}</span>
                  <span className="font-black text-[#9a3412]">
                    פער: {formatCurrency(campaignUiDelta, account.currency)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-[#f4d7c5] bg-[#fff8f3] p-3">
                <p className="text-xs font-black text-[#9a3412]">פער מול Sales Overview - אוטומציות</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>דאשבורד: {formatCurrency(automationRevenue, account.currency)}</span>
                  <span>Flashy UI: {formatCurrency(flashyUiAutomationValue, account.currency)}</span>
                  <span className="font-black text-[#9a3412]">
                    פער: {formatCurrency(automationUiDelta, account.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {reconcileResult && (
            <>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs font-black text-[#65738a]">דוחות קמפיינים מול Flashy API</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <span>דאשבורד: {formatCurrency(reconcileResult.stored.campaignRevenue, account.currency)}</span>
                    <span>Flashy API: {formatCurrency(reconcileResult.flashy.campaignRevenue, account.currency)}</span>
                    <span className={Math.abs(reconcileResult.delta.campaignRevenue) > 1 ? "text-[#9a3412]" : "text-[#007d72]"}>
                      פער: {formatCurrency(reconcileResult.delta.campaignRevenue, account.currency)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#65738a]">
                    אימייל {formatNumber(reconcileResult.flashy.emailCampaigns)} · SMS {formatNumber(reconcileResult.flashy.smsCampaigns)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs font-black text-[#65738a]">דוחות אוטומציות מול Flashy API</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <span>דאשבורד: {formatCurrency(reconcileResult.stored.automationRevenue, account.currency)}</span>
                    <span>Flashy API: {formatCurrency(reconcileResult.flashy.automationRevenue, account.currency)}</span>
                    <span className={Math.abs(reconcileResult.delta.automationRevenue) > 1 ? "text-[#9a3412]" : "text-[#007d72]"}>
                      פער: {formatCurrency(reconcileResult.delta.automationRevenue, account.currency)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#65738a]">
                    {formatNumber(reconcileResult.flashy.automations)} שורות מ־Flashy
                  </p>
                </div>
              </div>

              {reconcileResult.campaignDifferences.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-[#eef3f7] bg-white">
                  <div className="grid grid-cols-[1fr_110px_110px_100px] gap-2 border-b border-[#eef3f7] px-3 py-2 text-xs font-black text-[#65738a]">
                    <span>פריט</span>
                    <span>דאשבורד</span>
                    <span>Flashy</span>
                    <span>פער</span>
                  </div>
                  {reconcileResult.campaignDifferences.slice(0, 6).map((item) => (
                    <div key={item.name} className="grid grid-cols-[1fr_110px_110px_100px] gap-2 border-b border-[#f4f6f8] px-3 py-2 text-xs last:border-b-0">
                      <span className="truncate font-bold">{item.name}</span>
                      <span>{formatCurrency(item.storedRevenue, account.currency)}</span>
                      <span>{formatCurrency(item.liveRevenue, account.currency)}</span>
                      <span className={Math.abs(item.delta) > 1 ? "font-black text-[#9a3412]" : "text-[#007d72]"}>
                        {formatCurrency(item.delta, account.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {reconcileResult.boundaryCampaignCandidates.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-[#f4d7c5] bg-[#fff8f3]">
                  <div className="border-b border-[#f4d7c5] px-3 py-2">
                    <p className="text-xs font-black text-[#9a3412]">
                      קמפיינים שנשלחו לפני הטווח ועשויים להסביר את פער הייחוס
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-[#7c4a2d]">
                      הסכומים הם מדוחות הקמפיינים ואינם סכום הפער. הם מסמנים אילו קמפיינים לבדוק ב־Sales Overview.
                    </p>
                  </div>
                  {reconcileResult.boundaryCampaignCandidates.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 border-b border-[#f8e7dc] px-3 py-2 text-xs last:border-b-0">
                      <span className="truncate font-bold">{item.name}</span>
                      <span className="shrink-0 font-black text-[#9a3412]">
                        {formatCurrency(item.revenue, account.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
    </section>
  );
}

function RevenueCostChart({ account, items }: { account: FlashyAccount; items: PerformanceItem[] }) {
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");
  const [mediumFilter, setMediumFilter] = useState<ActivityMediumFilter>("all");
  const filteredItems = items.filter(item => (kindFilter === "all" || item.kind === kindFilter) && (mediumFilter === "all" || item.medium === mediumFilter));
  return <div className="col-span-12 min-w-0">
    <RankedBars
      key={`${kindFilter}-${mediumFilter}`}
      title="הפעילויות שמייצרות הכנסה"
      currency={account.currency}
      controls={<div className="flex flex-wrap gap-2">
        <div className="flex rounded-md bg-[#f1f4f5] p-0.5" role="group" aria-label="סוג פעילות">
          {([{ key: "all", label: "הכל" }, { key: "campaign", label: "קמפיינים" }, { key: "automation", label: "אוטומציות" }] as const).map(option =>
            <button key={option.key} aria-pressed={kindFilter === option.key} onClick={() => setKindFilter(option.key)} className={`min-h-8 rounded px-2.5 text-xs ${kindFilter === option.key ? "bg-white font-bold shadow-sm" : "text-[#667085]"}`}>{option.label}</button>
          )}
        </div>
        <div className="flex rounded-md bg-[#f1f4f5] p-0.5" role="group" aria-label="ערוץ פעילות">
          {([{ key: "all", label: "הכל" }, { key: "email", label: "Email" }, { key: "sms", label: "SMS" }] as const).map(option =>
            <button key={option.key} aria-pressed={mediumFilter === option.key} onClick={() => setMediumFilter(option.key)} className={`min-h-8 rounded px-2.5 text-xs ${mediumFilter === option.key ? "bg-white font-bold shadow-sm" : "text-[#667085]"}`}>{option.label}</button>
          )}
        </div>
      </div>}
      rows={filteredItems.map(item => ({
        id: item.id, label: item.name, value: item.revenue,
        color: item.kind === "automation" ? chartColors.automation : item.medium === "sms" ? chartColors.sms : chartColors.email,
        meta: `${item.channel} · ${formatNumber(item.purchases)} רכישות · ${formatNumber(item.recipients)} נמענים`,
      }))}
    />
  </div>;
}

function ChannelBreakdown({ account, channelData, showCosts = true }: {
  account: FlashyAccount;
  channelData: { channel: string; revenue: number; cost: number; count: number; purchases: number }[];
  showCosts?: boolean;
}) {
  return <div className="col-span-12 min-w-0"><RevenueShareChart currency={account.currency} showCosts={showCosts} segments={channelData.map(row => ({
    label: row.channel, revenue: row.revenue, count: row.count, purchases: row.purchases, cost: row.cost,
    color: row.channel === "אימייל" ? chartColors.email : row.channel === "SMS" ? chartColors.sms : chartColors.automation,
  }))} /></div>;
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
    <div className={classNames("border-b border-white/10 pb-3", mobile && "mb-3 rounded-lg border border-[#e4e7ec] bg-white p-3 text-[#111318] lg:hidden")}>
      <label className={classNames("mb-1.5 block text-[11px]", mobile ? "text-[#667085]" : "text-white/55")} htmlFor={mobile ? "client-select-mobile" : "client-select"}>
        לקוח פעיל
      </label>
      <div className="relative">
        <select
          id={mobile ? "client-select-mobile" : "client-select"}
          value={selectedClientId}
          onChange={(event) => onChange(event.target.value)}
          className={classNames(
            "min-h-9 w-full appearance-none truncate rounded-md border px-2.5 text-sm outline-none",
            mobile
              ? "border-[#d0d5dd] bg-white text-[#111318] focus:border-[#42dfcf]"
              : "border-white/10 bg-white/5 text-white focus:border-[#42dfcf]",
          )}
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id} className="text-[#111]">
              {client.name}
            </option>
          ))}
        </select>
        <ChevronDown className={classNames("pointer-events-none absolute left-2.5 top-2.5", mobile ? "text-[#667085]" : "text-white/55")} size={16} />
      </div>
    </div>
  );
}

function Sidebar({
  clients,
  selectedClientId,
  visibleViews,
  view,
  hideClientSelector,
  onSelectClient,
  onSelectView,
}: {
  clients: Client[];
  selectedClientId: string;
  visibleViews: typeof views;
  view: ViewKey;
  hideClientSelector: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectView: (view: ViewKey) => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-4 border-l border-white/10 bg-[#0b0c10] px-3 py-4 text-white lg:flex">
      <div className="flex items-center gap-2 border-b border-white/10 px-1 pb-4 text-sm font-bold">
        <span className="grid size-8 place-items-center rounded-md bg-[#42dfcf] text-xs font-black text-[#0b0c10]">FG</span>
        <span className="truncate">Growth Desk</span>
      </div>
      {!hideClientSelector && (
        <ClientSelector clients={clients} selectedClientId={selectedClientId} onChange={onSelectClient} />
      )}
      <nav className="grid gap-1" aria-label="ניווט ראשי">
        {visibleViews.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onSelectView(item.key)}
              className={classNames(
                "relative flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-right text-sm font-medium transition",
                view === item.key
                  ? "bg-white/10 text-white before:absolute before:inset-y-2 before:right-0 before:w-0.5 before:rounded-full before:bg-[#42dfcf]"
                  : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="shrink-0" size={17} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto px-2 text-[11px] text-white/35">addz.digital</div>
    </aside>
  );
}

function Overview({
  account,
  summary,
  previousSummary,
  comparisonPoints,
  previousRangeLabel,
  emails,
  sms,
  automations,
  showDeepAnalysis,
  canAudit,
  rangeStart,
  rangeEnd,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  comparisonPoints: PeriodComparisonPoint[];
  previousRangeLabel: string;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  showDeepAnalysis: boolean;
  canAudit: boolean;
  rangeStart: string;
  rangeEnd: string;
}) {
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
  const channelData = ["אימייל", "SMS", "אוטומציות"].map((channel) => {
    const items = performanceItems.filter((item) => item.channel === channel);
    const revenue = items.reduce((total, item) => total + item.revenue, 0);
    const cost = items.reduce((total, item) => total + item.cost, 0);
    const recipients = items.reduce((total, item) => total + item.recipients, 0);
    const purchases = items.reduce((total, item) => total + item.purchases, 0);

    return {
      channel,
      revenue,
      cost,
      profit: revenue - cost,
      count: items.length,
      purchases,
      recipients,
      roas: cost > 0 ? revenue / cost : null,
      revenuePerRecipient: recipients > 0 ? revenue / recipients : 0,
      share: summary.revenue > 0 ? revenue / summary.revenue : 0,
    };
  });
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
  return (
    <section className="grid grid-cols-12 gap-3">
      <div className="col-span-12">
        <KPIGrid account={account} summary={summary} previousSummary={previousSummary} />
      </div>

      {comparisonPoints.length > 0 && (
        <div className="col-span-12 min-w-0">
          <PeriodComparisonChart
            points={comparisonPoints}
            currency={account.currency}
            previousRangeLabel={previousRangeLabel}
          />
        </div>
      )}

      {showDeepAnalysis && canAudit && (
        <div className="col-span-12">
          <DataReconciliationPanel
            account={account}
            emails={emails}
            sms={sms}
            automations={automations}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        </div>
      )}

      <ChannelBreakdown account={account} channelData={channelData} />

      <RevenueCostChart account={account} items={performanceItems} />

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


function SmsDashboard({ account, sms, automations, showDeepAnalysis }: {
  account: FlashyAccount; sms: SmsCampaignReport[]; automations: AutomationReport[]; showDeepAnalysis: boolean;
}) {
  const [sortBy, setSortBy] = useState<"revenue" | "roas">("revenue");
  const smsAutomations = automations.filter(item => getAutomationSmsRecipients(item) > 0);
  const summary = summarizeSms(account, sms, smsAutomations);
  const rows = [
    ...sms.map(item => ({
      id: item.id, name: item.campaignName, type: "קמפיינים", revenue: item.revenueGenerated, comparable: true,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      recipients: item.totalRecipients, clicks: item.totalClicks, purchases: item.purchases,
    })),
    ...smsAutomations.map(item => ({
      id: item.id, name: item.automationName, type: "אוטומציות עם SMS", revenue: item.revenueGenerated, comparable: getAutomationType(item) === "sms",
      cost: getAutomationSmsRecipients(item) * account.smsCreditPriceUsd * account.usdIlsRate,
      recipients: getAutomationSmsRecipients(item), clicks: item.clickedSms ?? item.totalClicks, purchases: item.purchases,
    })),
  ];
  const groups = ["קמפיינים", "אוטומציות SMS", "אוטומציות מעורבות"].map(label => {
    const items = rows.filter(row => label === "קמפיינים" ? row.type === label : row.type !== "קמפיינים" && row.comparable === (label === "אוטומציות SMS"));
    return { label, comparable: label !== "אוטומציות מעורבות", revenue: items.reduce((s,r) => s+r.revenue,0), cost: items.reduce((s,r) => s+r.cost,0), count: items.length };
  });
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
      <MetricCard title="הכנסות פעילות SMS" value={formatCurrency(summary.revenue, account.currency)} caption="קמפיינים ואוטומציות עם SMS" icon={TrendingUp} tone="good" />
      <MetricCard title="עלות SMS" value={formatCurrency(summary.smsCost, account.currency)} caption={`${formatNumber(summary.recipients)} הודעות`} icon={MessageSquareText} />
      <MetricCard title="הכנסה / עלות SMS" value={formatRoas(summary.roas)} caption="כולל הכנסות אוטומציות מעורבות" icon={LineChart} />
      <MetricCard title="רכישות" value={formatNumber(summary.purchases)} caption="מהפעילות שנבחרה" icon={CheckCircle2} />
    </div>
    <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
      <SmsReturnChart groups={groups} currency={account.currency} />
      <RankedBars key={sortBy} title="ביצועי פעילות SMS" currency={sortBy === "revenue" ? account.currency : undefined} unit={sortBy === "revenue" ? "הכנסה" : "הכנסה / עלות SMS"}
        controls={<select aria-label="מדד דירוג SMS" value={sortBy} onChange={e=>setSortBy(e.target.value as "revenue" | "roas")} className="h-8 rounded-md border border-[#e4e7ec] bg-white px-2 text-xs"><option value="revenue">הכנסה</option><option value="roas">הכנסה / עלות SMS</option></select>}
        rows={rows.filter(row => sortBy === "revenue" || (row.cost > 0 && row.comparable)).map(row => ({
          id: row.id, label: row.name, value: sortBy === "revenue" ? row.revenue : row.revenue / row.cost,
          color: row.type === "קמפיינים" ? chartColors.sms : chartColors.automation,
          meta: `${row.type} · ${formatNumber(row.purchases)} רכישות · עלות ${formatCurrency(row.cost,account.currency)} · ${row.comparable ? formatRoas(row.cost > 0 ? row.revenue/row.cost : null) : "כולל הכנסות אימייל"}`,
        }))} />
    </div>
    {showDeepAnalysis && <DataTable title="פירוט פעילות SMS" columns={["פעילות","סוג","נמענים","קליקים","עלות SMS","הכנסה","רכישות"]} rows={rows.map(row=>[row.name,row.type,formatNumber(row.recipients),formatNumber(row.clicks),formatCurrency(row.cost,account.currency),formatCurrency(row.revenue,account.currency),formatNumber(row.purchases)])} />}
  </div>;
}

function AutomationDashboard({ account, automations, showDeepAnalysis }: {
  account: FlashyAccount; automations: AutomationReport[]; showDeepAnalysis: boolean;
}) {
  const [filter, setFilter] = useState<AutomationFilterKey>("all");
  const rows = automations.map(item => ({
    ...item, type: getAutomationType(item),
    messages: (item.sentEmails ?? (item.channel === "email" ? item.totalDelivered : 0)) + getAutomationSmsRecipients(item),
    smsCost: getAutomationSmsRecipients(item) * account.smsCreditPriceUsd * account.usdIlsRate,
  }));
  const filtered = rows.filter(row => filter === "all" || row.type === filter);
  const revenue = filtered.reduce((s,r)=>s+r.revenueGenerated,0);
  const purchases = filtered.reduce((s,r)=>s+r.purchases,0);
  const messages = filtered.reduce((s,r)=>s+r.messages,0);
  const cost = filtered.reduce((s,r)=>s+r.smsCost,0);
  const segments = (["email","sms","mixed"] as const).map(type=>{
    const items=filtered.filter(row=>row.type===type);
    return {
      label: automationFilterLabels[type], revenue: items.reduce((s,r)=>s+r.revenueGenerated,0),
      purchases: items.reduce((s,r)=>s+r.purchases,0), count: items.length,
      color: type==="email" ? chartColors.email : type==="sms" ? chartColors.sms : chartColors.automation,
    };
  });
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-end gap-1" role="group" aria-label="סוג אוטומציה">
      {(["all","email","sms","mixed"] as const).map(type=><button key={type} onClick={()=>setFilter(type)} aria-pressed={filter===type} className={`min-h-9 rounded-md px-3 text-sm ${filter===type ? "bg-[#24282f] text-white" : "bg-white text-[#667085]"}`}>{automationFilterLabels[type]}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
      <MetricCard title="הכנסות אוטומציות" value={formatCurrency(revenue,account.currency)} caption={`${filtered.length} אוטומציות`} icon={TrendingUp} tone="good" />
      <MetricCard title="רכישות" value={formatNumber(purchases)} caption="מאוטומציות בטווח" icon={CheckCircle2} />
      <MetricCard title="הודעות" value={formatNumber(messages)} caption="אימייל ו־SMS" icon={Send} />
      <MetricCard title="עלות SMS" value={formatCurrency(cost,account.currency)} caption="ללא עלות אימייל" icon={MessageSquareText} />
    </div>
    <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
      <RevenueShareChart title="הכנסות לפי סוג אוטומציה" segments={segments} currency={account.currency} />
      <RankedBars key={filter} title="הכנסות לפי אוטומציה" currency={account.currency} rows={filtered.map(row=>({
        id: row.id, label: row.automationName, value: row.revenueGenerated,
        color: row.type==="email" ? chartColors.email : row.type==="sms" ? chartColors.sms : chartColors.automation,
        meta: `${automationFilterLabels[row.type]} · ${formatNumber(row.purchases)} רכישות · ${formatNumber(row.messages)} הודעות`,
      }))} />
    </div>
    {showDeepAnalysis && <DataTable title="פירוט אוטומציות" columns={["אוטומציה","סוג","נכנסו","הושלמו","אימיילים","פתיחות אימייל","קליקים","SMS","עלות SMS","רכישות","הכנסה","הכנסה / עלות SMS"]} rows={filtered.map(row=>[
      row.automationName,automationFilterLabels[row.type],formatNumber(row.totalEntered ?? row.totalRecipients),formatNumber(row.totalCompleted ?? 0),
      formatNumber(row.sentEmails ?? (row.channel === "email" ? row.totalDelivered : 0)),formatNumber(row.openedEmails ?? row.totalOpens),
      formatNumber(row.totalClicks),formatNumber(getAutomationSmsRecipients(row)),formatCurrency(row.smsCost,account.currency),formatNumber(row.purchases),formatCurrency(row.revenueGenerated,account.currency),formatRoas(row.smsCost > 0 ? row.revenueGenerated / row.smsCost : null),
    ])} />}
  </div>;
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
  const timing = campaignTiming(allCampaignsForDecision, account.timezone);
  const bestHours = timing.hours.map(row => ({ ...row, average: row.count > 0 ? row.revenue / row.count : 0 }));
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
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <WeekdayBars groups={timing.days} currency={account.currency} timezone={timing.timezone} />
        <EngagementPlot rows={[...emails].sort((a,b)=>b.revenueGenerated-a.revenueGenerated).slice(0,4).map(item=>({
          id: item.id, label: item.subjectLine || item.campaignName, revenue: item.revenueGenerated, currency: account.currency,
          opens: measuredRate(item.totalOpens,item.totalDelivered), clicks: measuredRate(item.uniqueClicks,item.totalDelivered),
        }))} />
      </div>

      {showDeepAnalysis && (
      <>
      <RankedBars title="הכנסה לפי שעת שליחה" detail={`ממוצע לקמפיין · ${timing.timezone}`} currency={account.currency} rows={bestHours.map(item=>({
        id: item.label, label: item.label, value: item.average, color: chartColors.sms,
        meta: `${item.count} קמפיינים · ${formatNumber(item.purchases)} רכישות`,
      }))} />
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

function UserAccessManager({ clients }: { clients: Client[] }) {
  const [users, setUsers] = useState<AdminUserAccess[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "client">("client");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [state, setState] = useState("טוען משתמשים...");
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function savePassword(userId: string) {
    if (busy || resetPassword.length < 10) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, password: resetPassword }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "שינוי הסיסמה נכשל.");
      setResetPassword("");
      setResetUserId(null);
      if (payload.reauthenticate) { await signOut({ callbackUrl: "/" }); return; }
      await loadUsers();
      setState("הסיסמה עודכנה. המשתמש יתחבר מחדש עם הסיסמה החדשה.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "שינוי הסיסמה נכשל.");
    } finally { setBusy(false); }
  }

  async function loadUsers() {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת משתמשים נכשלה");
      setUsers(payload.data ?? []);
      setState(payload.data?.length ? "משתמשים נטענו." : "עדיין אין משתמשים שמורים.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "טעינת משתמשים נכשלה.");
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadUsers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function saveUserAccess() {
    if (!email.trim()) {
      setState("צריך להזין אימייל.");
      return;
    }

    if (password.length < 10) {
      setState("הסיסמה חייבת להכיל לפחות 10 תווים.");
      return;
    }

    setState("שומר הרשאה...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          password,
          role,
          clientId: role === "client" ? clientId : "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת משתמש נכשלה");
      setEmail("");
      setName("");
      setPassword("");
      setRole("client");
      await loadUsers();
      setState("המשתמש וההרשאות נשמרו.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "שמירת משתמש נכשלה.");
    }
  }

  async function updateUserRole(userId: string, nextRole: "admin" | "client") {
    setState("מעדכן תפקיד...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "עדכון תפקיד נכשל");
      await loadUsers();
      setState("התפקיד עודכן.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "עדכון תפקיד נכשל.");
    }
  }

  async function removeClientAccess(userId: string, targetClientId: string | null) {
    if (!targetClientId) return;
    setState("מסיר שיוך לקוח...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, clientId: targetClientId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "הסרת הרשאה נכשלה");
      await loadUsers();
      setState("השיוך הוסר.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "הסרת הרשאה נכשלה.");
    }
  }

  return (
    <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)] xl:col-span-2">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#080123]">משתמשים והרשאות לקוחות</h2>
        </div>
        <button
          onClick={loadUsers}
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-sm font-bold text-[#263548]"
        >
          רענון משתמשים
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_130px_1fr_auto]">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="אימייל משתמש"
          aria-label="אימייל משתמש"
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
          dir="ltr"
        />
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="שם להצגה"
          aria-label="שם להצגה"
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="סיסמה, לפחות 10 תווים"
          aria-label="סיסמה למשתמש החדש"
          maxLength={128}
          autoComplete="new-password"
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-left text-sm outline-none focus:border-[#6fffe5]"
          dir="ltr"
        />
        <select
          value={role}
          aria-label="תפקיד משתמש חדש"
          onChange={(event) => setRole(event.target.value as "admin" | "client")}
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
        >
          <option value="client">לקוח</option>
          <option value="admin">אדמין</option>
        </select>
        <select
          value={clientId}
          aria-label="לקוח לשיוך"
          onChange={(event) => setClientId(event.target.value)}
          disabled={role === "admin"}
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5] disabled:bg-slate-100"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <button
          onClick={saveUserAccess}
          className="h-10 rounded-md bg-[#080123] px-4 text-sm font-bold text-white"
        >
          צור משתמש
        </button>
      </div>

      <p className="mt-3 text-sm text-[#65738a]">{state}</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#dfe7ee]">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[#f4f7f6] text-[#65738a]">
            <tr>
              <th className="p-3 text-right">משתמש</th>
              <th className="p-3 text-right">תפקיד</th>
              <th className="p-3 text-right">התחברות</th>
              <th className="p-3 text-right">לקוחות משויכים</th>
              <th className="p-3 text-right">נוצר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f7]">
            {users.map((user) => (
              <tr key={user.id} className="align-top text-[#263548]">
                <td className="p-3">
                  <p className="font-bold text-[#080123]">{user.name || "ללא שם"}</p>
                  <p className="text-left text-xs text-[#65738a]" dir="ltr">
                    {user.email}
                  </p>
                </td>
                <td className="p-3">
                  <select
                    value={user.role}
                    aria-label={`תפקיד ${user.email}`}
                    disabled={user.isOwner}
                    onChange={(event) => updateUserRole(user.id, event.target.value as "admin" | "client")}
                    className="h-9 rounded-md border border-[#dfe7ee] px-2 text-sm"
                  >
                    <option value="client">לקוח</option>
                    <option value="admin">אדמין</option>
                  </select>
                </td>
                <td className="p-3">
                  <span className={classNames(
                    "inline-flex rounded-full px-3 py-1 text-xs font-bold",
                    user.hasPassword
                      ? "bg-[#e8fbf8] text-[#007d72]"
                      : "bg-[#fff0e8] text-[#9a3412]",
                  )}>
                    {user.hasPassword ? "סיסמה פעילה" : "חסרה סיסמה"}
                  </span>
                  <button type="button" className="mt-2 block text-xs font-medium text-[#087f72]" onClick={() => { setResetUserId(user.id); setResetPassword(""); }}>שינוי סיסמה</button>
                  {resetUserId === user.id && (
                    <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); void savePassword(user.id); }}>
                      <input autoFocus aria-label={`סיסמה חדשה עבור ${user.email}`} type="password" autoComplete="new-password" required minLength={10} maxLength={128} dir="ltr" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="h-9 w-full min-w-0 rounded-md border border-[#dfe7ee] px-2" />
                      <div className="flex gap-2">
                        <button disabled={busy} className="rounded-md bg-[#111318] px-3 py-2 text-xs text-white">{busy ? "שומר..." : "עדכן סיסמה"}</button>
                        <button type="button" disabled={busy} onClick={() => { setResetUserId(null); setResetPassword(""); }} className="text-xs">ביטול</button>
                      </div>
                    </form>
                  )}
                </td>
                <td className="p-3">
                  {user.role === "admin" ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      גישה לכל הלקוחות
                    </span>
                  ) : user.clients.length ? (
                    <div className="flex flex-wrap gap-2">
                      {user.clients.map((client) => (
                        <span
                          key={client.linkId}
                          className="inline-flex items-center gap-2 rounded-full bg-[#f4f7f6] px-3 py-1 text-xs"
                        >
                          {client.clientName}
                          <button
                            onClick={() => removeClientAccess(user.id, client.clientId)}
                            className="font-black text-rose-600"
                          >
                            הסר
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#65738a]">אין שיוך לקוח</span>
                  )}
                  {user.role !== "admin" && (
                    <div className="mt-2">
                      <span
                        className={classNames(
                          "rounded-full px-3 py-1 text-xs font-bold",
                          user.clients.length
                            ? "bg-[#e8fbf8] text-[#007d72]"
                            : "bg-[#fff0e8] text-[#9a3412]",
                        )}
                      >
                        {user.clients.length ? "משויך ללקוח" : "לא משויך"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="p-3 text-[#65738a]">
                  {new Date(user.createdAt).toLocaleDateString("he-IL")}
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[#65738a]">
                  אין משתמשים להצגה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminPanel({
  clientName,
  clients,
  canManageUsers,
  onCreateLiveClient,
}: {
  clientName: string;
  clients: Client[];
  canManageUsers: boolean;
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
  const [smsCreditPriceUsd, setSmsCreditPriceUsd] = useState("0.01");
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
        ? `אימייל לקוח: ${clientEmail.trim()} (צור עבורו סיסמה במסך אדמין)`
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
            {Number(smsCreditPriceUsd) > 0.05 && (
              <span className="mt-2 block rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                המחיר נראה גבוה. אם המחיר האמיתי הוא בערך $0.0100, עלות ה־SMS תחושב פי כמה וכמה נמוך יותר.
              </span>
            )}
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
      {canManageUsers && <UserAccessManager clients={clients} />}
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
  const smsCostExampleIls =
    100000 * (Number(smsCreditPriceUsd) || 0) * (Number(usdIlsRate) || 3.7);
  const missingCostWarnings = [
    Number(smsCreditPriceUsd) <= 0 ? "חסר מחיר קרדיט SMS בדולר" : "",
    Number(monthlySubscriptionCostUsd) <= 0 ? "חסרה עלות מנוי חודשית בדולר" : "",
    Number(agencyRetainerCostIls) <= 0 ? "חסר ריטיינר חודשי בשקל" : "",
  ].filter(Boolean);
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
              {client.name} · {account.name}. ההגדרות משפיעות מיד על חישובי ROAS ורווחיות.
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
            {Number(smsCreditPriceUsd) > 0.05 && (
              <span className="mt-2 block rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                המחיר נראה גבוה. אם המחיר האמיתי הוא בערך $0.0100, עלות ה־SMS תחושב פי כמה וכמה נמוך יותר.
              </span>
            )}
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
            {Number(monthlySubscriptionCostUsd) <= 0 && (
              <span className="mt-2 block rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                אם יש מנוי Flashy חודשי, כדאי למלא אותו כדי שהרווח הכללי יהיה אמין.
              </span>
            )}
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
            {Number(agencyRetainerCostIls) <= 0 && (
              <span className="mt-2 block rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                הריטיינר חסר ולכן הרווח אחרי עלויות סוכנות לא מלא.
              </span>
            )}
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#b8fff3] bg-[#edfffb] p-4">
            <p className="text-sm font-black text-[#007d72]">דוגמת חישוב SMS</p>
            <p className="mt-2 text-2xl font-black text-[#080123]">
              {formatCurrency(smsCostExampleIls, "ILS")}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#40506a]">
              100,000 קרדיטים × {formatUsdDecimal(Number(smsCreditPriceUsd) || 0)} × שער {Number(usdIlsRate) || 3.7}
            </p>
          </div>
          <div className="rounded-xl border border-[#eef3f7] bg-[#fbfcfc] p-4">
            <p className="text-sm font-black text-[#080123]">בדיקות עלויות</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missingCostWarnings.length ? (
                missingCostWarnings.map((warning) => (
                  <span key={warning} className="rounded-full bg-[#fff0e8] px-2 py-1 text-xs font-bold text-[#9a3412]">
                    {warning}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-[#e8fbf8] px-2 py-1 text-xs font-bold text-[#007d72]">
                  כל העלויות המרכזיות הוגדרו
                </span>
              )}
            </div>
          </div>
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
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 6);

  return (
    <section className="overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e4e7ec] px-4 py-3">
        <h2 className="text-base font-bold text-[#111318]">{title}</h2>
        {rows.length > 6 && (
          <button
            onClick={() => setExpanded((current) => !current)}
            className="rounded-md border border-[#d0d5dd] bg-white px-3 py-1.5 text-xs font-medium text-[#475467] hover:bg-[#f8fafb]"
          >
            {expanded ? "צמצם" : `הצג הכל (${formatNumber(rows.length)})`}
          </button>
        )}
      </div>
      <div className="divide-y divide-[#eef3f7] md:hidden">
        {visibleRows.length ? (
          visibleRows.map((row, rowIndex) => (
            <article key={rowIndex} className="p-4">
              <div className="mb-3 min-w-0">
                <p className="truncate text-sm font-bold text-[#080123]">{row[0]}</p>
                {row[1] && <p className="mt-1 truncate text-xs text-[#65738a]">{row[1]}</p>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#eef0f2] pt-3">
                {row.slice(2, 8).map((cell, index) => (
                  <div key={`${rowIndex}-mobile-${index}`} className="min-w-0 text-xs">
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
          <thead className="bg-[#f8fafb] text-[#667085]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-2.5 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef0f2] text-[#344054]">
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[#f8fbfa]">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3">
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
  const [viewerRole, setViewerRole] = useState<"admin" | "client">("admin");
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [dataSource, setDataSource] = useState<"demo" | "neon" | "loading">("loading");
  const [dataNotice, setDataNotice] = useState("טוען נתונים מ-Neon...");
  const [authRequired, setAuthRequired] = useState(false);
  const [liveDataIssue, setLiveDataIssue] = useState("");
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
    account.timezone,
  );
  const accountSms = filterByTimeRange(
    allAccountSms,
    timeRange,
    (item) => item.sentAt,
    customStartDate,
    customEndDate,
    account.timezone,
  );
  const accountAutomationRows = filterByTimeRange(
    byAccount(localAutomationReports, account.id),
    timeRange,
    (item) => item.date,
    customStartDate,
    customEndDate,
    account.timezone,
  );
  const accountAutomations = consolidateAutomations(accountAutomationRows);
  const accountPlans = localNewsletterPlans.filter((plan) => plan.clientId === selectedClient.id);
  const summary = summarizeAccount(account, accountEmails, accountSms, accountAutomations);
  const activeRangeBounds = getTimeRangeBounds(timeRange, customStartDate, customEndDate, account.timezone);
  const previousRangeBounds = getPreviousRangeBounds(activeRangeBounds, account.timezone);
  const previousEmails = previousRangeBounds
    ? filterByBounds(allAccountEmails, previousRangeBounds, (item) => item.sentAt, account.timezone)
    : [];
  const previousSms = previousRangeBounds
    ? filterByBounds(allAccountSms, previousRangeBounds, (item) => item.sentAt, account.timezone)
    : [];
  const previousAutomationRows = previousRangeBounds
    ? filterByBounds(
        byAccount(localAutomationReports, account.id),
        previousRangeBounds,
        (item) => item.date,
        account.timezone,
      )
    : [];
  const previousAutomations = consolidateAutomations(previousAutomationRows);
  const previousSummary = previousRangeBounds
    ? summarizeAccount(account, previousEmails, previousSms, previousAutomations)
    : null;
  const comparisonPoints = previousRangeBounds
    ? buildPeriodComparisonPoints({
        currentBounds: activeRangeBounds,
        previousBounds: previousRangeBounds,
        currentEmails: accountEmails,
        currentSms: accountSms,
        currentAutomations: accountAutomationRows,
        previousEmails,
        previousSms,
        previousAutomations: previousAutomationRows,
        timezone: account.timezone,
      })
    : [];
  const previousRangeLabel = previousRangeBounds
    ? `${new Date(previousRangeBounds.start).toLocaleDateString("he-IL", { timeZone: account.timezone })}–${new Date(previousRangeBounds.end).toLocaleDateString("he-IL", { timeZone: account.timezone })}`
    : "התקופה הקודמת";
  const viewerIsAdmin = viewerRole === "admin";
  const isRestrictedUser = !viewerIsAdmin;

  const visibleViews = views.filter((item) => {
    if (isRestrictedUser && (item.key === "admin" || item.key === "settings")) return false;
    return !item.module || selectedClient.visibleModules.includes(item.module) || item.key === "admin";
  });
  const effectiveShowDeepAnalysis = showDeepAnalysis;
  const activeView = isRestrictedUser && (view === "settings" || view === "admin") ? "overview" : view;
  const showTimeRange = costViewKeys.includes(activeView);

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
            setLiveDataIssue("");
            setDataSource("loading");
            setDataNotice(payload.message || "צריך להתחבר כדי לגשת לנתונים.");
            return;
          }
          if (payload.code !== "DATABASE_NOT_CONFIGURED") {
            setDataSource("loading");
            setLiveDataIssue(payload.message || "טעינת הנתונים החיים נכשלה.");
            return;
          }
          setDataSource("demo");
          if (process.env.NODE_ENV === "production") setLiveDataIssue("החיבור לנתונים אינו מוגדר. פנה למנהל המערכת.");
          setDataNotice(payload.message || "אין חיבור Neon פעיל, מוצגים נתוני דמו.");
          return;
        }

        const data = payload.data as DashboardDataPayload;
        const incomingRole = data.viewer?.role ?? "admin";
        setCanManageUsers(data.viewer?.canManageUsers === true);
        if (!data.clients.length || !data.accounts.length) {
          setDataSource("loading");
          setLiveDataIssue(
            "התחברת בהצלחה, אבל המשתמש לא משויך עדיין ללקוח או שאין חשבונות שמורים ב-Neon.",
          );
          return;
        }

        setViewerRole(incomingRole);
        if (incomingRole === "client") {
          setShowDeepAnalysis(false);
          setView((current) => (current === "settings" || current === "admin" ? "overview" : current));
        }
        setLocalClients(data.clients);
        setLocalAccounts(data.accounts);
        setLocalEmailReports(data.emailReports);
        setLocalSmsReports(data.smsReports);
        setLocalAutomationReports(data.automationReports);
        setLocalNewsletterPlans(data.newsletterPlans);
        setSelectedClientId(data.clients[0].id);
        setAuthRequired(false);
        setLiveDataIssue("");
        setDataSource("neon");
        setDataNotice(`נטענו ${data.clients.length} לקוחות מ-Neon.`);
      } catch (error) {
        if (!cancelled) {
          setLiveDataIssue(error instanceof Error ? error.message : "טעינת הנתונים נכשלה. נסה שוב בעוד רגע.");
        }
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshDashboardData() {
    setRefreshState("מסנכרן מול Flashy...");
    try {
      const syncResponse = await fetch("/api/flashy/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const syncPayload = await syncResponse.json();
      if (!syncResponse.ok || !syncPayload.success) {
        throw new Error(syncPayload.message || "סנכרון Flashy נכשל");
      }

      setRefreshState("טוען נתונים מסונכרנים...");
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) {
        setAuthRequired(true);
        setLiveDataIssue("");
        throw new Error(payload.message || "צריך להתחבר כדי לגשת לנתונים.");
      }
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת הנתונים נכשלה");

      const data = payload.data as DashboardDataPayload;
      const incomingRole = data.viewer?.role ?? "admin";
      setCanManageUsers(data.viewer?.canManageUsers === true);
      setViewerRole(incomingRole);
      if (incomingRole === "client") {
        setShowDeepAnalysis(false);
        setView((current) => (current === "settings" || current === "admin" ? "overview" : current));
      }
      setLocalClients(data.clients);
      setLocalAccounts(data.accounts);
      setLocalEmailReports(data.emailReports);
      setLocalSmsReports(data.smsReports);
      setLocalAutomationReports(data.automationReports);
      setLocalNewsletterPlans(data.newsletterPlans);
      setAuthRequired(false);
      setLiveDataIssue("");
      setDataSource("neon");
      setDataNotice(`רוענן עכשיו: ${data.clients.length} לקוחות מ-Neon.`);
      setRefreshState(
        `סונכרן: ${syncPayload.imported?.emailCampaigns ?? 0} אימייל, ${
          syncPayload.imported?.smsCampaigns ?? 0
        } SMS, ${syncPayload.imported?.automations ?? 0} אוטומציות.`,
      );
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

  async function logout() {
    await signOut({ callbackUrl: "/" });
  }

  if (authRequired) {
    return <LoginGate message={dataNotice} />;
  }

  if (liveDataIssue) {
    return <LiveDataIssue message={liveDataIssue} />;
  }

  if (dataSource === "loading") {
    return <div dir="rtl" role="status" className="grid min-h-screen place-items-center bg-[#f5f7f8] text-sm text-[#667085]">טוען את החשבון...</div>;
  }

  return (
    <div
      dir="rtl"
      className={classNames(
        "dashboard-shell min-h-screen overflow-x-hidden lg:grid",
        "lg:grid-cols-[196px_minmax(0,1fr)]",
      )}
    >
      <Sidebar
        clients={localClients}
        selectedClientId={selectedClientId}
        visibleViews={visibleViews}
        view={activeView}
        hideClientSelector={localClients.length < 2}
        onSelectClient={selectClient}
        onSelectView={setView}
      />

      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b0c10] px-3 py-2.5 text-white lg:hidden">
        <strong className="grid size-8 shrink-0 place-items-center rounded-md bg-[#42dfcf] text-xs text-[#0b0c10]">FG</strong>
        <div className="flex max-w-[78vw] gap-2 overflow-x-auto">
          {visibleViews.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={classNames(
                "h-8 shrink-0 rounded-md px-3 text-sm",
                activeView === item.key
                  ? "bg-[#42dfcf] font-bold text-[#0b0c10]"
                  : "bg-white/5 text-white/65",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="dashboard-content relative min-w-0 p-3 text-[#111318] md:p-5 lg:p-6">
        {localClients.length > 1 && (
          <ClientSelector
            clients={localClients}
            selectedClientId={selectedClientId}
            onChange={selectClient}
            mobile
          />
        )}
        <header className="mb-4 flex flex-col items-start justify-between gap-3 border-b border-[#e4e7ec] pb-4 lg:flex-row lg:items-end">
          <div>
            {!isRestrictedUser && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                <span>Flashy Account #{account.flashyAccountId}</span>
                <span className="inline-flex items-center gap-1 font-medium text-[#087f72] before:size-1.5 before:rounded-full before:bg-[#42dfcf]">פעיל</span>
                <span>סנכרון אחרון: {new Date(account.lastSyncAt).toLocaleString("he-IL")}</span>
              </div>
            )}
            <h1 className="m-0 text-[clamp(26px,3vw,38px)] font-bold leading-tight tracking-normal text-[#111318]">
              {account.name}
            </h1>
            {isRestrictedUser && (
              <p className="mt-1 text-xs text-[#667085]">ביצועים · {timeRanges.find((range) => range.key === timeRange)?.label}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isRestrictedUser && <button
              onClick={refreshDashboardData}
              className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#344054] transition hover:bg-[#f8fafb]"
            >
              <RefreshCw className="ml-2 inline" size={16} />
              רענון
            </button>}
            <button
              onClick={logout}
              className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#667085] transition hover:bg-[#f8fafb] hover:text-[#111318]"
            >
              יציאה
            </button>
          </div>
          {refreshState && <p className="text-xs text-[#667085]">{refreshState}</p>}
        </header>

        <div>
          {showTimeRange && (
            <section className="mb-4 rounded-lg border border-[#e4e7ec] bg-white px-3 py-2.5">
              {activeRangeBounds.start && activeRangeBounds.end && <p className="mb-2 text-xs tabular-nums text-[#667085]">
                {new Date(activeRangeBounds.start).toLocaleDateString("he-IL", { timeZone: account.timezone })} עד {new Date(activeRangeBounds.end).toLocaleDateString("he-IL", { timeZone: account.timezone })}
              </p>}
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex max-w-full gap-1 overflow-x-auto pb-0.5">
                    {timeRanges.map((range) => (
                      <button
                        key={range.key}
                        onClick={() => setTimeRange(range.key)}
                        className={classNames(
                          "h-8 min-w-14 shrink-0 rounded-md px-3 text-xs font-medium transition",
                          timeRange === range.key
                            ? "bg-[#111318] text-white"
                            : "text-[#667085] hover:bg-[#f2f4f7] hover:text-[#111318]",
                        )}
                      >
                        {range.label}
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {costViewKeys.includes(activeView) && (
                    <button
                      onClick={() => setShowDeepAnalysis((current) => !current)}
                      className={classNames(
                        "h-8 rounded-md px-3 text-xs font-medium transition",
                        showDeepAnalysis
                          ? "bg-[#111318] text-white"
                          : "border border-[#d0d5dd] bg-white text-[#475467] hover:bg-[#f8fafb]",
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
          {activeView === "overview" && (
            <Overview
                account={account}
                summary={summary}
                previousSummary={previousSummary}
                comparisonPoints={comparisonPoints}
                previousRangeLabel={previousRangeLabel}
                emails={accountEmails}
                sms={accountSms}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
                canAudit={viewerIsAdmin}
                rangeStart={activeRangeBounds.start}
                rangeEnd={activeRangeBounds.end}
              />
          )}
          {activeView === "sms" && (
            <SmsDashboard
                account={account}
                sms={accountSms}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
          )}
          {activeView === "automations" && (
            <AutomationDashboard
                account={account}
                automations={accountAutomations}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
          )}
          {activeView === "campaigns" && (
            <CampaignDashboard
                account={account}
                emails={accountEmails}
                sms={accountSms}
                showDeepAnalysis={effectiveShowDeepAnalysis}
              />
          )}
          {activeView === "planner" && (
            <Planner
              client={selectedClient}
              account={account}
              emails={allAccountEmails}
              sms={allAccountSms}
              plans={accountPlans}
              onUpsertPlan={upsertNewsletterPlan}
            />
          )}
          {activeView === "ai" && (
            isRestrictedUser ? (
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
          {activeView === "settings" && !isRestrictedUser && (
            <AccountSettings
              key={account.id}
              client={selectedClient}
              account={account}
              onUpdateAccount={updateAccountSettings}
            />
          )}
          {activeView === "admin" && !isRestrictedUser && (
            <AdminPanel
              canManageUsers={canManageUsers}
              clientName={selectedClient.name}
              clients={localClients}
              onCreateLiveClient={createLiveClient}
            />
          )}
        </div>
      </main>
      {!isRestrictedUser && (
        <FloatingAiChat
          clientId={selectedClient.id}
          view={activeView}
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
