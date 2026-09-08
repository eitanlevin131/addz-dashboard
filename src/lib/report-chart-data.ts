export const weekdayLabels = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function campaignTiming(rows: { sentAt: string; revenue: number; purchases: number }[], timezone: string) {
  let clock: Intl.DateTimeFormat;
  try {
    clock = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", hourCycle: "h23" });
  } catch {
    clock = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "2-digit", hourCycle: "h23" });
  }
  const days = weekdayLabels.map(label => ({ label, revenue: 0, purchases: 0, count: 0 }));
  const hours = new Map<string, (typeof days)[number]>();
  for (const row of rows) {
    const date = new Date(row.sentAt);
    if (!Number.isFinite(date.getTime())) continue;
    const parts = clock.formatToParts(date);
    const weekday = parts.find(p => p.type === "weekday")?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    if (day < 0) continue;
    const hour = `${parts.find(p => p.type === "hour")?.value}:00`;
    const group = hours.get(hour) ?? { label: hour, revenue: 0, purchases: 0, count: 0 };
    for (const target of [days[day], group]) {
      target.revenue += row.revenue;
      target.purchases += row.purchases;
      target.count++;
    }
    hours.set(hour, group);
  }
  return { days, hours: [...hours.values()], timezone: clock.resolvedOptions().timeZone };
}

export function measuredRate(numerator: number, denominator: number): number | null {
  return Number.isFinite(numerator) && denominator > 0 && Number.isFinite(denominator) ? numerator / denominator : null;
}

export function smsReturnRatio(revenue: number, cost: number): number | null {
  return Number.isFinite(revenue) && Number.isFinite(cost) && cost > 0 ? revenue / cost : null;
}
