import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { syncPersistedFlashyAccount } from "@/lib/flashy-sync";
import { flashyAccounts } from "@/lib/schema";
import { sendSyncAlertEmail, type SyncAlertAccount } from "@/lib/sync-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function configuredLookbackDays() {
  const value = Number(process.env.FLASHY_SYNC_LOOKBACK_DAYS || 120);
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 120;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, message: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const lookbackDays = configuredLookbackDays();
  const accounts = await getDb()
    .select({ id: flashyAccounts.id, name: flashyAccounts.name })
    .from(flashyAccounts)
    .where(eq(flashyAccounts.active, true));
  const results: Array<{
    accountId: string;
    accountName: string;
    success: boolean;
    skipped?: boolean;
    message: string;
    warnings?: string[];
    imported?: { emailCampaigns: number; smsCampaigns: number; automations: number };
  }> = [];

  for (const account of accounts) {
    try {
      const result = await syncPersistedFlashyAccount(account.id, { lookbackDays, source: "cron" });
      results.push({
        accountId: account.id,
        accountName: account.name,
        success: true,
        skipped: result.skipped,
        message: result.message,
        warnings: result.completeness?.warnings ?? [],
        imported: result.imported,
      });
    } catch (error) {
      results.push({
        accountId: account.id,
        accountName: account.name,
        success: false,
        message: error instanceof Error ? error.message : "Flashy sync failed.",
      });
    }
  }

  const failed = results.filter((result) => !result.success);
  const alertAccounts: SyncAlertAccount[] = [];
  for (const result of results) {
    if (!result.success) {
      alertAccounts.push({ accountName: result.accountName, status: "failed", message: result.message, warnings: [] });
      continue;
    }
    if (result.warnings?.length) {
      alertAccounts.push({ accountName: result.accountName, status: "warning", message: result.message, warnings: result.warnings });
    }
  }
  const origin = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
  const alert = await sendSyncAlertEmail(alertAccounts, origin);
  return NextResponse.json(
    {
      success: failed.length === 0,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      lookbackDays,
      accounts: accounts.length,
      failed: failed.length,
      warnings: alertAccounts.filter((account) => account.status === "warning").length,
      alert,
      results,
    },
    { status: failed.length ? 500 : 200 },
  );
}
