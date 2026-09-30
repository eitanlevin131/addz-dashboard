import { accountDate, accountLocalTimestamp } from "./report-time.ts";

export type QuestionPeriod = {
  label: string;
  startDate: string;
  endDate: string;
  endExclusiveDate: string;
  start: string;
  endExclusive: string;
};

const monthNames = [
  ["ינואר", "january", "jan"],
  ["פברואר", "february", "feb"],
  ["מרץ", "march", "mar"],
  ["אפריל", "april", "apr"],
  ["מאי", "may"],
  ["יוני", "june", "jun"],
  ["יולי", "july", "jul"],
  ["אוגוסט", "august", "aug"],
  ["ספטמבר", "september", "sep", "sept"],
  ["אוקטובר", "october", "oct"],
  ["נובמבר", "november", "nov"],
  ["דצמבר", "december", "dec"],
] as const;

const hebrewMonthLabels = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function calendarDate(year: number, month: number, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsedCalendarDate(day: number, month: number, year: number) {
  const fullYear = year < 100 ? 2000 + year : year;
  if (fullYear < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = calendarDate(fullYear, month, day);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    parsed.getUTCFullYear() !== fullYear
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
  ) return null;
  return value;
}

function explicitDates(value: string) {
  const matches = [...value.matchAll(/(?:^|[^\d])(\d{1,2})[./](\d{1,2})[./](\d{2}|20\d{2})(?=$|[^\d])/g)];
  return matches
    .map((match) => parsedCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])))
    .filter((date): date is string => Boolean(date));
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function periodFromDates(label: string, startDate: string, endExclusiveDate: string, timezone: string): QuestionPeriod {
  return {
    label,
    startDate,
    endDate: shiftDate(endExclusiveDate, -1),
    endExclusiveDate,
    start: accountLocalTimestamp(startDate, "00:00:00", timezone),
    endExclusive: accountLocalTimestamp(endExclusiveDate, "00:00:00", timezone),
  };
}

function monthPeriod(year: number, month: number, timezone: string) {
  const next = nextMonth(year, month);
  return periodFromDates(
    `${hebrewMonthLabels[month - 1]} ${year}`,
    calendarDate(year, month),
    calendarDate(next.year, next.month),
    timezone,
  );
}

function yearPeriod(year: number, timezone: string) {
  return periodFromDates(`שנת ${year}`, calendarDate(year, 1), calendarDate(year + 1, 1), timezone);
}

export function resolveAiQuestionPeriod(question: string, timezone: string, now = new Date()): QuestionPeriod | null {
  const value = question.toLowerCase().replace(/[׳״]/g, "").trim();
  const today = accountDate(now, timezone);
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const dates = explicitDates(value);
  const numericMonth = value.match(/(?:^|\D)(0?[1-9]|1[0-2])[./-](20\d{2})(?:\D|$)/);
  const namedMonth = monthNames.findIndex((aliases) => aliases.some((alias) => {
    if (/^[א-ת]+$/.test(alias)) return value.includes(alias);
    return new RegExp(`(?:^|[^a-z])${alias}(?=$|[^a-z])`, "i").test(value);
  })) + 1;
  const explicitYear = Number(value.match(/\b(20\d{2})\b/)?.[1] ?? 0);

  if (dates.length >= 2) {
    const [startDate, endDate] = dates;
    if (startDate > endDate) return null;
    const label = `${Number(startDate.slice(8, 10))}.${Number(startDate.slice(5, 7))}.${startDate.slice(0, 4)}–${Number(endDate.slice(8, 10))}.${Number(endDate.slice(5, 7))}.${endDate.slice(0, 4)}`;
    return periodFromDates(label, startDate, shiftDate(endDate, 1), timezone);
  }
  if (dates.length === 1) {
    const [date] = dates;
    const label = `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}.${date.slice(0, 4)}`;
    return periodFromDates(label, date, shiftDate(date, 1), timezone);
  }
  if (numericMonth) return monthPeriod(Number(numericMonth[2]), Number(numericMonth[1]), timezone);
  if (namedMonth > 0) {
    const year = explicitYear
      || (/שנה שעברה|last year/.test(value) ? currentYear - 1 : namedMonth <= currentMonth ? currentYear : currentYear - 1);
    return monthPeriod(year, namedMonth, timezone);
  }
  if (/חודש שעבר|החודש הקודם|last month/.test(value)) {
    const previous = currentMonth === 1 ? { year: currentYear - 1, month: 12 } : { year: currentYear, month: currentMonth - 1 };
    return monthPeriod(previous.year, previous.month, timezone);
  }
  if (/החודש|this month/.test(value)) return monthPeriod(currentYear, currentMonth, timezone);
  if (explicitYear) return yearPeriod(explicitYear, timezone);
  if (/שנה שעברה|last year/.test(value)) return yearPeriod(currentYear - 1, timezone);
  if (/השנה|this year/.test(value)) return yearPeriod(currentYear, timezone);
  if (/שנה אחרונה|12 חודשים|last 12 months|past year/.test(value)) {
    const startDate = shiftDate(today, -364);
    return periodFromDates("12 החודשים האחרונים", startDate, shiftDate(today, 1), timezone);
  }
  return null;
}
