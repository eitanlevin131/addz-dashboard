export const SYNC_LOCK_TIMEOUT_MS = 20 * 60 * 1000;
export const SYNC_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type SyncRunSnapshot = {
  status: string;
  startedAt: Date | string;
  finishedAt: Date | string | null;
  errorMessage: string | null;
};

export type SyncHealth = "healthy" | "syncing" | "failed" | "stale" | "never";

export type SyncVolume = {
  emails: number;
  sms: number;
  automations: number;
};

export function isTransientSyncStatus(status: number | null | undefined) {
  return status == null || status === 408 || status === 429 || status >= 500;
}

export function getRetryDelayMs(attempt: number) {
  return Math.min(500 * 3 ** Math.max(0, attempt - 1), 4500);
}

export function deriveSyncHealth(
  lastSyncAt: Date | string | null,
  latestRun: SyncRunSnapshot | null,
  now = new Date(),
): { status: SyncHealth; error: string | null; startedAt: string | null } {
  const lastSuccessfulSync = lastSyncAt ? new Date(lastSyncAt) : null;
  const runStartedAt = latestRun ? new Date(latestRun.startedAt) : null;
  const runIsNewer = Boolean(
    runStartedAt && (!lastSuccessfulSync || runStartedAt.getTime() > lastSuccessfulSync.getTime()),
  );

  if (
    latestRun?.status === "running" &&
    runStartedAt &&
    now.getTime() - runStartedAt.getTime() <= SYNC_LOCK_TIMEOUT_MS
  ) {
    return { status: "syncing", error: null, startedAt: runStartedAt.toISOString() };
  }

  if (latestRun?.status === "failed" && runIsNewer) {
    return {
      status: "failed",
      error: latestRun.errorMessage || "סנכרון Flashy האחרון נכשל.",
      startedAt: runStartedAt?.toISOString() ?? null,
    };
  }

  if (!lastSuccessfulSync) {
    return {
      status: latestRun?.status === "running" ? "failed" : "never",
      error: latestRun?.status === "running" ? "ריצת הסנכרון האחרונה לא הסתיימה." : null,
      startedAt: runStartedAt?.toISOString() ?? null,
    };
  }

  if (now.getTime() - lastSuccessfulSync.getTime() > SYNC_STALE_AFTER_MS) {
    return {
      status: "stale",
      error: latestRun?.status === "running" ? "ריצת הסנכרון האחרונה לא הסתיימה." : null,
      startedAt: runStartedAt?.toISOString() ?? null,
    };
  }

  return { status: "healthy", error: null, startedAt: runStartedAt?.toISOString() ?? null };
}

export function validateSyncCompleteness(input: {
  checks: { label: string; ok: boolean; count?: number; message?: string }[];
  raw: SyncVolume;
  normalized: SyncVolume;
  previous?: SyncVolume | null;
}) {
  const issues = input.checks
    .filter((check) => !check.ok)
    .map((check) => `${check.label}: ${check.message || "לא התקבלה תשובה תקינה"}`);

  const pairs = [
    ["אימייל", input.raw.emails, input.normalized.emails],
    ["SMS", input.raw.sms, input.normalized.sms],
    ["אוטומציות", input.raw.automations, input.normalized.automations],
  ] as const;

  for (const [label, rawCount, normalizedCount] of pairs) {
    if (rawCount !== normalizedCount) {
      issues.push(`${label}: התקבלו ${rawCount} שורות אך נורמלו ${normalizedCount}`);
    }
  }

  const warnings: string[] = [];
  if (input.previous) {
    const volumePairs = [
      ["אימייל", input.raw.emails, input.previous.emails],
      ["SMS", input.raw.sms, input.previous.sms],
      ["אוטומציות", input.raw.automations, input.previous.automations],
    ] as const;

    for (const [label, currentCount, previousCount] of volumePairs) {
      if (previousCount < 5) continue;
      if (currentCount === 0) {
        warnings.push(`${label}: לא התקבלו רשומות, לעומת ${previousCount} בסנכרון הקודם`);
        continue;
      }
      if (previousCount - currentCount >= 5 && currentCount / previousCount < 0.35) {
        warnings.push(`${label}: התקבלו ${currentCount} רשומות, ירידה חריגה לעומת ${previousCount}`);
      }
    }
  }

  return {
    complete: issues.length === 0,
    issues,
    warnings,
    checks: pairs.map(([label, rawCount, normalizedCount]) => ({
      label,
      rawCount,
      normalizedCount,
      ok: rawCount === normalizedCount,
    })),
  };
}
