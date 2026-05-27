import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import {
  automationReports,
  emailReports,
  flashyAccounts,
  smsReports,
} from "@/lib/demo-data";
import { getFlashyReports, monthWindows, validateFlashyAccount } from "@/lib/flashy";
import { isDatabaseConfigured } from "@/lib/db";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const account = flashyAccounts.find((item) => item.id === accountId);

  if (apiKey && isDatabaseConfigured()) {
    const adminContext = await requireAdmin();
    if (!adminContext.ok) return adminContext.response;
  }

  if (!account) {
    return NextResponse.json(
      { success: false, message: "חשבון Flashy לא נמצא" },
      { status: 404 },
    );
  }

  if (apiKey) {
    try {
      const accountResponse = await validateFlashyAccount(apiKey);
      const to = Math.floor(Date.now() / 1000);
      const from = to - 60 * 60 * 24 * 30;
      const reports = await getFlashyReports(apiKey, from, to);
      const failedChecks = reports.checks.filter((check) => !check.ok);
      const imported = {
        emailCampaigns: reports.emails.length,
        smsCampaigns: reports.sms.length,
        automations: reports.automations.length,
      };

      return NextResponse.json({
        success: true,
        mode: "live-dry-run",
        hasWarnings: failedChecks.length > 0,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        account: accountResponse.data,
        imported,
        checks: [
          {
            label: "חשבון",
            path: "/account",
            ok: true,
            count: 1,
          },
          ...reports.checks,
        ],
        samples: {
          email: reports.emails[0] ?? null,
          sms: reports.sms[0] ?? null,
          automation: reports.automations[0] ?? null,
        },
        reports: {
          emails: reports.emails,
          sms: reports.sms,
          automations: reports.automations,
        },
        summary: failedChecks.length
          ? `החיבור תקין חלקית: ${failedChecks.length} בדיקות דורשות טיפול.`
          : `החיבור תקין: יובאו ${imported.emailCampaigns + imported.smsCampaigns + imported.automations} רשומות.`,
        syncPlan: buildSyncPlan(),
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Flashy API validation failed",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    mode: "demo",
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    account,
    syncPlan: buildSyncPlan(),
    imported: {
      emailCampaigns: emailReports.filter((item) => item.accountId === account.id).length,
      smsCampaigns: smsReports.filter((item) => item.accountId === account.id).length,
      automations: automationReports.filter((item) => item.accountId === account.id).length,
    },
  });
}

function buildSyncPlan() {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);

  return {
    endpoints: ["/account", "/reports/emails", "/reports/sms", "/reports/automations"],
    automationWindows: monthWindows(from, to),
    strategy: "upsert by account + remote id + date",
  };
}
