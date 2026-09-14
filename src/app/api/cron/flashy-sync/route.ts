import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { syncPersistedFlashyAccount } from "@/lib/flashy-sync";
import { flashyAccounts } from "@/lib/schema";

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
    imported?: { emailCampaigns: number; smsCampaigns: number; automations: number };
  }> = [];

  for (const account of accounts) {
    try {
      const result = await syncPersistedFlashyAccount(account.id, { lookbackDays });
      results.push({
        accountId: account.id,
        accountName: account.name,
        success: true,
        skipped: result.skipped,
        message: result.message,
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
  return NextResponse.json(
    {
      success: failed.length === 0,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      lookbackDays,
      accounts: accounts.length,
      failed: failed.length,
      results,
    },
    { status: failed.length ? 500 : 200 },
  );
}
