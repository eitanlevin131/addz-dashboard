import { parseMoney } from "./metrics";

const FLASHY_BASE_URL = "https://api.flashy.app";

export class FlashyApiError extends Error {
  status: number;
  path: string;
  payload: unknown;

  constructor(status: number, path: string, payload: unknown) {
    super(extractFlashyMessage(payload) || `Flashy API error ${status}`);
    this.name = "FlashyApiError";
    this.status = status;
    this.path = path;
    this.payload = payload;
  }
}

export interface FlashyRequestOptions {
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

export async function flashyRequest<T>({
  apiKey,
  path,
  method = "GET",
  body,
}: FlashyRequestOptions): Promise<T> {
  const response = await fetch(`${FLASHY_BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new FlashyApiError(response.status, path, payload);
  }

  return payload;
}

function extractFlashyMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  return String(record.message || record.error || record.reason || "");
}

export async function validateFlashyAccount(apiKey: string) {
  return flashyRequest<{
    success: boolean;
    data: {
      id: number;
      account: string;
      name: string;
      website: string;
      credits: string;
      timezone: string;
      currency: string;
    };
  }>({ apiKey, path: "/account" });
}

export async function getFlashyReports(apiKey: string, from: number, to: number) {
  const query = `from=${from}&to=${to}`;
  const endpoints = {
    emails: `/reports/emails?${query}`,
    sms: `/reports/sms?${query}`,
    automations: `/reports/automations?${query}`,
  };
  const [emails, sms, automations] = await Promise.allSettled([
    flashyRequest<{ success: boolean; data: unknown[] }>({
      apiKey,
      path: endpoints.emails,
    }),
    flashyRequest<{ success: boolean; data: unknown[] }>({
      apiKey,
      path: endpoints.sms,
    }),
    getAutomationReportWindows(apiKey, from, to),
  ]);

  return {
    emails: emails.status === "fulfilled" ? emails.value.data ?? [] : [],
    sms: sms.status === "fulfilled" ? sms.value.data ?? [] : [],
    automations: automations.status === "fulfilled" ? automations.value.data ?? [] : [],
    checks: [
      describeReportCheck("אימייל", endpoints.emails, emails),
      describeReportCheck("SMS", endpoints.sms, sms),
      describeReportCheck("אוטומציות", endpoints.automations, automations),
    ],
  };
}

async function getAutomationReportWindows(apiKey: string, from: number, to: number) {
  const data: unknown[] = [];
  for (const window of monthWindows(new Date(from * 1000), new Date(to * 1000))) {
    const result = await flashyRequest<{ success: boolean; data: unknown[] }>({
      apiKey,
      path: `/reports/automations?from=${window.from}&to=${window.to}`,
    });
    if (!Array.isArray(result.data)) throw new Error("Invalid automation report response");
    data.push(...result.data);
  }
  return { success: true, data };
}

function describeReportCheck(
  label: string,
  path: string,
  result: PromiseSettledResult<{ success: boolean; data: unknown[] }>,
) {
  if (result.status === "fulfilled") {
    return {
      label,
      path,
      ok: true,
      count: result.value.data?.length ?? 0,
    };
  }

  const reason = result.reason;
  return {
    label,
    path,
    ok: false,
    status: reason instanceof FlashyApiError ? reason.status : null,
    message: reason instanceof Error ? reason.message : "Unknown Flashy API error",
  };
}

export function normalizeFlashyReportMoney<Row extends Record<string, unknown>>(row: Row) {
  return {
    ...row,
    revenueGenerated: parseMoney(row.revenue_generated as string),
    avgPurchaseValue: parseMoney(row.avg_purchase_value as string),
    revenuePerMessage: parseMoney(row.revenue_per_message as string),
    raw: row,
  };
}

export function monthWindows(from: Date, to: Date) {
  const windows: { from: number; to: number }[] = [];
  let cursor = Math.floor(from.getTime() / 1000);
  const last = Math.floor(to.getTime() / 1000);
  if (!Number.isFinite(cursor) || !Number.isFinite(last) || cursor > last) {
    throw new Error("Invalid report date range");
  }
  while (cursor <= last) {
    // Flashy accepts at most 30 calendar days per automation request.
    // End at a day boundary so adjacent requests neither repeat nor skip a day.
    const end = Math.min(Math.floor(cursor / 86400) * 86400 + 30 * 86400 - 1, last);
    windows.push({ from: cursor, to: end });
    cursor = end + 1;
  }

  return windows;
}
