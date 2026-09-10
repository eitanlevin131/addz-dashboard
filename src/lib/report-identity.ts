type StoredReport = { id: string; flashyAccountId: string | null; raw: unknown };

function rawRecord(row: StoredReport): Record<string, unknown> {
  return row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
}

// A snapshot replaces an earlier observation; revenue may legitimately decrease.
function latest<T extends StoredReport>(rows: T[], identity: (row: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = identity(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];
    const ranked = [...group].sort((a, b) => Number(rawRecord(b)._syncStartedAt ?? 0) - Number(rawRecord(a)._syncStartedAt ?? 0));
    if (Number(rawRecord(ranked[0])._syncStartedAt ?? 0) > 0) return ranked[0];
    throw new Error("נמצאו גרסאות דוח ישנות ללא חותמת סנכרון. נדרש רענון החשבון לפני הצגת הסכומים.");
  });
}

export function latestCampaignReports<T extends StoredReport & { campaignId: number; sentAt: Date }>(rows: T[]): T[] {
  return latest(rows, row => {
    const raw = rawRecord(row);
    const nativeDate = typeof raw.sent_date === "string" && typeof raw.sent_time === "string"
      ? `${raw.sent_date}T${raw.sent_time}` : row.sentAt.toISOString();
    return JSON.stringify([row.flashyAccountId, row.campaignId, nativeDate]);
  });
}

export function latestAutomationReports<T extends StoredReport & { automationId: number; reportDate: string }>(rows: T[]): T[] {
  // Flashy returns a daily aggregate; the inferred channel can change during that day.
  return latest(rows, row => JSON.stringify([row.flashyAccountId, row.automationId, row.reportDate]));
}
