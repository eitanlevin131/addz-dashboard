import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/access";
import { flashyAccounts } from "@/lib/demo-data";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { validateFlashyAccount } from "@/lib/flashy";
import { flashyAccounts as flashyAccountsTable } from "@/lib/schema";

export async function GET() {
  const safeAccounts = flashyAccounts.map(({ ...account }) => account);
  return NextResponse.json({ success: true, data: safeAccounts });
}

export async function POST(request: Request) {
  if (isDatabaseConfigured()) {
    const adminContext = await requireAdmin();
    if (!adminContext.ok) return adminContext.response;
  }

  const body = await request.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "חסר API key של Flashy" },
      { status: 400 },
    );
  }

  try {
    const flashyAccount = await validateFlashyAccount(apiKey);
    return NextResponse.json(
      {
        success: true,
        mode: "validated-not-persisted",
        message: "החשבון תקין. בייצור ה-API key יישמר מוצפן בצד שרת.",
        data: flashyAccount.data,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "לא ניתן לאמת את החשבון",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, message: "Neon עדיין לא מחובר, אי אפשר לשמור הגדרות קבועות." },
      { status: 409 },
    );
  }

  const adminContext = await requireAdmin();
  if (!adminContext.ok) return adminContext.response;

  const accountId = String(body.accountId ?? "").trim();
  if (!accountId) {
    return NextResponse.json(
      { success: false, message: "חסר מזהה חשבון לעדכון." },
      { status: 400 },
    );
  }

  const values = {
    smsCreditPriceUsd: String(Number(body.smsCreditPriceUsd) || 0),
    monthlySubscriptionCostUsd: String(Number(body.monthlySubscriptionCostUsd) || 0),
    agencyRetainerCostIls: String(Number(body.agencyRetainerCostIls) || 0),
    usdIlsRate: String(Number(body.usdIlsRate) || 3.7),
  };

  const db = getDb();
  const [updatedAccount] = await db
    .update(flashyAccountsTable)
    .set(values)
    .where(eq(flashyAccountsTable.id, accountId))
    .returning();

  if (!updatedAccount) {
    return NextResponse.json(
      { success: false, message: "לא נמצא חשבון Flashy לעדכון." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      accountId: updatedAccount.id,
      smsCreditPriceUsd: Number(updatedAccount.smsCreditPriceUsd),
      monthlySubscriptionCostUsd: Number(updatedAccount.monthlySubscriptionCostUsd),
      agencyRetainerCostIls: Number(updatedAccount.agencyRetainerCostIls),
      usdIlsRate: Number(updatedAccount.usdIlsRate),
    },
  });
}
