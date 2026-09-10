export function accountLocalTimestamp(date: string, time: string, timezone: string): string {
  const local = `${date}T${time}`;
  const target = Date.parse(`${local}Z`);
  if (!Number.isFinite(target)) throw new Error(`Invalid report date: ${local}`);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const observed = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const delta = target - observed;
    if (!delta) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error(`Report date does not exist in ${timezone}: ${local}`);
}

export function accountDate(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function reportRange(days: number, timezone: string, now = new Date()) {
  const endDate = accountDate(now, timezone);
  const start = new Date(`${endDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10);
  return { start: accountLocalTimestamp(startDate, "00:00:00", timezone), end: accountLocalTimestamp(endDate, "23:59:59", timezone) };
}

export function reportDateInstant(value: string, timezone: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? accountLocalTimestamp(value, "00:00:00", timezone) : value;
}
