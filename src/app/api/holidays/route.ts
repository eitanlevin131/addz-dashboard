import { NextResponse } from "next/server";

type HolidayRegion = "IL" | "US";

type Holiday = {
  date: string;
  name: string;
  region: HolidayRegion;
  source: "Hebcal" | "Nager.Date";
};

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function yearRange(start: Date, end: Date) {
  const years: number[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    years.push(year);
  }
  return years;
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

async function fetchIsraelHolidays(start: string, end: string): Promise<Holiday[]> {
  const params = new URLSearchParams({
    v: "1",
    cfg: "json",
    start,
    end,
    maj: "on",
    min: "on",
    mod: "on",
    nx: "on",
    i: "on",
    lg: "he",
  });
  const response = await fetch(`https://www.hebcal.com/hebcal?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!response.ok) throw new Error("Hebcal holiday sync failed");
  const payload = (await response.json()) as {
    items?: Array<{ date?: string; title?: string; hebrew?: string; category?: string }>;
  };

  return (payload.items ?? [])
    .filter((item) => item.date && ["holiday", "roshchodesh"].includes(item.category ?? ""))
    .map((item) => ({
      date: item.date!.slice(0, 10),
      name: item.hebrew || item.title || "חג",
      region: "IL" as const,
      source: "Hebcal" as const,
    }))
    .filter((holiday) => inRange(holiday.date, start, end));
}

async function fetchUnitedStatesHolidays(start: Date, end: Date): Promise<Holiday[]> {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  const responses = await Promise.all(
    yearRange(start, end).map(async (year) => {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`, {
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!response.ok) throw new Error("Nager.Date holiday sync failed");
      return (await response.json()) as Array<{ date: string; localName: string; name: string }>;
    }),
  );

  return responses
    .flat()
    .filter((item) => inRange(item.date, startKey, endKey))
    .map((item) => ({
      date: item.date,
      name: item.localName || item.name,
      region: "US" as const,
      source: "Nager.Date" as const,
    }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get("start"));
  const end = parseDate(searchParams.get("end"));
  const regions = searchParams
    .get("regions")
    ?.split(",")
    .filter((region): region is HolidayRegion => region === "IL" || region === "US") ?? ["IL", "US"];

  if (!start || !end || start > end) {
    return NextResponse.json(
      {
        success: false,
        message: "טווח תאריכים לא תקין.",
      },
      { status: 400 },
    );
  }

  const startKey = dateKey(start);
  const endKey = dateKey(end);
  const holidayGroups = await Promise.all([
    regions.includes("IL") ? fetchIsraelHolidays(startKey, endKey) : Promise.resolve([]),
    regions.includes("US") ? fetchUnitedStatesHolidays(start, end) : Promise.resolve([]),
  ]);
  const holidays = holidayGroups
    .flat()
    .filter((holiday, index, array) =>
      array.findIndex(
        (item) => item.date === holiday.date && item.region === holiday.region && item.name === holiday.name,
      ) === index,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.region.localeCompare(b.region));

  return NextResponse.json({
    success: true,
    data: {
      source: "synced",
      holidays,
    },
  });
}
