"use client";

import {
  Activity,
  Building2,
  ArrowDownWideNarrow,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChartPie,
  CheckCircle2,
  ChevronDown,
  Calculator,
  Database,
  ExternalLink,
  KeyRound,
  History,
  Lightbulb,
  LineChart,
  Link2,
  Link2Off,
  ListFilter,
  MessageSquareText,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Send,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  chartColors,
  CampaignJourneyChart,
  EngagementPlot,
  PeriodComparisonChart,
  RankedBars,
  SmsReturnChart,
  RevenueShareChart,
  WeekdayBars,
  type PeriodComparisonPoint,
} from "@/components/reporting-charts";
import { ClientOnboardingWizard } from "@/components/client-onboarding-wizard";
import { AgencyPortfolio, type AgencyPortfolioRow } from "@/components/agency-portfolio";
import { campaignTiming, measuredRate } from "@/lib/report-chart-data";
import {
  matchNewsletterPlans,
  type OperationalPlanStatus,
  type PlanCampaignMatch,
  type PlannerCampaignReport,
} from "@/lib/planner-match";
import { accountDate, accountLocalTimestamp, reportRange, reportDateInstant } from "@/lib/report-time";
import { canonicalPortfolioAccounts } from "@/lib/portfolio";
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
  combineMetricSummaries,
  getAutomationSmsRecipients,
  summarizeAccount,
  summarizeSms,
} from "@/lib/metrics";
import {
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
  type AiGroundedResponse,
  type AiReportView,
} from "@/lib/ai-grounding";
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
  SyncHistoryEntry,
} from "@/lib/types";

type ViewKey =
  | "portfolio"
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
type HolidayRegion = "IL" | "US";
type SyncedHoliday = {
  date: string;
  name: string;
  region: HolidayRegion;
  source: "Hebcal" | "Nager.Date" | "local";
};

function LoginGate({ message }: { message: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return "";

    const messages: Record<string, string> = {
      CredentialsSignin: "הקוד אינו תקין או שפג תוקפו. אפשר לנסות שוב או לבקש קוד חדש.",
      AccessDenied: "האימייל אינו מורשה להיכנס לחשבון הזה.",
    };

    return messages[error] ?? "הכניסה לא הושלמה. בדוק את הפרטים ונסה שוב.";
  });

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function requestCode() {
    const identifier = email.trim().toLowerCase();
    if (!identifier) {
      setState("צריך להזין כתובת אימייל.");
      return;
    }
    if (submitting || resendSeconds > 0) return;
    setSubmitting(true);
    setState("שולח קוד כניסה...");
    try {
      const response = await fetch("/api/access-code/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: identifier }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שליחת הקוד נכשלה.");
      setEmail(identifier);
      setCode("");
      setStep("code");
      setResendSeconds(60);
      setState(payload.message);
    } catch (error) {
      setState(error instanceof Error ? error.message : "לא ניתן לשלוח קוד כרגע. נסה שוב בעוד רגע.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode();
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setState("צריך להזין קוד בן 6 ספרות.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setState("מאמת את הקוד...");
    try {
      const result = await signIn("email-code", {
        email,
        code,
        redirect: false,
        callbackUrl: "/",
      });

      if (!result?.ok || result.error) {
        setState("הקוד אינו תקין או שפג תוקפו. אפשר לבדוק את הקוד או לבקש קוד חדש.");
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
          {message || "הכניסה זמינה רק למיילים שאושרו מראש על ידי מנהל המערכת."}
        </p>

        {step === "email" ? <form onSubmit={submitEmail} className="space-y-3">
          <label className="block text-sm font-bold text-[#263548]">
            אימייל
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@addz.digital"
              autoComplete="email"
              required
              maxLength={254}
              className="mt-2 h-11 w-full rounded-lg border border-[#d0d5dd] px-3.5 text-left text-base outline-none transition focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0b0c10] text-sm font-bold text-white transition hover:bg-[#24262d] disabled:opacity-50"
          >
            <Send size={16} />
            {submitting ? "שולח..." : "שלחו לי קוד כניסה"}
          </button>
        </form> : <form onSubmit={submitCode} className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e4e7ec] bg-[#fcfcfd] px-3 py-2.5">
            <span className="min-w-0 truncate text-left text-sm font-bold text-[#344054]" dir="ltr">{email}</span>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setResendSeconds(0); setState(""); }} className="shrink-0 text-xs font-bold text-[#087f72]">שינוי</button>
          </div>
          <label className="block text-sm font-bold text-[#263548]">
            קוד כניסה
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              aria-describedby="login-code-help"
              required
              maxLength={6}
              className="mt-2 h-14 w-full rounded-lg border border-[#d0d5dd] px-3.5 text-center text-2xl font-black tracking-[0.35em] outline-none transition focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
              dir="ltr"
            />
          </label>
          <p id="login-code-help" className="text-xs leading-5 text-[#667085]">הקוד תקף ל־10 דקות וניתן לשימוש פעם אחת בלבד.</p>
          <button type="submit" disabled={submitting || code.length !== 6} className="h-11 w-full rounded-lg bg-[#0b0c10] text-sm font-bold text-white transition hover:bg-[#24262d] disabled:opacity-50">
            {submitting ? "מאמת..." : "כניסה"}
          </button>
          <button type="button" disabled={submitting || resendSeconds > 0} onClick={() => void requestCode()} className="h-9 w-full text-sm font-bold text-[#087f72] disabled:text-[#98a2b3]">
            {resendSeconds > 0 ? `שליחה חוזרת בעוד ${resendSeconds} שניות` : "שלחו קוד חדש"}
          </button>
        </form>}

        {state && <p role="status" className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#4a5870]">{state}</p>}
        <p className="mt-4 text-xs text-[#667085]">הקוד נשלח רק לכתובת שאושרה מראש במערכת.</p>
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
  { key: "portfolio", label: "סוכנות", icon: Building2 },
  { key: "overview", label: "כללי", icon: LineChart, module: "reports" },
  { key: "sms", label: "SMS", icon: MessageSquareText, module: "reports" },
  { key: "automations", label: "אוטומציות", icon: RefreshCw, module: "reports" },
  { key: "campaigns", label: "קמפיינים", icon: Send, module: "reports" },
  { key: "planner", label: "גאנט דיוורים", icon: CalendarDays, module: "planner" },
  { key: "ai", label: "AI", icon: Bot, module: "ai" },
  { key: "settings", label: "הגדרות", icon: Settings },
  { key: "admin", label: "ניהול", icon: ShieldCheck },
];

const timeRanges: { key: TimeRangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 ימים", days: 7 },
  { key: "14d", label: "14 ימים", days: 14 },
  { key: "30d", label: "30 ימים", days: 30 },
  { key: "custom", label: "מותאם", days: null },
  { key: "all", label: "הכל", days: null },
];

const statusLabels = {
  planned: "מתוכנן",
  postponed: "נדחה",
  draft: "טיוטה",
  ready: "מוכן",
  approved: "מאושר",
  sent: "נשלח",
};

const operationalStatusLabels: Record<OperationalPlanStatus, string> = {
  planned: "מתוכנן",
  sent: "נשלח",
  postponed: "נדחה",
  not_found: "לא נמצא",
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
      date,
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

function getMonthDateRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(finalDay).padStart(2, "0")}`,
  };
}

function isDateInRange(date: string, start: string, end: string) {
  return (!start || date >= start) && (!end || date <= end);
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
    role: "owner" | "admin" | "client";
  };
  clients: Client[];
  accounts: FlashyAccount[];
  emailReports: EmailCampaignReport[];
  smsReports: SmsCampaignReport[];
  automationReports: AutomationReport[];
  newsletterPlans: NewsletterPlan[];
  syncHistory: SyncHistoryEntry[];
};

type AdminUserAccess = {
  isOwner: boolean;
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "client";
  status: "active" | "suspended";
  lastLoginAt: string | null;
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

type DrilldownItem = {
  id: string;
  title: string;
  subtitle: string;
  date?: string;
  revenue: number;
  cost: number;
  purchases: number;
  recipients: number;
  clicks: number;
  opens?: number;
};

type DrilldownState = {
  title: string;
  context: string;
  items: DrilldownItem[];
};

function performanceToDrilldown(item: PerformanceItem): DrilldownItem {
  return {
    id: item.id,
    title: item.name,
    subtitle: `${item.channel} · ${item.kind === "campaign" ? "קמפיין" : "אוטומציה"}`,
    date: item.date,
    revenue: item.revenue,
    cost: item.cost,
    purchases: item.purchases,
    recipients: item.recipients,
    clicks: item.clicks,
    opens: item.opens,
  };
}

function ChartDrilldown({
  state,
  currency,
  onClose,
}: {
  state: DrilldownState | null;
  currency: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!state) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [state, onClose]);

  if (!state) return null;

  const items = [...state.items].sort((a, b) => b.revenue - a.revenue);
  const totals = items.reduce(
    (result, item) => ({
      revenue: result.revenue + item.revenue,
      cost: result.cost + item.cost,
      purchases: result.purchases + item.purchases,
      recipients: result.recipients + item.recipients,
    }),
    { revenue: 0, cost: 0, purchases: 0, recipients: 0 },
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-[#0b0c10]/35 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-drilldown-title"
        className="flex h-full w-full max-w-[520px] flex-col bg-[#f7f9fa] shadow-[-24px_0_70px_rgba(11,12,16,0.18)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#e4e7ec] bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#087f72]">פירוט מהגרף</p>
            <h2 id="chart-drilldown-title" className="mt-1 text-xl font-black text-[#111318]">
              {state.title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#667085]">{state.context}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת פירוט"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-[#d0d5dd] text-[#475467] transition hover:bg-[#f2f4f7]"
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-[#e4e7ec] bg-[#e4e7ec] sm:grid-cols-4">
          {[
            ["הכנסה", formatCurrency(totals.revenue, currency)],
            ["עלות", formatCurrency(totals.cost, currency)],
            ["רכישות", formatNumber(totals.purchases)],
            ["נמענים", formatNumber(totals.recipients)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-3">
              <p className="text-[11px] text-[#667085]">{label}</p>
              <p className="mt-1 text-base font-black tabular-nums text-[#111318]" dir="ltr">{value}</p>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-[#667085]">
            <span>{formatNumber(items.length)} פעילויות</span>
            <span>מסודר לפי הכנסה</span>
          </div>
          {items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
              {items.map((item) => (
                <article key={item.id} className="border-b border-[#eef0f2] p-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold leading-5 text-[#111318] [overflow-wrap:anywhere]">{item.title}</h3>
                      <p className="mt-1 text-[11px] text-[#667085]">
                        {item.subtitle}{item.date ? ` · ${new Date(`${item.date}T12:00:00`).toLocaleDateString("he-IL")}` : ""}
                      </p>
                    </div>
                    <b className="shrink-0 text-sm tabular-nums text-[#111318]" dir="ltr">
                      {formatCurrency(item.revenue, currency)}
                    </b>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
                    <span>{formatNumber(item.purchases)} רכישות</span>
                    <span>{formatNumber(item.recipients)} נמענים</span>
                    <span>{formatNumber(item.clicks)} קליקים</span>
                    {item.cost > 0 && <span>עלות {formatCurrency(item.cost, currency)}</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-48 place-content-center rounded-lg border border-[#e4e7ec] bg-white text-sm text-[#667085]">
              אין פעילויות להצגה בבחירה הזו
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

interface FlashyReconcileResult {
  checkedAt: string;
  snapshotAt: string;
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
  automationDifferences: {
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
  campaignRevenue,
  automationRevenue,
}: {
  account: FlashyAccount;
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  campaignRevenue: number;
  automationRevenue: number;
}) {
  const totalCost = summary.smsCost + summary.fixedCosts;
  const revenueComparison = comparisonChange(summary.revenue, previousSummary?.revenue ?? null);
  const RevenueComparisonIcon = revenueComparison?.direction === "up"
    ? ArrowUpRight
    : revenueComparison?.direction === "down"
      ? ArrowDownRight
      : Minus;
  const averageRevenuePerPurchase = summary.purchases > 0 ? summary.revenue / summary.purchases : null;
  const previousAverageRevenuePerPurchase = previousSummary && previousSummary.purchases > 0
    ? previousSummary.revenue / previousSummary.purchases
    : null;
  const campaignShare = summary.revenue > 0 ? campaignRevenue / summary.revenue : 0;
  const automationShare = summary.revenue > 0 ? automationRevenue / summary.revenue : 0;
  const compactMetrics = [
    {
      key: "averagePurchase",
      label: "הכנסה ממוצעת לרכישה",
      value: averageRevenuePerPurchase === null ? "—" : formatCurrency(averageRevenuePerPurchase, account.currency),
      rawValue: averageRevenuePerPurchase,
      previousValue: previousAverageRevenuePerPurchase,
      detail: "הכנסה מיוחסת חלקי רכישות",
      icon: Calculator,
      accent: "#6389d9",
    },
    {
      key: "purchases",
      label: "רכישות מיוחסות",
      value: formatNumber(summary.purchases),
      rawValue: summary.purchases,
      previousValue: previousSummary?.purchases ?? null,
      detail: `המרה ${formatPercent(summary.conversionRate)}`,
      icon: CheckCircle2,
      accent: "#20b9a8",
    },
    {
      key: "profit",
      label: "רווח אחרי עלויות",
      value: formatCurrency(summary.profit, account.currency),
      rawValue: summary.profit,
      previousValue: previousSummary?.profit ?? null,
      detail: `${formatCurrency(totalCost, account.currency)} עלויות · ${formatRoas(summary.roas)} ROAS`,
      icon: TrendingUp,
      accent: summary.profit >= 0 ? "#111318" : "#b45309",
    },
  ];

  return (
    <section dir="rtl" className="grid overflow-hidden rounded-xl border border-[#dfe3e7] bg-[#dfe3e7] sm:grid-cols-3 lg:grid-cols-[minmax(310px,1.4fr)_repeat(3,minmax(0,1fr))]">
      <article className="relative min-w-0 overflow-hidden bg-[#111318] p-5 text-white sm:col-span-3 lg:col-span-1 lg:p-6">
        <div className="absolute inset-y-0 right-0 w-1 bg-[#42dfcf]" />
        <p className="text-xs font-medium text-white/60">הכנסה מיוחסת לפעילות</p>
        <p className="mt-3 text-right text-4xl font-bold leading-none tabular-nums sm:text-5xl">
          {formatCurrency(summary.revenue, account.currency)}
        </p>
        <div className="mt-4 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
          {revenueComparison && previousSummary ? (
            <>
              <span className={classNames(
                "inline-flex items-center gap-1 font-bold",
                revenueComparison.direction === "up" ? "text-[#42dfcf]" : revenueComparison.direction === "down" ? "text-[#fbbf72]" : "text-white/65",
              )}>
                <RevenueComparisonIcon size={14} />
                {revenueComparison.label}
              </span>
              <span className="text-white/45">קודם {formatCurrency(previousSummary.revenue, account.currency)}</span>
            </>
          ) : (
            <span className="text-white/50">קמפיינים ואוטומציות בטווח הנבחר</span>
          )}
        </div>
        <div className="mt-5">
          <div className="flex h-2 overflow-hidden rounded-sm bg-white/10" dir="ltr" aria-label={`קמפיינים ${formatPercent(campaignShare)}, אוטומציות ${formatPercent(automationShare)}`}>
            <i className="h-full bg-[#42dfcf]" style={{ width: `${Math.max(0, campaignShare) * 100}%` }} />
            <i className="h-full bg-[#6389d9]" style={{ width: `${Math.max(0, automationShare) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-white/60">
            <span><i className="ml-1.5 inline-block size-2 rounded-sm bg-[#42dfcf]" />קמפיינים {formatPercent(campaignShare)}</span>
            <span><i className="ml-1.5 inline-block size-2 rounded-sm bg-[#6389d9]" />אוטומציות {formatPercent(automationShare)}</span>
          </div>
        </div>
      </article>
      {compactMetrics.map((metric) => {
        const comparison = comparisonChange(metric.rawValue, metric.previousValue);
        const ComparisonIcon = comparison?.direction === "up" ? ArrowUpRight : comparison?.direction === "down" ? ArrowDownRight : Minus;
        const Icon = metric.icon;
        return <article key={metric.key} className="relative min-w-0 overflow-hidden bg-white p-4 text-[#111318] lg:p-5">
          <i className="absolute inset-x-0 top-0 h-0.5" style={{ background: metric.accent }} />
          <div className="flex min-h-6 items-start justify-between gap-2">
            <p className="text-xs font-medium text-[#667085]">{metric.label}</p>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#f2f4f7]" style={{ color: metric.accent }}><Icon size={16} /></span>
          </div>
          <p className="mt-3 text-right text-2xl font-bold leading-none tabular-nums sm:text-3xl">{metric.value}</p>
          {comparison && (
            <span className={classNames(
              "mt-2 inline-flex items-center gap-1 text-[11px] font-bold",
              comparison.direction === "up" ? "text-[#087f72]" : comparison.direction === "down" ? "text-[#b45309]" : "text-[#667085]",
            )}><ComparisonIcon size={13} />{comparison.label}</span>
          )}
          <p className="mt-3 text-xs leading-5 text-[#667085]">{metric.detail}</p>
        </article>;
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
  const snapshotAgeMs = reconcileResult
    ? new Date(reconcileResult.checkedAt).getTime() - new Date(reconcileResult.snapshotAt).getTime()
    : 0;
  const apiLikelyAdvancedSinceSync = reconcileResult
    ? apiHasGap &&
      snapshotAgeMs > 5 * 60 * 1000
    : false;
  const hasSalesOverviewDifference = Math.abs(campaignUiDelta) > 1 || Math.abs(automationUiDelta) > 1;
  const qaConclusion = reconcileResult
    ? apiHasGap
      ? apiLikelyAdvancedSinceSync
        ? {
            title: "Flashy התעדכן מאז הסנכרון האחרון",
            body: `ה־snapshot נשמר ב־${new Date(reconcileResult.snapshotAt).toLocaleString("he-IL")} ומאז Flashy החזיר ערכים חדשים. רענון החשבון יעדכן גם המרות שנוספו לפעילות קיימת וגם שורות חדשות.`,
            tone: "neutral" as const,
          }
        : {
            title: "ה־snapshot אינו תואם ל־Flashy API",
            body: "יש שינוי במספר הרשומות או ירידה בערכים. רענן את החשבון ובדוק שוב; אם הפער נשאר, נדרשת בדיקת מיפוי.",
            tone: "warn" as const,
          }
      : hasSalesOverviewDifference
        ? {
            title: "Sales Overview משתמש בהגדרת זמן אחרת",
            body: reconcileResult.boundaryCampaignCandidates.length
              ? "ה־API תואם לדאשבורד. Sales Overview כולל רכישות שבוצעו בטווח גם אם הקמפיין נשלח קודם; נמצאו למטה קמפיינים מוקדמים לבדיקה."
              : "ה־API תואם לדאשבורד. Sales Overview מסנן לפי מועד הרכישה, בעוד דוחות הפעילות מסננים לפי מועד שליחת הקמפיין או פעילות האוטומציה.",
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
            אימות מול Flashy API והשוואת שיטת המדידה מול Sales Overview.
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
            נתוני Sales Overview משמשים להשוואת הגדרות זמן בלבד ואינם משנים את הדאשבורד.
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
          <p className="text-xs font-black text-[#65738a]">הפרש מול Sales Overview</p>
          <p className="mt-1 text-xl font-black text-[#40506a]">
            {flashyUiCampaignValue || flashyUiAutomationValue
              ? formatCurrency(campaignUiDelta + automationUiDelta, account.currency)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-[#65738a]">
            {flashyUiCampaignValue || flashyUiAutomationValue
              ? `הפרש הגדרות: קמפיינים ${formatCurrency(campaignUiDelta, account.currency)} · אוטומציות ${formatCurrency(automationUiDelta, account.currency)}`
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
              <div className="rounded-lg border border-[#dfe7ee] bg-white p-3">
                <p className="text-xs font-black text-[#65738a]">השוואת הגדרות - קמפיינים</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>דאשבורד: {formatCurrency(campaignRevenue, account.currency)}</span>
                  <span>Flashy UI: {formatCurrency(flashyUiCampaignValue, account.currency)}</span>
                  <span className="font-black text-[#40506a]">
                    הפרש: {formatCurrency(campaignUiDelta, account.currency)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-[#dfe7ee] bg-white p-3">
                <p className="text-xs font-black text-[#65738a]">השוואת הגדרות - אוטומציות</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>דאשבורד: {formatCurrency(automationRevenue, account.currency)}</span>
                  <span>Flashy UI: {formatCurrency(flashyUiAutomationValue, account.currency)}</span>
                  <span className="font-black text-[#40506a]">
                    הפרש: {formatCurrency(automationUiDelta, account.currency)}
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
                  <p className="border-b border-[#eef3f7] px-3 py-2 text-xs font-black text-[#40506a]">
                    קמפיינים שהשתנו מאז הסנכרון
                  </p>
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

              {reconcileResult.automationDifferences.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-[#eef3f7] bg-white">
                  <p className="border-b border-[#eef3f7] px-3 py-2 text-xs font-black text-[#40506a]">
                    אוטומציות שהשתנו מאז הסנכרון
                  </p>
                  <div className="grid grid-cols-[1fr_110px_110px_100px] gap-2 border-b border-[#eef3f7] px-3 py-2 text-xs font-black text-[#65738a]">
                    <span>אוטומציה</span>
                    <span>דאשבורד</span>
                    <span>Flashy</span>
                    <span>פער</span>
                  </div>
                  {reconcileResult.automationDifferences.slice(0, 6).map((item, index) => (
                    <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_110px_110px_100px] gap-2 border-b border-[#f4f6f8] px-3 py-2 text-xs last:border-b-0">
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
                <div className="mt-3 overflow-hidden rounded-lg border border-[#dfe7ee] bg-white">
                  <div className="border-b border-[#dfe7ee] px-3 py-2">
                    <p className="text-xs font-black text-[#40506a]">
                      קמפיינים מוקדמים שעשויים להיכלל ב־Sales Overview
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-[#65738a]">
                      הסכומים הם ההכנסה המיוחסת לכל קמפיין בדוח הפעילות, ולא ההכנסה שנוצרה רק בתוך הטווח.
                    </p>
                  </div>
                  {reconcileResult.boundaryCampaignCandidates.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 border-b border-[#eef3f7] px-3 py-2 text-xs last:border-b-0">
                      <span className="truncate font-bold">{item.name}</span>
                      <span className="shrink-0 font-black text-[#40506a]">
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

type OverviewRevenueDimension = {
  key: string;
  label: string;
  revenue: number;
  count: number;
  purchases: number;
  color: string;
  detail: string;
  items: PerformanceItem[];
};

function OverviewRevenueBreakdown({
  currency,
  total,
  sources,
  channels,
  onSelect,
}: {
  currency: string;
  total: number;
  sources: OverviewRevenueDimension[];
  channels: OverviewRevenueDimension[];
  onSelect: (dimension: OverviewRevenueDimension) => void;
}) {
  const [viewMode, setViewMode] = useState<"bars" | "donut" | "list">("bars");

  const renderGroup = (title: string, detail: string, rows: OverviewRevenueDimension[]) => {
    const positiveTotal = rows.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
    const maxRevenue = Math.max(...rows.map((row) => Math.max(0, row.revenue)), 1);
    let donutOffset = 0;
    const donutStops = rows.map((row) => {
      const start = donutOffset;
      donutOffset += positiveTotal > 0 ? Math.max(0, row.revenue) / positiveTotal * 100 : 0;
      return `${row.color} ${start}% ${donutOffset}%`;
    }).join(", ");

    const rowButton = (row: OverviewRevenueDimension, visual: "bar" | "list") => {
      const share = total > 0 ? row.revenue / total : 0;
      return (
        <button
          type="button"
          key={row.key}
          onClick={() => onSelect(row)}
          className="group w-full py-3 text-right transition hover:bg-[#f8fbfa] focus-visible:outline-2 focus-visible:outline-[#20b9a8]"
        >
          <span className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-bold text-[#111318]">
                <i className="h-4 w-1 shrink-0 rounded-sm" style={{ background: row.color }} />
                {row.label}
              </span>
              <span className="mt-1 block truncate pr-3 text-[11px] text-[#667085]">{row.detail}</span>
            </span>
            <span className="shrink-0 text-left">
              <b className="block text-base tabular-nums text-[#111318]" dir="ltr">{formatCurrency(row.revenue, currency)}</b>
              <span className="text-xs tabular-nums text-[#667085]">{formatPercent(share)}</span>
            </span>
          </span>
          {visual === "bar" && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-sm bg-[#eef0f2]" aria-hidden="true" dir="ltr">
              <i
                className="block h-full rounded-sm transition-[width] duration-300"
                style={{ width: `${Math.max(0, row.revenue) / maxRevenue * 100}%`, background: row.color }}
              />
            </span>
          )}
        </button>
      );
    };

    return (
      <div className="min-w-0 p-4 sm:p-5">
        <div>
          <h3 className="text-sm font-bold text-[#111318]">{title}</h3>
          <p className="mt-1 text-xs text-[#667085]">{detail}</p>
        </div>
        {viewMode === "donut" ? (
          <div className="mt-4 grid items-center gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div
              className="relative mx-auto aspect-square w-[140px] rounded-full"
              style={{ background: positiveTotal > 0 ? `conic-gradient(${donutStops})` : "#eef0f2" }}
              aria-label={`${title}: ${formatCurrency(positiveTotal, currency)}`}
            >
              <span className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
                <span>
                  <b className="block text-base tabular-nums text-[#111318]" dir="ltr">{formatCurrency(positiveTotal, currency)}</b>
                  <small className="text-[10px] text-[#667085]">סה״כ</small>
                </span>
              </span>
            </div>
            <div className="divide-y divide-[#eef0f2]">{rows.map((row) => rowButton(row, "list"))}</div>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-[#eef0f2]">
            {rows.map((row) => rowButton(row, viewMode === "bars" ? "bar" : "list"))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section dir="rtl" className="col-span-12 min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f2] px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-base font-bold text-[#111318]">פירוק הכנסות</h2>
          <p className="mt-1 text-xs text-[#667085]">אותו סכום כולל, בשתי זוויות שונות</p>
        </div>
        <div role="group" aria-label="סוג תצוגת פירוק הכנסות" className="flex rounded-md border border-[#d0d5dd] bg-[#f8fafb] p-0.5">
          {([
            { key: "bars" as const, label: "עמודות", icon: ChartNoAxesColumnIncreasing },
            { key: "donut" as const, label: "טבעת", icon: ChartPie },
            { key: "list" as const, label: "רשימה", icon: Rows3 },
          ]).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={viewMode === option.key}
                onClick={() => setViewMode(option.key)}
                className={classNames(
                  "grid size-8 place-items-center rounded-sm transition",
                  viewMode === option.key ? "bg-[#111318] text-white shadow-sm" : "text-[#667085] hover:bg-white hover:text-[#111318]",
                )}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      </header>
      <div className="grid divide-y divide-[#e4e7ec] lg:grid-cols-2 lg:divide-x lg:divide-y-0 lg:divide-x-reverse">
        {renderGroup("לפי מקור", "קמפיינים מול אוטומציות", sources)}
        {renderGroup("לפי ערוץ", "אימייל, SMS ואוטומציות מעורבות", channels)}
      </div>
    </section>
  );
}

type TopCampaignRow = {
  id: string;
  name: string;
  medium: "email" | "sms";
  revenue: number;
  recipients: number;
  openRate: number | null;
  clickRate: number | null;
  purchases: number;
  conversionRate: number | null;
  item: PerformanceItem;
};

function TopCampaignsPanel({
  rows,
  currency,
  onSelect,
}: {
  rows: TopCampaignRow[];
  currency: string;
  onSelect: (row: TopCampaignRow) => void;
}) {
  const [filter, setFilter] = useState<"all" | "email" | "sms">("all");
  const filteredRows = rows
    .filter((row) => filter === "all" || row.medium === filter)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
  const maxRevenue = Math.max(...filteredRows.map((row) => row.revenue), 1);
  const rate = (value: number | null) => value === null ? "—" : formatPercent(value);

  return (
    <section dir="rtl" className="col-span-12 min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f2] px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-base font-bold text-[#111318]">הקמפיינים המובילים</h2>
          <p className="mt-1 text-xs text-[#667085]">ביצועים מלאים, מדורגים לפי הכנסה מיוחסת</p>
        </div>
        <div role="group" aria-label="סינון קמפיינים מובילים" className="flex rounded-md border border-[#d0d5dd] bg-[#f8fafb] p-0.5 text-xs font-bold">
          {([
            { key: "all" as const, label: "הכל" },
            { key: "email" as const, label: "אימייל" },
            { key: "sms" as const, label: "SMS" },
          ]).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={classNames(
                "min-h-8 rounded-sm px-3 transition",
                filter === option.key ? "bg-[#111318] text-white shadow-sm" : "text-[#667085] hover:bg-white hover:text-[#111318]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <div className="hidden grid-cols-[minmax(220px,1.6fr)_repeat(6,minmax(70px,0.65fr))] gap-3 border-b border-[#eef0f2] bg-[#fafbfc] px-5 py-2 text-[11px] font-bold text-[#667085] lg:grid">
        <span>קמפיין</span>
        <span>הכנסה</span>
        <span>נמענים</span>
        <span>פתיחה</span>
        <span>הקלקה</span>
        <span>רכישות</span>
        <span>המרה מקליק</span>
      </div>
      <div className="divide-y divide-[#eef0f2]">
        {filteredRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            className="grid w-full gap-3 px-4 py-4 text-right transition hover:bg-[#f8fbfa] focus-visible:outline-2 focus-visible:outline-[#20b9a8] lg:grid-cols-[minmax(220px,1.6fr)_repeat(6,minmax(70px,0.65fr))] lg:items-center lg:px-5"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <i className="size-2 shrink-0 rounded-sm" style={{ background: row.medium === "sms" ? chartColors.sms : chartColors.email }} />
                <b className="truncate text-sm text-[#111318]">{row.name}</b>
              </span>
              <span className="mt-2 block h-1 overflow-hidden rounded-sm bg-[#eef0f2]" dir="ltr" aria-hidden="true">
                <i className="block h-full rounded-sm" style={{ width: `${Math.max(0, row.revenue) / maxRevenue * 100}%`, background: row.medium === "sms" ? chartColors.sms : chartColors.email }} />
              </span>
              <small className="mt-1 block text-[10px] font-medium text-[#667085]">{row.medium === "sms" ? "SMS" : "אימייל"}</small>
            </span>
            {[
              ["הכנסה", formatCurrency(row.revenue, currency)],
              ["נמענים", formatNumber(row.recipients)],
              ["פתיחה", rate(row.openRate)],
              ["הקלקה", rate(row.clickRate)],
              ["רכישות", formatNumber(row.purchases)],
              ["המרה מקליק", rate(row.conversionRate)],
            ].map(([label, value]) => (
              <span key={label} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs lg:block">
                <span className="text-[#667085] lg:hidden">{label}</span>
                <b className="tabular-nums text-[#111318]" dir="ltr">{value}</b>
              </span>
            ))}
          </button>
        ))}
        {filteredRows.length === 0 && <p className="px-5 py-8 text-center text-sm text-[#667085]">אין קמפיינים בערוץ הזה בטווח שנבחר.</p>}
      </div>
    </section>
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
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
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
  const campaignItems = performanceItems.filter((item) => item.kind === "campaign");
  const automationItems = performanceItems.filter((item) => item.kind === "automation");
  const campaignLeaderRows: TopCampaignRow[] = [
    ...emails.map((report) => {
      const item = campaignItems.find((candidate) => candidate.id === `email-${report.id}`)!;
      return {
        id: item.id,
        name: report.campaignName,
        medium: "email" as const,
        revenue: report.revenueGenerated,
        recipients: report.totalRecipients,
        openRate: report.totalDelivered > 0 ? report.totalOpens / report.totalDelivered : null,
        clickRate: report.totalDelivered > 0 ? report.uniqueClicks / report.totalDelivered : null,
        purchases: report.purchases,
        conversionRate: report.uniqueClicks > 0 ? report.purchases / report.uniqueClicks : null,
        item,
      };
    }),
    ...sms.map((report) => {
      const item = campaignItems.find((candidate) => candidate.id === `sms-${report.id}`)!;
      return {
        id: item.id,
        name: report.campaignName,
        medium: "sms" as const,
        revenue: report.revenueGenerated,
        recipients: report.totalRecipients,
        openRate: null,
        clickRate: report.totalDelivered > 0 ? report.uniqueClicks / report.totalDelivered : null,
        purchases: report.purchases,
        conversionRate: report.uniqueClicks > 0 ? report.purchases / report.uniqueClicks : null,
        item,
      };
    }),
  ];
  const emailAutomationIds = new Set(
    automations.filter((item) => getAutomationType(item) === "email").map((item) => `automation-${item.id}`),
  );
  const smsAutomationIds = new Set(
    automations.filter((item) => getAutomationType(item) === "sms").map((item) => `automation-${item.id}`),
  );
  const mixedAutomationIds = new Set(
    automations.filter((item) => getAutomationType(item) === "mixed").map((item) => `automation-${item.id}`),
  );
  const emailItems = performanceItems.filter((item) => item.medium === "email" && (item.kind === "campaign" || emailAutomationIds.has(item.id)));
  const smsItems = performanceItems.filter((item) => item.medium === "sms" && (item.kind === "campaign" || smsAutomationIds.has(item.id)));
  const mixedItems = performanceItems.filter((item) => mixedAutomationIds.has(item.id));
  const dimension = (
    key: string,
    label: string,
    items: PerformanceItem[],
    color: string,
    detail: string,
  ): OverviewRevenueDimension => ({
    key,
    label,
    items,
    color,
    detail,
    revenue: items.reduce((sum, item) => sum + item.revenue, 0),
    count: items.length,
    purchases: items.reduce((sum, item) => sum + item.purchases, 0),
  });
  const sourceDimensions = [
    dimension("source-campaigns", "קמפיינים", campaignItems, chartColors.email, `${formatNumber(campaignItems.length)} קמפיינים`),
    dimension("source-automations", "אוטומציות", automationItems, chartColors.automation, `${formatNumber(automationItems.length)} אוטומציות`),
  ];
  const channelDimensions = [
    dimension("channel-email", "אימייל", emailItems, chartColors.email, `${formatNumber(emailItems.length)} פעילויות אימייל`),
    dimension("channel-sms", "SMS", smsItems, chartColors.sms, `${formatNumber(smsItems.length)} פעילויות SMS`),
    ...(mixedItems.length > 0
      ? [dimension("channel-mixed", "מעורב", mixedItems, chartColors.automation, "אוטומציות שמשלבות אימייל ו־SMS")]
      : []),
  ];
  const campaignTimingRows = [
    ...emails.map((item) => ({ sentAt: item.sentAt, revenue: item.revenueGenerated, purchases: item.purchases })),
    ...sms.map((item) => ({ sentAt: item.sentAt, revenue: item.revenueGenerated, purchases: item.purchases })),
  ];
  const timing = campaignTiming(campaignTimingRows, account.timezone);
  const bestHours = timing.hours.map((row) => ({
    ...row,
    average: row.count > 0 ? row.revenue / row.count : 0,
  }));
  let campaignClock: Intl.DateTimeFormat;
  try {
    campaignClock = new Intl.DateTimeFormat("en-US", {
      timeZone: account.timezone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    campaignClock = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  }
  const campaignTimingKey = (sentAt: string) => {
    const parts = campaignClock.formatToParts(new Date(sentAt));
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    return {
      day: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][dayIndex] ?? "",
      hour: `${parts.find((part) => part.type === "hour")?.value ?? "00"}:00`,
    };
  };
  const campaignItemsForTime = (value: string, unit: "day" | "hour") => {
    const ids = new Set([
      ...emails.filter((item) => campaignTimingKey(item.sentAt)[unit] === value).map((item) => `email-${item.id}`),
      ...sms.filter((item) => campaignTimingKey(item.sentAt)[unit] === value).map((item) => `sms-${item.id}`),
    ]);
    return campaignItems.filter((item) => ids.has(item.id));
  };
  return (
    <section dir="rtl" className="grid grid-cols-12 gap-3">
      <div className="col-span-12">
        <KPIGrid
          account={account}
          summary={summary}
          previousSummary={previousSummary}
          campaignRevenue={sourceDimensions[0]?.revenue ?? 0}
          automationRevenue={sourceDimensions[1]?.revenue ?? 0}
        />
      </div>

      {comparisonPoints.length > 0 && (
        <div className="col-span-12 min-w-0">
          <PeriodComparisonChart
            points={comparisonPoints}
            currency={account.currency}
            previousRangeLabel={previousRangeLabel}
            onSelect={(point, series) => {
              const channel = series === "email" ? "אימייל" : series === "sms" ? "SMS" : "אוטומציות";
              const items = performanceItems.filter((item) => item.date === point.date && item.channel === channel);
              setDrilldown({
                title: `${channel} · ${point.label}`,
                context: "הפעילויות שמרכיבות את הנקודה שנבחרה",
                items: items.map(performanceToDrilldown),
              });
            }}
          />
        </div>
      )}

      <OverviewRevenueBreakdown
        currency={account.currency}
        total={summary.revenue}
        sources={sourceDimensions}
        channels={channelDimensions}
        onSelect={(selected) => setDrilldown({
          title: selected.label,
          context: "הפעילויות שמרכיבות את ההכנסה שנבחרה",
          items: selected.items.map(performanceToDrilldown),
        })}
      />

      <TopCampaignsPanel
        rows={campaignLeaderRows}
        currency={account.currency}
        onSelect={(selected) => setDrilldown({
          title: selected.name,
          context: "פירוט הקמפיין",
          items: [performanceToDrilldown(selected.item)],
        })}
      />

      <div className="col-span-12 min-w-0">
        <RankedBars
          title="האוטומציות המובילות"
          detail="מדורג לפי הכנסה מיוחסת"
          currency={account.currency}
          limit={5}
          rows={automationItems.map((item) => {
            const report = automations.find((candidate) => `automation-${candidate.id}` === item.id);
            return {
              id: item.id,
              label: item.name,
              value: item.revenue,
              color: chartColors.automation,
              meta: `${report ? automationFilterLabels[getAutomationType(report)] : "אוטומציה"} · ${formatNumber(item.purchases)} רכישות`,
            };
          })}
          onSelect={(selected) => {
            const item = automationItems.find((candidate) => candidate.id === selected.id);
            if (item) setDrilldown({ title: item.name, context: "פירוט האוטומציה", items: [performanceToDrilldown(item)] });
          }}
        />
      </div>

      <div className="col-span-12 grid min-w-0 gap-3 xl:grid-cols-2">
        <WeekdayBars
          groups={timing.days}
          currency={account.currency}
          timezone={timing.timezone}
          onSelect={(label) => setDrilldown({
            title: `קמפיינים ביום ${label}`,
            context: "הקמפיינים שנשלחו ביום הזה בטווח שנבחר",
            items: campaignItemsForTime(label, "day").map(performanceToDrilldown),
          })}
        />
        <RankedBars
          title="השעות החזקות"
          detail={`הכנסה ממוצעת לקמפיין · ${timing.timezone}`}
          currency={account.currency}
          limit={5}
          rows={bestHours.map((item) => ({
            id: item.label,
            label: item.label,
            value: item.average,
            color: chartColors.sms,
            meta: `${formatNumber(item.count)} קמפיינים · ${formatNumber(item.purchases)} רכישות`,
          }))}
          onSelect={(selected) => setDrilldown({
            title: `שעת שליחה ${selected.id}`,
            context: "הקמפיינים שנשלחו בשעה הזו בטווח שנבחר",
            items: campaignItemsForTime(selected.id, "hour").map(performanceToDrilldown),
          })}
        />
      </div>

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

      <ChartDrilldown state={drilldown} currency={account.currency} onClose={() => setDrilldown(null)} />
    </section>
  );
}


function SmsDashboard({ account, sms, automations, showDeepAnalysis }: {
  account: FlashyAccount; sms: SmsCampaignReport[]; automations: AutomationReport[]; showDeepAnalysis: boolean;
}) {
  const [sortBy, setSortBy] = useState<"revenue" | "roas">("revenue");
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const smsAutomations = automations.filter(item => getAutomationSmsRecipients(item) > 0);
  const summary = summarizeSms(account, sms, smsAutomations);
  const rows = [
    ...sms.map(item => ({
      id: item.id, date: item.sentAt.slice(0, 10), name: item.campaignName, type: "קמפיינים", revenue: item.revenueGenerated, comparable: true,
      cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
      recipients: item.totalRecipients, clicks: item.totalClicks, purchases: item.purchases,
    })),
    ...smsAutomations.map(item => ({
      id: item.id, date: item.date, name: item.automationName, type: "אוטומציות עם SMS", revenue: item.revenueGenerated, comparable: getAutomationType(item) === "sms",
      cost: getAutomationSmsRecipients(item) * account.smsCreditPriceUsd * account.usdIlsRate,
      recipients: getAutomationSmsRecipients(item), clicks: item.clickedSms ?? item.totalClicks, purchases: item.purchases,
    })),
  ];
  const rowsForGroup = (label: string) => rows.filter(row => label === "קמפיינים" ? row.type === label : row.type !== "קמפיינים" && row.comparable === (label === "אוטומציות SMS"));
  const toDrilldownItem = (row: (typeof rows)[number]): DrilldownItem => ({
    id: row.id,
    title: row.name,
    subtitle: row.type,
    date: row.date,
    revenue: row.revenue,
    cost: row.cost,
    purchases: row.purchases,
    recipients: row.recipients,
    clicks: row.clicks,
  });
  const groups = ["קמפיינים", "אוטומציות SMS", "אוטומציות מעורבות"].map(label => {
    const items = rowsForGroup(label);
    return { label, comparable: label !== "אוטומציות מעורבות", revenue: items.reduce((s,r) => s+r.revenue,0), cost: items.reduce((s,r) => s+r.cost,0), count: items.length };
  });
  const smsCampaignDelivered = sms.reduce((total, item) => total + item.totalDelivered, 0);
  const smsCampaignClicks = sms.reduce((total, item) => total + item.uniqueClicks, 0);
  const smsCampaignPurchases = sms.reduce((total, item) => total + item.purchases, 0);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
      <MetricCard title="הכנסות פעילות SMS" value={formatCurrency(summary.revenue, account.currency)} caption="קמפיינים ואוטומציות עם SMS" icon={TrendingUp} tone="good" />
      <MetricCard title="עלות SMS" value={formatCurrency(summary.smsCost, account.currency)} caption={`${formatNumber(summary.recipients)} הודעות`} icon={MessageSquareText} />
      <MetricCard title="הכנסה / עלות SMS" value={formatRoas(summary.roas)} caption="כולל הכנסות אוטומציות מעורבות" icon={LineChart} />
      <MetricCard title="רכישות" value={formatNumber(summary.purchases)} caption="מהפעילות שנבחרה" icon={CheckCircle2} />
    </div>
    <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
      <CampaignJourneyChart
        title="מסלול קמפיין SMS"
        detail="מהודעות שנמסרו ועד רכישה"
        series={[{
          id: "sms-campaigns",
          label: "קמפייני SMS",
          color: chartColors.sms,
          stages: [
            { label: "נמסרו", value: smsCampaignDelivered },
            { label: "הקלקות ייחודיות", value: smsCampaignClicks },
            { label: "רכישות", value: smsCampaignPurchases },
          ],
        }]}
      />
      <SmsReturnChart groups={groups} currency={account.currency} onSelect={(label) => setDrilldown({
        title: label,
        context: "הפעילויות שמרכיבות את יחס ההכנסה לעלות",
        items: rowsForGroup(label).map(toDrilldownItem),
      })} />
    </div>
    <RankedBars key={sortBy} title="ביצועי פעילות SMS" currency={sortBy === "revenue" ? account.currency : undefined} unit={sortBy === "revenue" ? "הכנסה" : "הכנסה / עלות SMS"}
        controls={<select aria-label="מדד דירוג SMS" value={sortBy} onChange={e=>setSortBy(e.target.value as "revenue" | "roas")} className="h-8 rounded-md border border-[#e4e7ec] bg-white px-2 text-xs"><option value="revenue">הכנסה</option><option value="roas">הכנסה / עלות SMS</option></select>}
        rows={rows.filter(row => sortBy === "revenue" || (row.cost > 0 && row.comparable)).map(row => ({
          id: row.id, label: row.name, value: sortBy === "revenue" ? row.revenue : row.revenue / row.cost,
          color: row.type === "קמפיינים" ? chartColors.sms : chartColors.automation,
          meta: `${row.type} · ${formatNumber(row.purchases)} רכישות · עלות ${formatCurrency(row.cost,account.currency)} · ${row.comparable ? formatRoas(row.cost > 0 ? row.revenue/row.cost : null) : "כולל הכנסות אימייל"}`,
        }))} onSelect={(selected) => {
          const row = rows.find((candidate) => candidate.id === selected.id);
          if (row) setDrilldown({ title: row.name, context: "פירוט פעילות SMS", items: [toDrilldownItem(row)] });
        }} />
    {showDeepAnalysis && <DataTable title="פירוט פעילות SMS" columns={["פעילות","סוג","נמענים","קליקים","עלות SMS","הכנסה","רכישות"]} rows={rows.map(row=>[row.name,row.type,formatNumber(row.recipients),formatNumber(row.clicks),formatCurrency(row.cost,account.currency),formatCurrency(row.revenue,account.currency),formatNumber(row.purchases)])} />}
    <ChartDrilldown state={drilldown} currency={account.currency} onClose={() => setDrilldown(null)} />
  </div>;
}

function AutomationDashboard({ account, automations, showDeepAnalysis }: {
  account: FlashyAccount; automations: AutomationReport[]; showDeepAnalysis: boolean;
}) {
  const [filter, setFilter] = useState<AutomationFilterKey>("all");
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
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
  const toDrilldownItem = (row: (typeof rows)[number]): DrilldownItem => ({
    id: row.id,
    title: row.automationName,
    subtitle: automationFilterLabels[row.type],
    date: row.date,
    revenue: row.revenueGenerated,
    cost: row.smsCost,
    purchases: row.purchases,
    recipients: row.totalEntered ?? row.totalRecipients,
    clicks: row.totalClicks,
    opens: row.openedEmails ?? row.totalOpens,
  });
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
      <RevenueShareChart title="הכנסות לפי סוג אוטומציה" segments={segments} currency={account.currency} onSelect={(segment) => {
        const type = (["email", "sms", "mixed"] as const).find((candidate) => automationFilterLabels[candidate] === segment.label);
        if (!type) return;
        setDrilldown({
          title: segment.label,
          context: "האוטומציות שמרכיבות את פלח ההכנסה",
          items: filtered.filter((row) => row.type === type).map(toDrilldownItem),
        });
      }} />
      <RankedBars key={filter} title="הכנסות לפי אוטומציה" currency={account.currency} rows={filtered.map(row=>({
        id: row.id, label: row.automationName, value: row.revenueGenerated,
        color: row.type==="email" ? chartColors.email : row.type==="sms" ? chartColors.sms : chartColors.automation,
        meta: `${automationFilterLabels[row.type]} · ${formatNumber(row.purchases)} רכישות · ${formatNumber(row.messages)} הודעות`,
      }))} onSelect={(selected) => {
        const row = filtered.find((candidate) => candidate.id === selected.id);
        if (row) setDrilldown({ title: row.automationName, context: "פירוט האוטומציה", items: [toDrilldownItem(row)] });
      }} />
    </div>
    {showDeepAnalysis && <DataTable title="פירוט אוטומציות" columns={["אוטומציה","סוג","נכנסו","הושלמו","אימיילים","פתיחות אימייל","קליקים","SMS","עלות SMS","רכישות","הכנסה","הכנסה / עלות SMS"]} rows={filtered.map(row=>[
      row.automationName,automationFilterLabels[row.type],formatNumber(row.totalEntered ?? row.totalRecipients),formatNumber(row.totalCompleted ?? 0),
      formatNumber(row.sentEmails ?? (row.channel === "email" ? row.totalDelivered : 0)),formatNumber(row.openedEmails ?? row.totalOpens),
      formatNumber(row.totalClicks),formatNumber(getAutomationSmsRecipients(row)),formatCurrency(row.smsCost,account.currency),formatNumber(row.purchases),formatCurrency(row.revenueGenerated,account.currency),formatRoas(row.smsCost > 0 ? row.revenueGenerated / row.smsCost : null),
    ])} />}
    <ChartDrilldown state={drilldown} currency={account.currency} onClose={() => setDrilldown(null)} />
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
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const emailRevenue = emails.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsRevenue = sms.reduce((total, item) => total + item.revenueGenerated, 0);
  const smsCost = sms.reduce(
    (total, item) => total + item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
    0,
  );
  const smsRoas = smsCost > 0 ? smsRevenue / smsCost : null;
  const emailPurchases = emails.reduce((total, item) => total + item.purchases, 0);
  const smsPurchases = sms.reduce((total, item) => total + item.purchases, 0);
  const emailDelivered = emails.reduce((total, item) => total + item.totalDelivered, 0);
  const emailOpens = emails.reduce((total, item) => total + item.totalOpens, 0);
  const emailClicks = emails.reduce((total, item) => total + item.uniqueClicks, 0);
  const smsDelivered = sms.reduce((total, item) => total + item.totalDelivered, 0);
  const smsClicks = sms.reduce((total, item) => total + item.uniqueClicks, 0);
  const emailToDrilldown = (item: EmailCampaignReport): DrilldownItem => ({
    id: item.id,
    title: item.campaignName,
    subtitle: item.subjectLine ? `אימייל · ${item.subjectLine}` : "אימייל",
    date: item.sentAt.slice(0, 10),
    revenue: item.revenueGenerated,
    cost: 0,
    purchases: item.purchases,
    recipients: item.totalRecipients,
    clicks: item.uniqueClicks,
    opens: item.totalOpens,
  });
  const smsToDrilldown = (item: SmsCampaignReport): DrilldownItem => ({
    id: item.id,
    title: item.campaignName,
    subtitle: "SMS",
    date: item.sentAt.slice(0, 10),
    revenue: item.revenueGenerated,
    cost: item.totalRecipients * account.smsCreditPriceUsd * account.usdIlsRate,
    purchases: item.purchases,
    recipients: item.totalRecipients,
    clicks: item.totalClicks,
  });
  let campaignClock: Intl.DateTimeFormat;
  try {
    campaignClock = new Intl.DateTimeFormat("en-US", {
      timeZone: account.timezone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    campaignClock = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  }
  const campaignTimingKey = (sentAt: string) => {
    const parts = campaignClock.formatToParts(new Date(sentAt));
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    return {
      day: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][dayIndex] ?? "",
      hour: `${parts.find((part) => part.type === "hour")?.value ?? "00"}:00`,
    };
  };
  const campaignPurchases = emailPurchases + smsPurchases;
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
          title="קמפיינים שנשלחו"
          value={formatNumber(emails.length + sms.length)}
          caption={`${formatNumber(emails.length)} אימייל · ${formatNumber(sms.length)} SMS`}
          icon={LineChart}
        />
        <MetricCard
          title="עלות SMS"
          value={formatCurrency(smsCost, account.currency)}
          caption={`הכנסה / עלות SMS ${formatRoas(smsRoas)}`}
          icon={MessageSquareText}
        />
        <MetricCard
          title="רכישות"
          value={formatNumber(campaignPurchases)}
          caption="אימייל ו-SMS יחד"
          icon={CheckCircle2}
          tone="good"
        />
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <RevenueShareChart
          title="תמהיל הכנסות קמפיינים"
          currency={account.currency}
          showCosts
          segments={[
            { label: "אימייל", revenue: emailRevenue, count: emails.length, purchases: emailPurchases, cost: 0, color: chartColors.email },
            { label: "SMS", revenue: smsRevenue, count: sms.length, purchases: smsPurchases, cost: smsCost, color: chartColors.sms },
          ]}
          onSelect={(segment) => setDrilldown({
            title: `קמפייני ${segment.label}`,
            context: "הקמפיינים שמרכיבים את פלח ההכנסה",
            items: segment.label === "אימייל" ? emails.map(emailToDrilldown) : sms.map(smsToDrilldown),
          })}
        />
        <CampaignJourneyChart
          title="מסע מקמפיין לרכישה"
          detail="היחס בין כל שלב לשלב שקדם לו"
          series={[
            {
              id: "email",
              label: "אימייל",
              color: chartColors.email,
              stages: [
                { label: "נמסרו", value: emailDelivered },
                { label: "פתיחות", value: emailOpens },
                { label: "הקלקות ייחודיות", value: emailClicks },
                { label: "רכישות", value: emailPurchases },
              ],
            },
            {
              id: "sms",
              label: "SMS",
              color: chartColors.sms,
              stages: [
                { label: "נמסרו", value: smsDelivered },
                { label: "הקלקות ייחודיות", value: smsClicks },
                { label: "רכישות", value: smsPurchases },
              ],
            },
          ]}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <WeekdayBars groups={timing.days} currency={account.currency} timezone={timing.timezone} onSelect={(label) => setDrilldown({
          title: `קמפיינים ביום ${label}`,
          context: "כל הקמפיינים שנשלחו ביום הזה בטווח שנבחר",
          items: [
            ...emails.filter((item) => campaignTimingKey(item.sentAt).day === label).map(emailToDrilldown),
            ...sms.filter((item) => campaignTimingKey(item.sentAt).day === label).map(smsToDrilldown),
          ],
        })} />
        <EngagementPlot rows={[...emails].sort((a,b)=>b.revenueGenerated-a.revenueGenerated).slice(0,4).map(item=>({
          id: item.id, label: item.subjectLine || item.campaignName, revenue: item.revenueGenerated, currency: account.currency,
          opens: measuredRate(item.totalOpens,item.totalDelivered), clicks: measuredRate(item.uniqueClicks,item.totalDelivered),
        }))} onSelect={(id) => {
          const item = emails.find((candidate) => candidate.id === id);
          if (item) setDrilldown({ title: item.subjectLine || item.campaignName, context: "הקמפיין שמרכיב את נקודת המעורבות", items: [emailToDrilldown(item)] });
        }} />
      </div>

      {showDeepAnalysis && (
      <>
      <RankedBars title="הכנסה לפי שעת שליחה" detail={`ממוצע לקמפיין · ${timing.timezone}`} currency={account.currency} rows={bestHours.map(item=>({
        id: item.label, label: item.label, value: item.average, color: chartColors.sms,
        meta: `${item.count} קמפיינים · ${formatNumber(item.purchases)} רכישות`,
      }))} onSelect={(selected) => setDrilldown({
        title: `שעת שליחה ${selected.id}`,
        context: "הקמפיינים שנשלחו בשעה הזו בטווח שנבחר",
        items: [
          ...emails.filter((item) => campaignTimingKey(item.sentAt).hour === selected.id).map(emailToDrilldown),
          ...sms.filter((item) => campaignTimingKey(item.sentAt).hour === selected.id).map(smsToDrilldown),
        ],
      })} />
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
      <ChartDrilldown state={drilldown} currency={account.currency} onClose={() => setDrilldown(null)} />
    </div>
  );
}

function reportSendTime(report: PlannerCampaignReport | undefined, timezone: string) {
  if (!report) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(report.sentAt));
}

type PlannerTableSortKey =
  | "date"
  | "time"
  | "revenue"
  | "purchases"
  | "averagePurchase"
  | "conversion"
  | "openRate"
  | "clickRate"
  | "unsubscribeRate";

const plannerTableColumns: Array<{ label: string; sortKey?: PlannerTableSortKey }> = [
  { label: "תאריך", sortKey: "date" },
  { label: "יום" },
  { label: "שעה", sortKey: "time" },
  { label: "נושא" },
  { label: "סטטוס" },
  { label: "הוקם ב־Flashy?" },
  { label: "מתוזמן?" },
  { label: "קוד קופון" },
  { label: "הכנסות", sortKey: "revenue" },
  { label: "רכישות", sortKey: "purchases" },
  { label: "ממוצע לרכישה", sortKey: "averagePurchase" },
  { label: "יחס המרה", sortKey: "conversion" },
  { label: "% פתיחה", sortKey: "openRate" },
  { label: "% הקלקה", sortKey: "clickRate" },
  { label: "% הסרה", sortKey: "unsubscribeRate" },
];

function PlannerTableSection({
  channel,
  matches,
  unmatchedReports,
  account,
  onEdit,
}: {
  channel: Channel;
  matches: PlanCampaignMatch[];
  unmatchedReports: PlannerCampaignReport[];
  account: FlashyAccount;
  onEdit: (plan: NewsletterPlan) => void;
}) {
  const rows = matches.filter((item) => item.plan.channel === channel);
  const liveRows = unmatchedReports.filter((item) => item.channel === channel);
  const isEmail = channel === "email";
  const [sort, setSort] = useState<{ key: PlannerTableSortKey; direction: "asc" | "desc" } | null>(null);
  const tableRows = [
    ...rows.map(({ plan, report, status, matchState, confidence }) => {
      const delivered = report?.totalDelivered ?? 0;
      const recipients = report?.totalRecipients ?? 0;
      const purchases = report?.purchases ?? 0;
      const revenue = report?.revenueGenerated ?? 0;
      const time = reportSendTime(report, account.timezone) || plan.time || "";

      return {
        id: `plan-${plan.id}`,
        plan,
        report,
        status,
        date: plan.date,
        time,
        title: plan.title,
        subtitle: report && report.campaignName !== plan.title ? `Flashy: ${report.campaignName}` : "",
        matchState,
        confidence,
        hasFlashy: Boolean(report || plan.flashyUrl),
        isScheduled: Boolean(report || plan.flashyUrl),
        couponCode: plan.couponCode || "",
        recipients,
        delivered,
        totalOpens: report?.channel === "email" ? report.totalOpens : 0,
        uniqueClicks: report?.uniqueClicks ?? 0,
        unsubscribed: report?.unsubscribed ?? 0,
        revenue: report ? revenue : null,
        purchases: report ? purchases : null,
        averagePurchase: report && purchases > 0 ? revenue / purchases : null,
        conversion: report && recipients > 0 ? purchases / recipients : null,
        openRate: report?.channel === "email" && delivered > 0 ? report.totalOpens / delivered : null,
        clickRate: report && delivered > 0 ? report.uniqueClicks / delivered : null,
        unsubscribeRate: report && recipients > 0 ? report.unsubscribed / recipients : null,
      };
    }),
    ...liveRows.map((report) => {
      const date = accountDate(new Date(report.sentAt), account.timezone);
      const purchases = report.purchases;
      const revenue = report.revenueGenerated;

      return {
        id: `live-${report.channel}-${report.id}`,
        plan: null,
        report,
        status: "sent" as OperationalPlanStatus,
        date,
        time: reportSendTime(report, account.timezone),
        title: report.campaignName,
        subtitle: "נשלח ב־Flashy ללא פריט תכנון",
        matchState: "none" as const,
        confidence: 0,
        hasFlashy: true,
        isScheduled: true,
        couponCode: "",
        recipients: report.totalRecipients,
        delivered: report.totalDelivered,
        totalOpens: report.channel === "email" ? report.totalOpens : 0,
        uniqueClicks: report.uniqueClicks,
        unsubscribed: report.unsubscribed,
        revenue,
        purchases,
        averagePurchase: purchases > 0 ? revenue / purchases : null,
        conversion: report.totalRecipients > 0 ? purchases / report.totalRecipients : null,
        openRate: report.channel === "email" && report.totalDelivered > 0
          ? report.totalOpens / report.totalDelivered
          : null,
        clickRate: report.totalDelivered > 0 ? report.uniqueClicks / report.totalDelivered : null,
        unsubscribeRate: report.totalRecipients > 0 ? report.unsubscribed / report.totalRecipients : null,
      };
    }),
  ].sort((a, b) => {
    const classicOrder = a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, "he");
    if (!sort) return classicOrder;

    const aValue = sort.key === "date" ? Date.parse(`${a.date}T00:00:00`) : sort.key === "time"
      ? Number(a.time.replace(":", ""))
      : a[sort.key];
    const bValue = sort.key === "date" ? Date.parse(`${b.date}T00:00:00`) : sort.key === "time"
      ? Number(b.time.replace(":", ""))
      : b[sort.key];
    if (aValue === null || Number.isNaN(aValue)) return bValue === null || Number.isNaN(bValue) ? classicOrder : 1;
    if (bValue === null || Number.isNaN(bValue)) return -1;
    const difference = aValue - bValue;
    return difference === 0 ? classicOrder : sort.direction === "desc" ? -difference : difference;
  });
  const totals = tableRows.reduce(
    (result, row) => ({
      revenue: result.revenue + (row.revenue ?? 0),
      purchases: result.purchases + (row.purchases ?? 0),
      recipients: result.recipients + row.recipients,
      delivered: result.delivered + row.delivered,
      totalOpens: result.totalOpens + row.totalOpens,
      uniqueClicks: result.uniqueClicks + row.uniqueClicks,
      unsubscribed: result.unsubscribed + row.unsubscribed,
      sent: result.sent + (row.status === "sent" ? 1 : 0),
      scheduled: result.scheduled + (row.isScheduled ? 1 : 0),
    }),
    { revenue: 0, purchases: 0, recipients: 0, delivered: 0, totalOpens: 0, uniqueClicks: 0, unsubscribed: 0, sent: 0, scheduled: 0 },
  );

  function toggleSort(key: PlannerTableSortKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: "desc" });
  }

  return (
    <section className="border-b border-[#dfe7ee] last:border-b-0">
      <div className={classNames(
        "grid grid-cols-[1fr_auto_1fr] items-center border-b border-[#c8d3df] px-4 py-2 text-sm font-bold text-[#111318]",
        isEmail ? "bg-[#cddcf2]" : "bg-[#dcd7eb]",
      )}>
        <span aria-hidden="true" />
        <span>{isEmail ? "מיילים" : "מסרונים"}</span>
        <button
          type="button"
          onClick={() => setSort(null)}
          disabled={!sort}
          className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[#344054] transition hover:bg-white/60 disabled:cursor-default disabled:opacity-40"
        >
          <RotateCcw size={14} />
          איפוס סדר
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1720px] border-collapse text-right text-xs text-[#344054]">
          <thead>
            <tr className="bg-[#fff6d6] text-[#111318]">
              {plannerTableColumns.map(({ label, sortKey }) => (
                <th key={label} className="whitespace-nowrap border-l border-[#d9dee5] px-3 py-2.5 font-bold last:border-l-0">
                  {sortKey ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(sortKey)}
                      className={classNames(
                        "inline-flex items-center gap-1.5 transition hover:text-[#087f72]",
                        sort?.key === sortKey && "text-[#087f72]",
                      )}
                      aria-label={`מיין לפי ${label}`}
                    >
                      {label}
                      <ArrowDownWideNarrow
                        size={14}
                        className={classNames("transition-transform", sort?.key === sortKey && sort.direction === "asc" && "rotate-180")}
                      />
                    </button>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              return (
                <tr key={row.id} className="border-t border-[#e8ebef] bg-white transition hover:bg-[#f8fafb]">
                  <td className="whitespace-nowrap border-l border-[#e8ebef] px-3 py-3 tabular-nums">{new Date(`${row.date}T12:00:00Z`).toLocaleDateString("he-IL")}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] px-3 py-3">{new Date(`${row.date}T12:00:00Z`).toLocaleDateString("he-IL", { weekday: "long" })}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] px-3 py-3 tabular-nums">{row.time || "—"}</td>
                  <td className="max-w-[390px] border-l border-[#e8ebef] px-3 py-3">
                    {row.plan ? (
                      <button onClick={() => onEdit(row.plan)} className="w-full text-right font-semibold text-[#111318] hover:text-[#087f72]">
                        {row.title}
                      </button>
                    ) : <span className="font-semibold text-[#111318]">{row.title}</span>}
                    {row.subtitle && <span className="mt-1 block truncate text-[11px] text-[#667085]">{row.subtitle}</span>}
                    {row.plan && row.report && (
                      <span className="mt-1 block text-[11px] font-semibold text-[#087f72]">
                        {row.matchState === "confirmed" ? "התאמה מאושרת" : row.matchState === "automatic" ? "התאמה אוטומטית" : "הצעת התאמה"}
                        {row.confidence > 0 ? ` · ${formatPercent(row.confidence)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] px-3 py-3">
                    <span className={classNames(
                      "inline-flex rounded-full px-2 py-1 text-[11px] font-bold",
                      row.status === "sent" && "bg-[#d9f7ef] text-[#087f72]",
                      row.status === "planned" && "bg-[#eaf2ff] text-[#295ea8]",
                      row.status === "postponed" && "bg-[#fff0d8] text-[#9a5b00]",
                      row.status === "not_found" && "bg-[#f2f4f7] text-[#667085]",
                    )}>{operationalStatusLabels[row.status]}</span>
                  </td>
                  <td className="border-l border-[#e8ebef] px-3 py-3 text-center">{row.hasFlashy ? <CheckCircle2 className="mx-auto text-[#087f72]" size={18} /> : <Minus className="mx-auto text-[#98a2b3]" size={18} />}</td>
                  <td className="border-l border-[#e8ebef] px-3 py-3 text-center">{row.isScheduled ? <CheckCircle2 className="mx-auto text-[#087f72]" size={18} /> : <Minus className="mx-auto text-[#98a2b3]" size={18} />}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] px-3 py-3 font-mono">{row.couponCode || "—"}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#edf6e8] px-3 py-3 font-bold tabular-nums">{row.revenue === null ? "—" : formatCurrency(row.revenue, account.currency)}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#edf6e8] px-3 py-3 tabular-nums">{row.purchases === null ? "—" : formatNumber(row.purchases)}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#edf6e8] px-3 py-3 tabular-nums">{row.averagePurchase === null ? "—" : formatCurrency(row.averagePurchase, account.currency)}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#edf6e8] px-3 py-3 tabular-nums">{row.conversion === null ? "—" : formatPercent(row.conversion)}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#e8f1fb] px-3 py-3 tabular-nums">{row.openRate === null ? "—" : formatPercent(row.openRate)}</td>
                  <td className="whitespace-nowrap border-l border-[#e8ebef] bg-[#e8f1fb] px-3 py-3 tabular-nums">{row.clickRate === null ? "—" : formatPercent(row.clickRate)}</td>
                  <td className="whitespace-nowrap bg-[#e8f1fb] px-3 py-3 tabular-nums">{row.unsubscribeRate === null ? "—" : formatPercent(row.unsubscribeRate)}</td>
                </tr>
              );
            })}
            {!tableRows.length && (
              <tr><td colSpan={15} className="px-4 py-8 text-center text-sm text-[#667085]">אין דיוורים בטווח התאריכים שנבחר.</td></tr>
            )}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#98a2b3] bg-[#f4f7f6] font-bold text-[#111318]">
                <td className="whitespace-nowrap border-l border-[#d9dee5] px-3 py-3">סה״כ</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] px-3 py-3">{formatNumber(tableRows.length)} דיוורים</td>
                <td className="border-l border-[#d9dee5] px-3 py-3">—</td>
                <td className="border-l border-[#d9dee5] px-3 py-3">סיכום אוטומטי</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] px-3 py-3">{formatNumber(totals.sent)} נשלחו</td>
                <td className="border-l border-[#d9dee5] px-3 py-3 text-center">{formatNumber(totals.sent)}</td>
                <td className="border-l border-[#d9dee5] px-3 py-3 text-center">{formatNumber(totals.scheduled)}</td>
                <td className="border-l border-[#d9dee5] px-3 py-3">—</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dfeeda] px-3 py-3 tabular-nums">{formatCurrency(totals.revenue, account.currency)}</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dfeeda] px-3 py-3 tabular-nums">{formatNumber(totals.purchases)}</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dfeeda] px-3 py-3 tabular-nums">{totals.purchases > 0 ? formatCurrency(totals.revenue / totals.purchases, account.currency) : "—"}</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dfeeda] px-3 py-3 tabular-nums">{totals.recipients > 0 ? formatPercent(totals.purchases / totals.recipients) : "—"}</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dce8f5] px-3 py-3 tabular-nums">{isEmail && totals.delivered > 0 ? formatPercent(totals.totalOpens / totals.delivered) : "—"}</td>
                <td className="whitespace-nowrap border-l border-[#d9dee5] bg-[#dce8f5] px-3 py-3 tabular-nums">{totals.delivered > 0 ? formatPercent(totals.uniqueClicks / totals.delivered) : "—"}</td>
                <td className="whitespace-nowrap bg-[#dce8f5] px-3 py-3 tabular-nums">{totals.recipients > 0 ? formatPercent(totals.unsubscribed / totals.recipients) : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function Planner({
  client,
  account,
  emails,
  sms,
  plans,
  onUpsertPlan,
  onDeletePlan,
}: {
  client: Client;
  account: FlashyAccount;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  plans: NewsletterPlan[];
  onUpsertPlan: (plan: NewsletterPlan) => void;
  onDeletePlan: (planId: string) => void;
}) {
  const initialMonth = toDateInputValue(new Date()).slice(0, 7);
  const initialTableRange = getMonthDateRange(initialMonth);
  const [month, setMonth] = useState(initialMonth);
  const [layout, setLayout] = useState<"calendar" | "table">("calendar");
  const [tableDateStart, setTableDateStart] = useState(initialTableRange.start);
  const [tableDateEnd, setTableDateEnd] = useState(initialTableRange.end);
  const [tableRangeCustomized, setTableRangeCustomized] = useState(false);
  const emptyDraft = {
    date: toDateInputValue(new Date()),
    time: "09:00",
    channel: "email" as Channel,
    kind: "campaign" as CampaignKind,
    status: "planned" as PlanStatus,
    title: "",
    owner: "",
    notes: "",
    couponCode: "",
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
  const [matchBusy, setMatchBusy] = useState(false);
  const [manualCampaignKey, setManualCampaignKey] = useState("");
  const monthPlans = plans.filter((plan) => isSameMonth(plan.date, month));
  const planMatching = matchNewsletterPlans(plans, emails, sms, account.timezone);
  const editingMatch = editingPlanId
    ? planMatching.matches.find((item) => item.plan.id === editingPlanId)
    : undefined;
  const manualMatchCandidates = editingMatch
    ? planMatching.availableReports
        .filter((report) => report.accountId === editingMatch.plan.accountId && report.channel === editingMatch.plan.channel)
        .sort((left, right) => {
          const target = Date.parse(`${editingMatch.plan.date}T12:00:00Z`);
          return Math.abs(Date.parse(left.sentAt) - target) - Math.abs(Date.parse(right.sentAt) - target);
        })
        .slice(0, 30)
    : [];
  const monthMatches = planMatching.matches.filter((item) => isSameMonth(item.plan.date, month));
  const monthUnmatchedReports = planMatching.unmatchedReports.filter((item) =>
    isSameMonth(accountDate(new Date(item.sentAt), account.timezone), month),
  );
  const tableRangeInvalid = Boolean(tableDateStart && tableDateEnd && tableDateStart > tableDateEnd);
  const tableMatches = tableRangeInvalid
    ? []
    : planMatching.matches.filter((item) => isDateInRange(item.plan.date, tableDateStart, tableDateEnd));
  const tableUnmatchedReports = tableRangeInvalid
    ? []
    : planMatching.unmatchedReports.filter((item) =>
        isDateInRange(accountDate(new Date(item.sentAt), account.timezone), tableDateStart, tableDateEnd),
      );
  const liveEvents = [
    ...monthUnmatchedReports
      .map((item) => ({
        id: `live-${item.channel}-${item.id}`,
        date: accountDate(new Date(item.sentAt), account.timezone),
        title: item.campaignName,
        channel: item.channel,
        source: "Flashy" as const,
        status: "sent" as OperationalPlanStatus,
        caption: `${formatNumber(item.totalRecipients)} נמענים · ${formatCurrency(item.revenueGenerated, account.currency)}`,
      })),
    ...monthMatches.map(({ plan, report, status, matchState }) => ({
      id: `plan-${plan.id}`,
      date: plan.date,
      time: plan.time ?? "09:00",
      title: plan.title,
      channel: plan.channel,
      source: report
        ? matchState === "suggested" ? ("התאמה מוצעת" as const) : ("תכנון + Flashy" as const)
        : ("תכנון" as const),
      status,
      caption: report
        ? `${formatCurrency(report.revenueGenerated, account.currency)} · ${formatNumber(report.purchases)} רכישות`
        : plan.notes || `${kindLabels[plan.kind]} · ${plan.owner || "ללא בעלים"}`,
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
      time: plan.time ?? "09:00",
      channel: plan.channel,
      kind: plan.kind,
      status: plan.status === "postponed" ? "postponed" : "planned",
      title: plan.title,
      owner: plan.owner,
      notes: plan.notes,
      couponCode: plan.couponCode ?? "",
      flashyUrl: plan.flashyUrl ?? "",
      assetUrl: plan.assetUrl ?? "",
    });
    setSaveState("עורך פריט קיים.");
    setManualCampaignKey("");
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
    setSaveState("נפתח פריט חדש לתכנון.");
  }

  function selectMonth(value: string) {
    setMonth(value);
    if (!tableRangeCustomized) {
      const range = getMonthDateRange(value);
      setTableDateStart(range.start);
      setTableDateEnd(range.end);
    }
  }

  function resetTableRangeToMonth() {
    const range = getMonthDateRange(month);
    setTableDateStart(range.start);
    setTableDateEnd(range.end);
    setTableRangeCustomized(false);
  }

  function showAllTableDates() {
    setTableDateStart("");
    setTableDateEnd("");
    setTableRangeCustomized(true);
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
      time: draft.time,
      couponCode: draft.couponCode.trim() || undefined,
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
        couponCode: "",
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

  async function deletePlan() {
    if (!editingPlanId) return;
    const match = planMatching.matches.find((item) => item.plan.id === editingPlanId);
    if (!match || match.report || match.plan.status === "sent") {
      setSaveState("אי אפשר למחוק דיוור שכבר חובר לביצוע ב־Flashy.");
      return;
    }
    if (!window.confirm(`למחוק את התכנון “${match.plan.title}”?`)) return;

    setSaveState("מוחק את התכנון...");
    try {
      const response = await fetch("/api/newsletter-plans", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingPlanId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "המחיקה נכשלה");

      onDeletePlan(editingPlanId);
      setEditingPlanId(null);
      setDraft({ ...emptyDraft, date: `${month}-01` });
      setSaveState("");
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "המחיקה נכשלה.");
    }
  }

  async function updatePlanMatch(
    matchAction: "match" | "confirm" | "unmatch" | "resume",
    report?: PlannerCampaignReport,
  ) {
    if (!editingPlanId) return;
    setMatchBusy(true);
    setSaveState(matchAction === "unmatch" ? "מבטל התאמה..." : "שומר התאמה...");
    try {
      const response = await fetch("/api/newsletter-plans", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingPlanId,
          matchAction,
          campaignId: report?.campaignId,
          campaignChannel: report?.channel,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת ההתאמה נכשלה");
      onUpsertPlan(payload.data as NewsletterPlan);
      setManualCampaignKey("");
      setSaveState(
        matchAction === "unmatch"
          ? "ההתאמה בוטלה. התאמה אוטומטית הושהתה לפריט הזה."
          : matchAction === "resume"
            ? "ההתאמה האוטומטית הופעלה מחדש."
            : "ההתאמה נשמרה ואושרה.",
      );
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "שמירת ההתאמה נכשלה.");
    } finally {
      setMatchBusy(false);
    }
  }

  function matchSelectedCampaign() {
    const report = manualMatchCandidates.find((candidate) =>
      `${candidate.channel}:${candidate.campaignId}` === manualCampaignKey,
    );
    if (report) void updatePlanMatch("match", report);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dfe7ee] bg-white p-5 shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#080123]">גאנט דיוורים</h2>
            <p className="mt-1 text-sm leading-6 text-[#65738a]">
              יומן חודשי וטבלת ביצועים לכל טווח. פריטים שנשלחו מתחברים אוטומטית לתוצאות שלהם ב־Flashy.
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <button
              onClick={() => startQuickPlan(
                "דיוור חדש",
                "email",
                layout === "table" && tableDateStart
                  ? tableDateStart
                  : toDateInputValue(new Date()).slice(0, 7) === month
                    ? toDateInputValue(new Date())
                    : `${month}-01`,
              )}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#111318] px-4 text-sm font-bold text-white transition hover:bg-black"
            >
              <Plus size={17} />
              הוסף דיוור
            </button>
            <div className="inline-flex h-11 rounded-lg border border-[#d0d5dd] bg-[#f2f4f7] p-1">
              <button
                onClick={() => setLayout("calendar")}
                className={classNames("inline-flex items-center gap-2 rounded-md px-3 text-sm font-semibold", layout === "calendar" ? "bg-white text-[#111318] shadow-sm" : "text-[#667085]")}
              >
                <CalendarDays size={16} />
                יומן
              </button>
              <button
                onClick={() => setLayout("table")}
                className={classNames("inline-flex items-center gap-2 rounded-md px-3 text-sm font-semibold", layout === "table" ? "bg-white text-[#111318] shadow-sm" : "text-[#667085]")}
              >
                <Table2 size={16} />
                טבלה
              </button>
            </div>
            {layout === "calendar" && (
              <input
                aria-label="חודש ביומן"
                type="month"
                value={month}
                onChange={(event) => selectMonth(event.target.value)}
                className="h-11 rounded-lg border border-[#cfd9e3] bg-white px-3 text-sm font-semibold text-[#080123] outline-none [color-scheme:light] focus:border-[#6fffe5] focus:ring-2 focus:ring-[#6fffe5]/30"
              />
            )}
          </div>
        </div>
      </section>

      {layout === "calendar" ? (
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
                          draggable={event.source !== "Flashy"}
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
                              : event.status === "sent"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900 transition hover:border-emerald-300"
                                : event.status === "postponed"
                                  ? "border-amber-200 bg-amber-50 text-amber-900 transition hover:border-amber-300"
                                  : event.status === "not_found"
                                    ? "border-slate-300 bg-slate-50 text-slate-700 transition hover:border-slate-400"
                                    : "border-blue-200 bg-blue-50 text-blue-900 transition hover:border-blue-300",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{channelLabels[event.channel]}</span>
                            <span className="rounded-full bg-white/75 px-1.5 font-bold">{operationalStatusLabels[event.status]}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 font-medium">{event.title}</p>
                          <p className="mt-0.5 text-[10px] font-medium opacity-70">{event.source}</p>
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
      ) : (
        <section className="overflow-hidden rounded-xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[#dfe7ee] bg-[#f8fafb] px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[#111318]">
              <ListFilter size={17} className="text-[#087f72]" />
              סינון טבלה לפי תאריך
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="grid gap-1 text-xs font-semibold text-[#667085]">
                מתאריך
                <input
                  type="date"
                  value={tableDateStart}
                  max={tableDateEnd || undefined}
                  onChange={(event) => {
                    setTableDateStart(event.target.value);
                    setTableRangeCustomized(true);
                  }}
                  className="h-10 rounded-md border border-[#cfd9e3] bg-white px-3 text-sm font-semibold text-[#111318] outline-none [color-scheme:light] focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[#667085]">
                עד תאריך
                <input
                  type="date"
                  value={tableDateEnd}
                  min={tableDateStart || undefined}
                  onChange={(event) => {
                    setTableDateEnd(event.target.value);
                    setTableRangeCustomized(true);
                  }}
                  className="h-10 rounded-md border border-[#cfd9e3] bg-white px-3 text-sm font-semibold text-[#111318] outline-none [color-scheme:light] focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20"
                />
              </label>
              <button
                type="button"
                onClick={resetTableRangeToMonth}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#cfd9e3] bg-white px-3 text-xs font-bold text-[#344054] transition hover:border-[#98a2b3] hover:bg-[#f2f4f7]"
              >
                <CalendarDays size={15} />
                טווח החודש
              </button>
              <button
                type="button"
                onClick={showAllTableDates}
                disabled={!tableDateStart && !tableDateEnd}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold text-[#087f72] transition hover:bg-[#eafaf6] disabled:cursor-default disabled:opacity-40"
              >
                <X size={15} />
                כל התאריכים
              </button>
            </div>
            {tableRangeInvalid && (
              <p role="alert" className="text-xs font-semibold text-red-700">תאריך ההתחלה חייב להיות לפני תאריך הסיום.</p>
            )}
          </div>
          <PlannerTableSection channel="email" matches={tableMatches} unmatchedReports={tableUnmatchedReports} account={account} onEdit={editPlan} />
          <PlannerTableSection channel="sms" matches={tableMatches} unmatchedReports={tableUnmatchedReports} account={account} onEdit={editPlan} />
        </section>
      )}

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
            {editingMatch && editingMatch.plan.kind === "campaign" && (
              <section className="mt-4 rounded-lg border border-[#dfe7ee] bg-[#f8fafb] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link2 size={16} className="text-[#087f72]" />
                      <h4 className="text-sm font-bold text-[#111318]">חיבור לביצוע ב־Flashy</h4>
                    </div>
                    {editingMatch.report ? (
                      <>
                        <p className="mt-2 text-sm font-semibold text-[#111318]">{editingMatch.report.campaignName}</p>
                        <p className="mt-1 text-xs text-[#667085]">
                          {new Date(editingMatch.report.sentAt).toLocaleDateString("he-IL", { timeZone: account.timezone })}
                          {` · ${formatCurrency(editingMatch.report.revenueGenerated, account.currency)}`}
                          {` · ${formatNumber(editingMatch.report.purchases)} רכישות`}
                        </p>
                      </>
                    ) : editingMatch.matchState === "missing" ? (
                      <p className="mt-2 text-sm text-[#8a5800]">הקמפיין השמור לא נמצא בדוחות הנוכחיים.</p>
                    ) : (
                      <p className="mt-2 text-sm text-[#667085]">עדיין לא נשמר חיבור לקמפיין שנשלח.</p>
                    )}
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#344054] shadow-sm">
                    {editingMatch.matchState === "confirmed"
                      ? "מאושר"
                      : editingMatch.matchState === "automatic"
                        ? "אוטומטי"
                        : editingMatch.matchState === "suggested"
                          ? `הצעה · ${formatPercent(editingMatch.confidence)}`
                          : editingMatch.plan.matchingDisabled
                            ? "אוטומציה מושהית"
                            : "לא מחובר"}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {editingMatch.matchState === "suggested" && editingMatch.report && (
                    <button disabled={matchBusy} type="button" onClick={() => updatePlanMatch("match", editingMatch.report)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#111318] px-3 text-xs font-bold text-white disabled:opacity-50">
                      <CheckCircle2 size={15} /> אשר התאמה
                    </button>
                  )}
                  {editingMatch.matchState === "automatic" && (
                    <button disabled={matchBusy} type="button" onClick={() => updatePlanMatch("confirm")} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#111318] px-3 text-xs font-bold text-white disabled:opacity-50">
                      <CheckCircle2 size={15} /> אשר התאמה
                    </button>
                  )}
                  {editingMatch.matchState !== "none" && (
                    <button disabled={matchBusy} type="button" onClick={() => updatePlanMatch("unmatch")} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-bold text-[#344054] disabled:opacity-50">
                      <Link2Off size={15} /> {editingMatch.matchState === "suggested" ? "דחה הצעה" : "בטל התאמה"}
                    </button>
                  )}
                  {editingMatch.plan.matchingDisabled && editingMatch.matchState === "none" && (
                    <button disabled={matchBusy} type="button" onClick={() => updatePlanMatch("resume")} className="inline-flex h-9 items-center justify-center rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-bold text-[#344054] disabled:opacity-50">
                      הפעל התאמה אוטומטית
                    </button>
                  )}
                </div>
                {editingMatch.matchState !== "confirmed" && editingMatch.matchState !== "automatic" && manualMatchCandidates.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-[#e4e7ec] pt-3 sm:flex-row">
                    <select value={manualCampaignKey} onChange={(event) => setManualCampaignKey(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-[#d0d5dd] bg-white px-2 text-xs">
                      <option value="">בחר קמפיין שנשלח...</option>
                      {manualMatchCandidates.map((report) => (
                        <option key={`${report.channel}:${report.campaignId}`} value={`${report.channel}:${report.campaignId}`}>
                          {new Date(report.sentAt).toLocaleDateString("he-IL", { timeZone: account.timezone })} · {report.campaignName}
                        </option>
                      ))}
                    </select>
                    <button disabled={matchBusy || !manualCampaignKey} type="button" onClick={matchSelectedCampaign} className="h-9 rounded-md border border-[#087f72] bg-white px-3 text-xs font-bold text-[#087f72] disabled:opacity-40">
                      התאם ידנית
                    </button>
                  </div>
                )}
              </section>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#263548]">
                תאריך שליחה
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, date: event.target.value }));
                    selectMonth(event.target.value.slice(0, 7));
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
                  {(["planned", "postponed"] as PlanStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#263548]">
                שעת שליחה
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
                />
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
              <label className="block text-sm font-medium text-[#263548]">
                קוד קופון
                <input
                  value={draft.couponCode}
                  onChange={(event) => setDraft((current) => ({ ...current, couponCode: event.target.value }))}
                  placeholder="לדוגמה: SEPTEMBER12"
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
              {editingPlanId && !planMatching.matches.find((item) => item.plan.id === editingPlanId)?.report && (
                <button
                  type="button"
                  onClick={deletePlan}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  מחק תכנון
                </button>
              )}
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
  const [provider, setProvider] = useState("idle");
  const [model, setModel] = useState("");
  const [providerError, setProviderError] = useState("");
  const [aiState, setAiState] = useState("מוכן לשאלות על החשבון.");
  const [memoryState, setMemoryState] = useState("טוען את זיכרון הלקוח...");
  const [memoryLoaded, setMemoryLoaded] = useState(false);
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
    { key: "memory", label: "זיכרון לקוח", detail: memoryLoaded ? `${memoryDocumentCount} מסמכים` : "טוען..." },
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
        if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת זיכרון הלקוח נכשלה.");
        if (!cancelled) {
          setMemory(payload.data ?? {});
          setMemoryLoaded(true);
          setMemoryState(payload.persisted ? `זיכרון ${account.name} נטען.` : `עדיין אין זיכרון שמור עבור ${account.name}.`);
        }
      } catch (error) {
        if (!cancelled) {
          setMemoryLoaded(true);
          setMemoryState(error instanceof Error ? error.message : "לא הצלחתי לטעון זיכרון חשבון.");
        }
      }
    }

    loadMemory();
    return () => {
      cancelled = true;
    };
  }, [account.name, clientId]);

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
      setModel(payload.model ?? "");
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
      setProvider("openai-error");
      setProviderError(error instanceof Error ? error.message : "החיבור למודל OpenAI נכשל.");
      setAiState(error instanceof Error ? error.message : "החיבור למודל OpenAI נכשל.");
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
                <p className="mt-1 font-black text-[#080123]">
                  {provider === "openai" ? model || "OpenAI" : provider === "idle" ? "טרם הופעל" : "שגיאת חיבור"}
                </p>
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
                  לקוח פעיל: <strong className="text-[#080123]">{account.name}</strong> · המסמכים שלו בלבד נכנסים לשיחה.
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
              {memoryLoaded && (memory.documents ?? []).length === 0 && (
                <p className="mt-4 rounded-xl border border-dashed border-[#cfd8df] bg-white p-4 text-center text-sm text-[#65738a]">
                  אין מסמכים שמורים עבור {account.name}.
                </p>
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
  onNavigate,
}: {
  clientId: string;
  view: ViewKey;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
  onNavigate: (view: AiReportView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("אני מחובר ללקוח, לטווח הנתונים הנוכחי ולמסך שבו אתה נמצא. שאל אותי מה לבדוק.");
  const [provider, setProvider] = useState("idle");
  const [model, setModel] = useState("");
  const [providerError, setProviderError] = useState("");
  const [state, setState] = useState("מוכן");
  const [memory, setMemory] = useState<AiAccountMemory>({});
  const [grounding, setGrounding] = useState<AiGroundedResponse | null>(null);
  const viewLabels: Record<ViewKey, string> = {
    portfolio: "סוכנות",
    overview: "כללי",
    sms: "SMS",
    automations: "אוטומציות",
    campaigns: "קמפיינים",
    planner: "גאנט",
    ai: "AI",
    settings: "הגדרות",
    admin: "ניהול",
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
        if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת זיכרון הלקוח נכשלה.");
        if (!cancelled) setMemory(payload.data ?? {});
      } catch (error) {
        if (!cancelled) setProviderError(error instanceof Error ? error.message : "טעינת זיכרון הלקוח נכשלה.");
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
    setGrounding(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          mode: "chat",
          question: resolvedQuestion,
          view,
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
      setModel(payload.model ?? "");
      if (!response.ok || !payload.success) throw new Error(payload.message || "בקשת AI נכשלה");

      if (!payload.grounding) throw new Error("המודל לא החזיר תשובה עם מקורות נתונים.");
      setAnswer(payload.answer);
      setGrounding(payload.grounding);
      setProvider(payload.provider);
      setProviderError(payload.providerError ?? "");
      setState(payload.provider === "openai" ? `${payload.model || "OpenAI"} פעיל` : "שגיאת חיבור");
      setQuestion("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "החיבור למודל OpenAI נכשל.";
      setAnswer("לא התקבלה תשובה מהמודל. הנתונים לא הוחלפו בתשובה אוטומטית.");
      setGrounding(null);
      setProvider("openai-error");
      setProviderError(message);
      setState("שגיאת חיבור");
    }
  }

  const evidenceIndex = new Map(grounding?.sources.map((source, index) => [source.id, index + 1]) ?? []);
  const evidenceBadges = (ids: string[]) => ids.map((id) => evidenceIndex.get(id)).filter(Boolean).map((index) => `[${index}]`).join(" ");
  const confidenceLabels = { high: "ביטחון גבוה", medium: "ביטחון בינוני", low: "ביטחון נמוך" } as const;

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
            <div className="max-h-[55vh] overflow-y-auto rounded-xl bg-[#f7faf9] p-3 text-sm leading-6 text-[#263548]">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#65738a]">
                <Bot size={14} />
                <span>{state}</span>
                <span className="rounded-full bg-white px-2 py-0.5">
                  {provider === "openai" ? model || "OpenAI" : provider === "idle" ? "טרם הופעל" : "שגיאה"}
                </span>
              </div>
              <p className="font-medium text-[#111318]">{grounding?.answer ?? answer}</p>
              {grounding && (
                <div className="mt-4 divide-y divide-[#dfe7ee] border-t border-[#dfe7ee]">
                  {grounding.facts.length > 0 && (
                    <section className="py-3">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-black text-[#344054]"><Database size={14} /> נתונים</h3>
                      <div className="space-y-2">
                        {grounding.facts.map((item, index) => (
                          <p key={`${item.text}-${index}`}><span className="ml-1 text-[11px] font-black text-[#087f72]">{evidenceBadges(item.evidenceIds)}</span>{item.text}</p>
                        ))}
                      </div>
                    </section>
                  )}
                  {grounding.calculations.length > 0 && (
                    <section className="py-3">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-black text-[#344054]"><Calculator size={14} /> חישובים</h3>
                      <div className="space-y-2">
                        {grounding.calculations.map((item, index) => (
                          <div key={`${item.text}-${index}`}>
                            <p><span className="ml-1 text-[11px] font-black text-[#087f72]">{evidenceBadges(item.evidenceIds)}</span>{item.text}</p>
                            <code className="mt-1 block text-xs text-[#667085]">{item.formula}</code>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {grounding.inferences.length > 0 && (
                    <section className="py-3">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-black text-[#344054]"><Lightbulb size={14} /> הסקה</h3>
                      <div className="space-y-2">
                        {grounding.inferences.map((item, index) => (
                          <div key={`${item.text}-${index}`}>
                            <p><span className="ml-1 text-[11px] font-black text-[#087f72]">{evidenceBadges(item.evidenceIds)}</span>{item.text}</p>
                            <span className="text-[11px] text-[#667085]">{confidenceLabels[item.confidence]}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {grounding.sources.length > 0 && (
                    <section className="py-3">
                      <h3 className="mb-2 text-xs font-black text-[#344054]">מקורות</h3>
                      <div className="divide-y divide-[#e8eeec] overflow-hidden rounded-lg border border-[#dfe7ee] bg-white">
                        {grounding.sources.map((source, index) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => {
                              onNavigate(source.reportView);
                              setOpen(false);
                            }}
                            className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-right transition hover:bg-[#f2f7f5]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-black text-[#111318]">[{index + 1}] {source.title}</span>
                              <span className="mt-0.5 block text-[11px] text-[#667085]">{source.metrics.slice(0, 3).map((item) => `${item.label} ${item.display}`).join(" · ") || source.subtitle}</span>
                            </span>
                            <ExternalLink className="mt-0.5 shrink-0 text-[#087f72]" size={14} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
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
  const [role, setRole] = useState<"admin" | "client">("client");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [state, setState] = useState("טוען משתמשים...");
  const [assignmentByUser, setAssignmentByUser] = useState<Record<string, string>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [query, setQuery] = useState("");

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

    setState("שומר הרשאה...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          role,
          clientId: role === "client" ? clientId : "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת משתמש נכשלה");
      setEmail("");
      setName("");
      setRole("client");
      setShowCreateForm(false);
      await loadUsers();
      setState("המשתמש וההרשאות נשמרו. בכניסה הוא יקבל קוד חד־פעמי למייל.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "שמירת משתמש נכשלה.");
    }
  }

  async function updateUserRole(userId: string, nextRole: "admin" | "client") {
    const user = users.find((item) => item.id === userId);
    const targetClientId = assignmentByUser[userId] || user?.clients[0]?.clientId || clients[0]?.id || "";
    if (nextRole === "client" && !targetClientId) {
      setState("צריך להקים לקוח לפני שינוי התפקיד ללקוח.");
      return;
    }
    setState("מעדכן תפקיד...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole, clientId: nextRole === "client" ? targetClientId : undefined }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "עדכון תפקיד נכשל");
      await loadUsers();
      setState("התפקיד עודכן והמשתמש נותק מכל הסשנים הקיימים.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "עדכון תפקיד נכשל.");
    }
  }

  async function updateUserStatus(userId: string, status: "active" | "suspended") {
    setState(status === "suspended" ? "משעה משתמש..." : "מפעיל משתמש...");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, status }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "עדכון הסטטוס נכשל");
      await loadUsers();
      setState(status === "suspended" ? "המשתמש הושעה וכל הסשנים בוטלו." : "המשתמש הופעל מחדש.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "עדכון הסטטוס נכשל.");
    }
  }

  async function revokeUserSessions(userId: string) {
    setState("מנתק את המשתמש מכל המכשירים...");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action: "revoke_sessions" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "ניתוק הסשנים נכשל");
      setState("המשתמש נותק מכל המכשירים וקודי הכניסה הקודמים בוטלו.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "ניתוק הסשנים נכשל.");
    }
  }

  async function addClientAccess(userId: string) {
    const targetClientId = assignmentByUser[userId] || clients[0]?.id;
    if (!targetClientId) return;
    setState("מוסיף שיוך לקוח...");
    try {
      const response = await fetch("/api/admin/users", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, clientId: targetClientId }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "הוספת השיוך נכשלה");
      await loadUsers();
      setState("הלקוח שויך והמשתמש יתבקש להתחבר מחדש.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "הוספת השיוך נכשלה.");
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
      setState("השיוך הוסר והמשתמש יתבקש להתחבר מחדש.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "הסרת הרשאה נכשלה.");
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("he-IL");
  const filteredUsers = normalizedQuery
    ? users.filter((user) => [user.name, user.email, ...user.clients.map((client) => client.clientName)].join(" ").toLocaleLowerCase("he-IL").includes(normalizedQuery))
    : users;
  const activeUsers = users.filter((user) => user.status === "active").length;
  const clientUsers = users.filter((user) => user.role === "client").length;
  const userCountLabel = users.length === 1 ? "משתמש אחד" : `${users.length} משתמשים`;

  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)] xl:col-span-2">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between sm:px-6">
        <div>
          <h2 className="text-xl font-bold text-[#080123]">משתמשים והרשאות לקוחות</h2>
          <p className="mt-1 text-sm text-[#667085]">{userCountLabel} · {activeUsers} פעילים · {clientUsers} משתמשי לקוח</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadUsers} title="רענון משתמשים" aria-label="רענון משתמשים" className="grid size-10 place-items-center rounded-md border border-[#dfe7ee] text-[#475467] hover:bg-[#f8fafc]"><RefreshCw size={16} /></button>
          <button type="button" onClick={() => setShowCreateForm((current) => !current)} aria-expanded={showCreateForm} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#111318] px-4 text-sm font-bold text-white"><UserPlus size={16} />משתמש חדש</button>
        </div>
      </div>

      {showCreateForm && <div className="grid gap-4 border-b border-[#eaecf0] bg-[#f8fafc] px-5 py-5 sm:px-6">
        <div><h3 className="text-sm font-black text-[#111318]">פרטי המשתמש החדש</h3><p className="mt-1 text-xs text-[#667085]">אין צורך בסיסמה. המשתמש ייכנס באמצעות קוד חד־פעמי שיישלח למייל שאישרת.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_130px_1fr]">
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
        <select
          value={role}
          aria-label="תפקיד משתמש חדש"
          onChange={(event) => setRole(event.target.value as "admin" | "client")}
          className="h-10 rounded-md border border-[#dfe7ee] px-3 text-sm outline-none focus:border-[#6fffe5]"
        >
          <option value="client">לקוח</option>
          <option value="admin">מנהל</option>
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
        </div>
        <div className="flex items-center justify-end gap-3"><button type="button" onClick={() => setShowCreateForm(false)} className="h-10 px-3 text-sm font-bold text-[#667085]">ביטול</button><button onClick={saveUserAccess} className="h-10 rounded-md bg-[#087f72] px-5 text-sm font-bold text-white">צור משתמש</button></div>
      </div>
      }

      <div className="flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <label className="relative block w-full sm:max-w-xs"><Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" size={16} /><span className="sr-only">חיפוש משתמשים</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, אימייל או לקוח" className="h-10 w-full rounded-md border border-[#dfe7ee] pr-10 pl-3 text-sm outline-none focus:border-[#42dfcf]" /></label>
        <p role="status" className="text-xs text-[#667085]">{state}</p>
      </div>

      <div className="mx-5 mb-5 mt-4 grid gap-3 sm:mx-6 lg:hidden">
        {filteredUsers.map((user) => (
          <article key={user.id} className="rounded-lg border border-[#dfe7ee] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-bold text-[#111318]">{user.name || "ללא שם"}</p><p className="truncate text-left text-xs text-[#667085]" dir="ltr">{user.email}</p></div>
              <div className="flex shrink-0 items-center gap-2"><button type="button" disabled={user.isOwner} onClick={() => revokeUserSessions(user.id)} title="נתק מכל המכשירים" aria-label={`נתק את ${user.email} מכל המכשירים`} className="grid size-8 place-items-center rounded-md border border-[#dfe7ee] text-[#667085] disabled:opacity-40"><KeyRound size={14} /></button><button type="button" disabled={user.isOwner} onClick={() => updateUserStatus(user.id, user.status === "active" ? "suspended" : "active")} className={classNames("rounded-full px-3 py-1 text-xs font-bold", user.status === "active" ? "bg-[#e8fbf8] text-[#087f72]" : "bg-rose-50 text-rose-700")}>{user.status === "active" ? "פעיל" : "מושעה"}</button></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#eaecf0] py-3 text-xs">
              <label className="text-[#667085]">תפקיד<select value={user.role} aria-label={`תפקיד ${user.email}`} disabled={user.isOwner} onChange={(event) => updateUserRole(user.id, event.target.value as "admin" | "client")} className="mt-1 h-9 w-full rounded-md border border-[#dfe7ee] bg-white px-2 text-sm text-[#111318]"><option value="owner">בעלים</option><option value="client">לקוח</option><option value="admin">מנהל</option></select></label>
              <div><p className="text-[#667085]">התחברות</p><p className="mt-2 font-bold text-[#344054]">קוד חד־פעמי</p></div>
              <div><p className="text-[#667085]">כניסה אחרונה</p><p className="mt-2 font-bold text-[#344054]">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "טרם התחבר"}</p></div>
              <div><p className="text-[#667085]">נוצר</p><p className="mt-2 font-bold text-[#344054]">{new Date(user.createdAt).toLocaleDateString("he-IL")}</p></div>
            </div>
            <div className="mt-3">
              <p className="text-xs text-[#667085]">גישה ללקוחות</p>
              <p className="mt-1 text-sm font-bold text-[#344054]">{user.role === "admin" || user.role === "owner" ? "כל הלקוחות" : user.clients.length ? user.clients.map((client) => client.clientName).join(" · ") : "אין שיוך"}</p>
              {user.role === "client" && <div className="mt-3 flex gap-2"><select aria-label={`שיוך לקוח עבור ${user.email}`} value={assignmentByUser[user.id] || clients[0]?.id || ""} onChange={(event) => setAssignmentByUser((current) => ({ ...current, [user.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-md border border-[#dfe7ee] px-2 text-xs">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><button type="button" onClick={() => addClientAccess(user.id)} className="h-9 rounded-md border border-[#d0d5dd] px-3 text-xs font-bold">שייך</button></div>}
            </div>
          </article>
        ))}
        {!filteredUsers.length && <p className="py-8 text-center text-sm text-[#667085]">{query ? "לא נמצאו משתמשים שמתאימים לחיפוש." : "אין משתמשים להצגה."}</p>}
      </div>

      <div className="mx-5 mb-5 mt-4 hidden overflow-x-auto rounded-lg border border-[#dfe7ee] sm:mx-6 lg:block">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="bg-[#f4f7f6] text-[#65738a]">
            <tr>
              <th className="p-3 text-right">משתמש</th>
              <th className="p-3 text-right">תפקיד</th>
              <th className="p-3 text-right">התחברות</th>
              <th className="p-3 text-right">סטטוס</th>
              <th className="p-3 text-right">לקוחות משויכים</th>
              <th className="p-3 text-right">נוצר</th>
              <th className="p-3 text-right">אבטחה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f7]">
            {filteredUsers.map((user) => (
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
                    <option value="owner">בעלים</option>
                    <option value="client">לקוח</option>
                    <option value="admin">מנהל</option>
                  </select>
                </td>
                <td className="p-3">
                  <span className="inline-flex rounded-full bg-[#e8fbf8] px-3 py-1 text-xs font-bold text-[#007d72]">
                    קוד למייל
                  </span>
                  <p className="mt-2 text-xs text-[#667085]">הקוד נשלח רק בעת בקשת התחברות</p>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={user.isOwner}
                    onClick={() => updateUserStatus(user.id, user.status === "active" ? "suspended" : "active")}
                    className={classNames("rounded-full px-3 py-1 text-xs font-bold", user.status === "active" ? "bg-[#e8fbf8] text-[#087f72]" : "bg-rose-50 text-rose-700")}
                  >
                    {user.status === "active" ? "פעיל" : "מושעה"}
                  </button>
                  <p className="mt-2 text-xs text-[#667085]">{user.lastLoginAt ? `כניסה: ${new Date(user.lastLoginAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : "טרם התחבר"}</p>
                </td>
                <td className="p-3">
                  {user.role === "admin" || user.role === "owner" ? (
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
                  {user.role === "client" && (
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
                  {user.role === "client" && (
                    <div className="mt-3 flex gap-2">
                      <select aria-label={`שיוך לקוח עבור ${user.email}`} value={assignmentByUser[user.id] || clients[0]?.id || ""} onChange={(event) => setAssignmentByUser((current) => ({ ...current, [user.id]: event.target.value }))} className="h-8 min-w-0 rounded-md border border-[#dfe7ee] px-2 text-xs">
                        {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                      </select>
                      <button type="button" onClick={() => addClientAccess(user.id)} className="h-8 rounded-md border border-[#d0d5dd] px-2 text-xs font-bold">שייך</button>
                    </div>
                  )}
                </td>
                <td className="p-3 text-[#65738a]">
                  {new Date(user.createdAt).toLocaleDateString("he-IL")}
                </td>
                <td className="p-3">
                  <button type="button" disabled={user.isOwner} onClick={() => revokeUserSessions(user.id)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] px-3 text-xs font-bold text-[#475467] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-40"><KeyRound size={14} />נתק מכשירים</button>
                </td>
              </tr>
            ))}
            {!filteredUsers.length && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[#65738a]">
                  {query ? "לא נמצאו משתמשים שמתאימים לחיפוש." : "אין משתמשים להצגה."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminActivityLog() {
  const [items, setItems] = useState<{ id: string; action: string; entityType: string; actorName: string | null; actorEmail: string | null; createdAt: string }[]>([]);
  const [state, setState] = useState("טוען פעילות...");

  async function load() {
    try {
      const response = await fetch("/api/admin/activity", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת הפעילות נכשלה.");
      setItems(payload.data ?? []);
      setState(payload.data?.length ? "" : "עדיין אין פעולות ניהול מתועדות.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "טעינת הפעילות נכשלה.");
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);
  const labels: Record<string, string> = {
    "client.created": "נוצר לקוח",
    "user.created": "נוצר משתמש",
    "user.role_changed": "שונה תפקיד",
    "user.sessions_revoked": "נותק מכל המכשירים",
    "user.active": "הופעל משתמש",
    "user.suspended": "הושעה משתמש",
    "user.client_assigned": "שויך לקוח",
    "user.client_unassigned": "הוסר שיוך לקוח",
    "auth.login_code_sent": "נשלח קוד כניסה",
    "auth.login_code_consumed": "בוצעה כניסה עם קוד",
  };

  return (
    <section className="rounded-xl border border-[#e4e7ec] bg-white p-5">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#667085]">AUDIT</p><h2 className="mt-1 text-xl font-black text-[#111318]">פעילות ניהול</h2></div><button type="button" onClick={load} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-bold">רענון</button></div>
      {state && <p className="mt-4 text-sm text-[#667085]">{state}</p>}
      <div className="mt-4 divide-y divide-[#eaecf0]">
        {items.slice(0, 12).map((item) => <div key={item.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><span className="font-bold text-[#111318]">{labels[item.action] || item.action}</span><span className="mr-2 text-[#667085]">{item.actorName || item.actorEmail || "מערכת"}</span></div><time className="text-xs text-[#98a2b3]">{new Date(item.createdAt).toLocaleString("he-IL")}</time></div>)}
      </div>
    </section>
  );
}

function OwnerAdminWorkspace({ clients }: { clients: Client[] }) {
  const [tab, setTab] = useState<"clients" | "users" | "activity">("clients");
  const tabs = [
    { key: "clients" as const, label: "לקוחות", icon: Building2 },
    { key: "users" as const, label: "משתמשים", icon: Users },
    { key: "activity" as const, label: "פעילות", icon: History },
  ];

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-[#dfe3e8]">
        <div className="flex gap-1" role="tablist" aria-label="ניהול מערכת">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={classNames(
                  "inline-flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-bold transition",
                  tab === item.key ? "border-[#111318] text-[#111318]" : "border-transparent text-[#667085] hover:text-[#344054]",
                )}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="hidden pb-3 text-xs text-[#98a2b3] sm:block">ניהול מערכת · לבעלים בלבד</p>
      </div>
      {tab === "clients" && <ClientOnboardingWizard />}
      {tab === "users" && <UserAccessManager clients={clients} />}
      {tab === "activity" && <AdminActivityLog />}
    </div>
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

  if (canManageUsers) {
    return <OwnerAdminWorkspace clients={clients} />;
  }

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
        ? `אימייל לקוח: ${clientEmail.trim()} (הלקוח ייכנס באמצעות קוד חד־פעמי)`
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

function SyncReliabilityPanel({
  account,
  history,
  isRefreshing,
  onRefresh,
}: {
  account: FlashyAccount;
  history: SyncHistoryEntry[];
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const accountHistory = history.filter((run) => run.accountId === account.id).slice(0, 8);
  const hasWarnings = Boolean(account.syncWarnings?.length);
  const status = hasWarnings
    ? { label: "דורש בדיקה", dot: "bg-[#f79009]", text: "text-[#b54708]" }
    : ({
        healthy: { label: "תקין", dot: "bg-[#12b76a]", text: "text-[#067647]" },
        syncing: { label: "מסתנכרן", dot: "bg-[#2e90fa]", text: "text-[#175cd3]" },
        failed: { label: "נכשל", dot: "bg-[#f04438]", text: "text-[#b42318]" },
        stale: { label: "לא עדכני", dot: "bg-[#f79009]", text: "text-[#b54708]" },
        never: { label: "טרם סונכרן", dot: "bg-[#98a2b3]", text: "text-[#667085]" },
      } as const)[account.syncStatus ?? "healthy"];
  const sourceLabels: Record<SyncHistoryEntry["source"], string> = {
    manual: "ידני",
    cron: "אוטומטי",
    onboarding: "הקמה",
    system: "מערכת",
  };
  const runPresentation: Record<SyncHistoryEntry["status"], { label: string; className: string }> = {
    success: { label: "הושלם", className: "text-[#067647]" },
    warning: { label: "הושלם עם אזהרה", className: "text-[#b54708]" },
    failed: { label: "נכשל", className: "text-[#b42318]" },
    skipped: { label: "דולג", className: "text-[#667085]" },
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#dfe7ee] bg-white shadow-[0_8px_22px_rgba(8,1,35,0.04)] xl:col-span-2">
      <div className="flex flex-col gap-3 border-b border-[#e4e7ec] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#087f72]" />
            <h2 className="text-lg font-bold text-[#111318]">אמינות וסנכרון</h2>
          </div>
          <p className="mt-1 text-xs text-[#667085]">בדיקות המקורות והיסטוריית הריצות של החשבון.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm font-medium text-[#344054] hover:bg-[#f8fafb] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          {isRefreshing ? "מסנכרן" : "סנכרן עכשיו"}
        </button>
      </div>

      <div className="grid border-b border-[#e4e7ec] sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-[#e4e7ec]">
        <div className="px-5 py-4">
          <p className="text-xs text-[#667085]">מצב נוכחי</p>
          <p className={`mt-1.5 inline-flex items-center gap-2 text-sm font-bold ${status.text}`}>
            <span className={`size-2 rounded-full ${status.dot}`} />
            {status.label}
          </p>
        </div>
        <div className="border-t border-[#e4e7ec] px-5 py-4 sm:border-t-0">
          <p className="text-xs text-[#667085]">סנכרון אחרון</p>
          <p className="mt-1.5 text-sm font-bold tabular-nums text-[#111318]">
            {account.syncStatus === "never" ? "אין עדיין" : new Date(account.lastSyncAt).toLocaleString("he-IL")}
          </p>
        </div>
        <div className="border-t border-[#e4e7ec] px-5 py-4 sm:border-t-0">
          <p className="text-xs text-[#667085]">רשומות בריצה האחרונה</p>
          <p className="mt-1.5 text-sm font-bold tabular-nums text-[#111318]">
            {account.lastSyncImported
              ? `${formatNumber(account.lastSyncImported.emailCampaigns)} אימייל · ${formatNumber(account.lastSyncImported.smsCampaigns)} SMS · ${formatNumber(account.lastSyncImported.automations)} רשומות אוטומציה`
              : "יופיע לאחר הסנכרון הבא"}
          </p>
        </div>
      </div>

      {(account.syncError || hasWarnings) && (
        <div className="border-b border-[#e4e7ec] bg-[#fffcf5] px-5 py-3 text-sm text-[#7a4b00]">
          {account.syncError && <p>{account.syncError}</p>}
          {account.syncWarnings?.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      <div className="px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <History size={16} className="text-[#667085]" />
          <h3 className="text-sm font-bold text-[#111318]">ריצות אחרונות</h3>
        </div>
        {accountHistory.length ? (
          <div className="divide-y divide-[#eef0f2] border-y border-[#eef0f2]">
            {accountHistory.map((run) => {
              const runState = runPresentation[run.status];
              const duration = run.durationMs >= 1000
                ? `${(run.durationMs / 1000).toFixed(1)} שנ׳`
                : `${Math.max(1, Math.round(run.durationMs))} מ״ש`;
              return (
                <div key={run.id} className="grid gap-2 py-3 text-xs sm:grid-cols-[150px_130px_minmax(0,1fr)_90px] sm:items-center">
                  <div className="tabular-nums text-[#475467]">{new Date(run.finishedAt).toLocaleString("he-IL")}</div>
                  <div><b className={runState.className}>{runState.label}</b><span className="mr-1 text-[#98a2b3]">· {sourceLabels[run.source]}</span></div>
                  <div className="min-w-0 text-[#475467]">
                    {run.status === "failed"
                      ? <span className="block truncate" title={run.message}>{run.message}</span>
                      : `${formatNumber(run.imported.emailCampaigns)} אימייל · ${formatNumber(run.imported.smsCampaigns)} SMS · ${formatNumber(run.imported.automations)} רשומות אוטומציה${run.checksTotal ? ` · ${run.checksPassed}/${run.checksTotal} מקורות` : ""}`}
                  </div>
                  <div className="tabular-nums text-[#98a2b3] sm:text-left">{duration}</div>
                  {run.warnings.length > 0 && <p className="text-[#b54708] sm:col-span-4">{run.warnings.join(" · ")}</p>}
                  {run.metricSnapshot && (
                    <p className={classNames(
                      "sm:col-span-4",
                      run.metricSnapshot.historicalChangedDays > 0 ? "text-[#b54708]" : "text-[#667085]",
                    )}>
                      צילום מדדים: {formatCurrency(run.metricSnapshot.totalRevenue, account.currency)} · {formatNumber(run.metricSnapshot.totalPurchases)} רכישות · {formatCurrency(run.metricSnapshot.totalCostIls, account.currency)} עלויות
                      {!run.metricSnapshot.comparedToPrevious
                        ? " · צילום בסיס ראשון"
                        : run.metricSnapshot.historicalChangedDays > 0
                          ? ` · ${formatNumber(run.metricSnapshot.historicalChangedDays)} ימים קודמים השתנו (${run.metricSnapshot.historicalRevenueDelta >= 0 ? "+" : ""}${formatCurrency(run.metricSnapshot.historicalRevenueDelta, account.currency)})`
                          : " · אין שינוי בימים קודמים"}
                      {run.metricSnapshot.costConfigurationChanged ? " · הגדרות העלות השתנו" : ""}
                      {run.metricSnapshot.largestChanges.length > 0
                        ? ` · מוקדי השינוי: ${run.metricSnapshot.largestChanges.slice(0, 3).map((change) => `${new Date(`${change.date}T12:00:00`).toLocaleDateString("he-IL")} (${change.revenueDelta >= 0 ? "+" : ""}${formatCurrency(change.revenueDelta, account.currency)})`).join(" · ")}`
                        : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="border-y border-[#eef0f2] py-4 text-sm text-[#667085]">היסטוריית הריצות תתחיל להופיע לאחר הסנכרון הבא.</p>
        )}
      </div>
    </section>
  );
}

function AccountSettings({
  client,
  account,
  syncHistory,
  isRefreshing,
  onRefresh,
  onUpdateAccount,
}: {
  client: Client;
  account: FlashyAccount;
  syncHistory: SyncHistoryEntry[];
  isRefreshing: boolean;
  onRefresh: () => void;
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
      <SyncReliabilityPanel
        account={account}
        history={syncHistory}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
      />
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
  const [localSyncHistory, setLocalSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(localClients[0].id);
  const [view, setView] = useState<ViewKey>("overview");
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [viewerRole, setViewerRole] = useState<"owner" | "admin" | "client">("owner");
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [dataSource, setDataSource] = useState<"demo" | "neon" | "loading">("loading");
  const [dataNotice, setDataNotice] = useState("טוען נתונים מ-Neon...");
  const [authRequired, setAuthRequired] = useState(false);
  const [liveDataIssue, setLiveDataIssue] = useState("");
  const [refreshState, setRefreshState] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const viewerIsStaff = viewerRole === "owner" || viewerRole === "admin";
  const viewerIsOwner = viewerRole === "owner";
  const isRestrictedUser = !viewerIsStaff;
  const canonicalAccountIds = new Set(canonicalPortfolioAccounts(localAccounts).map((item) => item.id));
  const portfolioRows: AgencyPortfolioRow[] = localClients.flatMap((client) => {
    const allClientAccounts = localAccounts.filter((item) => item.clientId === client.id);
    const clientAccounts = allClientAccounts.filter((item) => canonicalAccountIds.has(item.id));
    if (allClientAccounts.length > 0 && clientAccounts.length === 0) return [];
    const accountResults = clientAccounts.map((clientAccount) => {
      const currentEmails = filterByTimeRange(
        byAccount(localEmailReports, clientAccount.id),
        timeRange,
        (item) => item.sentAt,
        customStartDate,
        customEndDate,
        clientAccount.timezone,
      );
      const currentSms = filterByTimeRange(
        byAccount(localSmsReports, clientAccount.id),
        timeRange,
        (item) => item.sentAt,
        customStartDate,
        customEndDate,
        clientAccount.timezone,
      );
      const currentAutomationRows = filterByTimeRange(
        byAccount(localAutomationReports, clientAccount.id),
        timeRange,
        (item) => item.date,
        customStartDate,
        customEndDate,
        clientAccount.timezone,
      );
      const currentAutomations = consolidateAutomations(currentAutomationRows);
      const bounds = getTimeRangeBounds(timeRange, customStartDate, customEndDate, clientAccount.timezone);
      const priorBounds = getPreviousRangeBounds(bounds, clientAccount.timezone);
      const priorEmails = priorBounds
        ? filterByBounds(byAccount(localEmailReports, clientAccount.id), priorBounds, (item) => item.sentAt, clientAccount.timezone)
        : [];
      const priorSms = priorBounds
        ? filterByBounds(byAccount(localSmsReports, clientAccount.id), priorBounds, (item) => item.sentAt, clientAccount.timezone)
        : [];
      const priorAutomationRows = priorBounds
        ? filterByBounds(byAccount(localAutomationReports, clientAccount.id), priorBounds, (item) => item.date, clientAccount.timezone)
        : [];

      return {
        summary: summarizeAccount(clientAccount, currentEmails, currentSms, currentAutomations),
        previousSummary: priorBounds
          ? summarizeAccount(clientAccount, priorEmails, priorSms, consolidateAutomations(priorAutomationRows))
          : null,
        activityCount: currentEmails.length + currentSms.length + currentAutomations.length,
      };
    });
    const statusPriority = { failed: 5, stale: 4, syncing: 3, never: 2, healthy: 1 } as const;
    const syncAccount = [...clientAccounts].sort(
      (a, b) => statusPriority[b.syncStatus ?? "healthy"] - statusPriority[a.syncStatus ?? "healthy"],
    )[0];
    const latestSyncAt = clientAccounts
      .map((item) => item.lastSyncAt)
      .filter(Boolean)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    const previousSummaries = accountResults.flatMap((result) => result.previousSummary ? [result.previousSummary] : []);

    return [{
      clientId: client.id,
      clientName: client.name,
      accountName: clientAccounts.map((item) => item.name).join(" · ") || "אין חשבון Flashy",
      accountCount: clientAccounts.length,
      currency: clientAccounts[0]?.currency ?? "ILS",
      summary: combineMetricSummaries(accountResults.map((result) => result.summary)),
      previousSummary: previousSummaries.length ? combineMetricSummaries(previousSummaries) : null,
      activityCount: accountResults.reduce((total, result) => total + result.activityCount, 0),
      syncStatus: syncAccount?.syncStatus ?? "never",
      syncError: syncAccount?.syncError,
      lastSyncAt: latestSyncAt,
    }];
  });
  const portfolioSummary = combineMetricSummaries(portfolioRows.map((row) => row.summary));
  const portfolioPreviousRows = portfolioRows.flatMap((row) => row.previousSummary ? [row.previousSummary] : []);
  const portfolioPreviousSummary = portfolioPreviousRows.length
    ? combineMetricSummaries(portfolioPreviousRows)
    : null;
  const portfolioCurrencies = new Set(portfolioRows.map((row) => row.currency));
  const portfolioCurrency = portfolioRows[0]?.currency ?? "ILS";
  const portfolioHasMixedCurrencies = portfolioCurrencies.size > 1;
  const visibleSyncStatus = account.syncWarnings?.length ? "warning" : (account.syncStatus ?? "healthy");
  const syncPresentation = {
    healthy: { label: "מסונכרן", dot: "before:bg-[#42dfcf]", text: "text-[#087f72]" },
    syncing: { label: "מסתנכרן", dot: "before:bg-[#2e90fa]", text: "text-[#175cd3]" },
    failed: { label: "סנכרון נכשל", dot: "before:bg-[#f04438]", text: "text-[#b42318]" },
    stale: { label: "הנתונים לא עדכניים", dot: "before:bg-[#f79009]", text: "text-[#b54708]" },
    never: { label: "טרם סונכרן", dot: "before:bg-[#98a2b3]", text: "text-[#667085]" },
    warning: { label: "נדרשת בדיקת נתונים", dot: "before:bg-[#f79009]", text: "text-[#b54708]" },
  }[visibleSyncStatus];

  const visibleViews = views.filter((item) => {
    if (item.key === "portfolio" && !viewerIsStaff) return false;
    if (item.key === "admin" && !viewerIsOwner) return false;
    if (isRestrictedUser && item.key === "settings") return false;
    return !item.module || selectedClient.visibleModules.includes(item.module) || item.key === "admin";
  });
  const effectiveShowDeepAnalysis = showDeepAnalysis;
  const activeView = isRestrictedUser && (view === "portfolio" || view === "settings" || view === "admin") ? "overview" : view;
  const showTimeRange = activeView === "portfolio" || costViewKeys.includes(activeView);

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
          setView((current) => (current === "portfolio" || current === "settings" || current === "admin" ? "overview" : current));
        } else if (data.clients.length > 1) {
          setView("portfolio");
        }
        setLocalClients(data.clients);
        setLocalAccounts(data.accounts);
        setLocalEmailReports(data.emailReports);
        setLocalSmsReports(data.smsReports);
        setLocalAutomationReports(data.automationReports);
        setLocalNewsletterPlans(data.newsletterPlans);
        setLocalSyncHistory(data.syncHistory ?? []);
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
    if (isRefreshing) return;
    setIsRefreshing(true);
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
        setView((current) => (current === "portfolio" || current === "settings" || current === "admin" ? "overview" : current));
      }
      setLocalClients(data.clients);
      setLocalAccounts(data.accounts);
      setLocalEmailReports(data.emailReports);
      setLocalSmsReports(data.smsReports);
      setLocalAutomationReports(data.automationReports);
      setLocalNewsletterPlans(data.newsletterPlans);
      setLocalSyncHistory(data.syncHistory ?? []);
      setAuthRequired(false);
      setLiveDataIssue("");
      setDataSource("neon");
      setDataNotice(`רוענן עכשיו: ${data.clients.length} לקוחות מ-Neon.`);
      const syncWarnings = syncPayload.completeness?.warnings ?? [];
      setRefreshState(syncPayload.skipped
        ? "החשבון כבר מסתנכרן ברקע. נטענו הנתונים הזמינים."
        : `סונכרן: ${syncPayload.imported?.emailCampaigns ?? 0} אימייל, ${
            syncPayload.imported?.smsCampaigns ?? 0
          } SMS, ${syncPayload.imported?.automations ?? 0} רשומות אוטומציה${syncWarnings.length ? " · נמצאה חריגת נפח לבדיקה בהגדרות." : " · כל המקורות עברו בדיקה."}`);
    } catch (error) {
      setRefreshState(error instanceof Error ? error.message : "הרענון נכשל.");
      try {
        const statusResponse = await fetch("/api/dashboard-data", { cache: "no-store" });
        const statusPayload = await statusResponse.json();
        if (statusResponse.ok && statusPayload.success) {
          const statusData = statusPayload.data as DashboardDataPayload;
          setLocalAccounts(statusData.accounts);
          setLocalSyncHistory(statusData.syncHistory ?? []);
        }
      } catch {
        // Keep the original sync error visible when the status refresh also fails.
      }
    } finally {
      setIsRefreshing(false);
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

  function deleteNewsletterPlan(planId: string) {
    setLocalNewsletterPlans((current) => current.filter((item) => item.id !== planId));
  }

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setRefreshState("");
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
        {localClients.length > 1 && activeView !== "portfolio" && (
          <ClientSelector
            clients={localClients}
            selectedClientId={selectedClientId}
            onChange={selectClient}
            mobile
          />
        )}
        <header className="mb-4 flex flex-col items-start justify-between gap-3 border-b border-[#e4e7ec] pb-4 lg:flex-row lg:items-end">
          <div>
            {!isRestrictedUser && activeView !== "portfolio" && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                <span>Flashy Account #{account.flashyAccountId}</span>
                <button
                  type="button"
                  onClick={() => setView("settings")}
                  title={account.syncError || account.syncWarnings?.join(" · ") || "פתח פרטי סנכרון"}
                  className={classNames(
                    "inline-flex items-center gap-1 font-medium before:size-1.5 before:rounded-full hover:underline",
                    syncPresentation.dot,
                    syncPresentation.text,
                  )}
                >
                  {syncPresentation.label}
                </button>
                {account.syncStatus !== "never" && (
                  <span>עדכון אחרון: {new Date(account.lastSyncAt).toLocaleString("he-IL")}</span>
                )}
              </div>
            )}
            <h1 className="m-0 text-[clamp(26px,3vw,38px)] font-bold leading-tight tracking-normal text-[#111318]">
              {activeView === "portfolio" ? "סקירת סוכנות" : account.name}
            </h1>
            {activeView === "portfolio" && (
              <p className="mt-1 text-xs text-[#667085]">{formatNumber(portfolioRows.length)} לקוחות · תמונת ביצועים מרוכזת</p>
            )}
            {isRestrictedUser && (
              <p className="mt-1 text-xs text-[#667085]">ביצועים · {timeRanges.find((range) => range.key === timeRange)?.label}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isRestrictedUser && activeView !== "portfolio" && <button
              onClick={refreshDashboardData}
              disabled={isRefreshing}
              className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#344054] transition hover:bg-[#f8fafb] disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={classNames("ml-2 inline", isRefreshing && "animate-spin")} size={16} />
              {isRefreshing ? "מסנכרן" : "רענון"}
            </button>}
            <button
              onClick={logout}
              className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#667085] transition hover:bg-[#f8fafb] hover:text-[#111318]"
            >
              יציאה
            </button>
          </div>
          {refreshState && <p aria-live="polite" className="text-xs text-[#667085]">{refreshState}</p>}
        </header>

        <div>
          {showTimeRange && (
            <section className="mb-4 rounded-lg border border-[#e4e7ec] bg-white px-3 py-2.5">
              {activeView !== "portfolio" && activeRangeBounds.start && activeRangeBounds.end && <p className="mb-2 text-xs tabular-nums text-[#667085]">
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
          {activeView === "portfolio" && viewerIsStaff && (
            <AgencyPortfolio
              rows={portfolioRows}
              summary={portfolioSummary}
              previousSummary={portfolioPreviousSummary}
              currency={portfolioCurrency}
              mixedCurrencies={portfolioHasMixedCurrencies}
              onOpenClient={selectClient}
            />
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
                canAudit={viewerIsStaff}
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
              onDeletePlan={deleteNewsletterPlan}
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
                key={selectedClient.id}
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
              syncHistory={localSyncHistory}
              isRefreshing={isRefreshing}
              onRefresh={refreshDashboardData}
              onUpdateAccount={updateAccountSettings}
            />
          )}
          {activeView === "admin" && viewerIsOwner && (
            <AdminPanel
              canManageUsers={canManageUsers}
              clientName={selectedClient.name}
              clients={localClients}
              onCreateLiveClient={createLiveClient}
            />
          )}
        </div>
      </main>
      {!isRestrictedUser && activeView !== "portfolio" && (
        <FloatingAiChat
          key={selectedClient.id}
          clientId={selectedClient.id}
          view={activeView}
          account={account}
          summary={summary}
          emails={accountEmails}
          sms={accountSms}
          automations={accountAutomations}
          plans={accountPlans}
          onNavigate={(nextView) => {
            setView(nextView);
            if (costViewKeys.includes(nextView)) setShowDeepAnalysis(true);
          }}
        />
      )}
    </div>
  );
}
