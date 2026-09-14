import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/access";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { validateFlashyAccount } from "@/lib/flashy";
import { PersistedSyncError, syncPersistedFlashyAccount } from "@/lib/flashy-sync";
import { aiAccountMemory, clientUsers, clients, flashyAccounts, users } from "@/lib/schema";

type ClientDocument = { name: string; content: string; createdAt: string };
type AiOnboarding = {
  summary?: string;
  profile?: {
    brandVoice?: string;
    audiences?: string[];
    products?: string[];
    positioning?: string;
    constraints?: string[];
    contentAngles?: string[];
    commercialMoments?: string[];
    missingInfo?: string[];
  };
  questions?: string[];
};

function numeric(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : fallback;
}

function cleanDocuments(value: unknown): ClientDocument[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((document) => ({
    name: String(document?.name ?? "מסמך לקוח").slice(0, 180),
    content: String(document?.content ?? "").slice(0, 40_000),
    createdAt: String(document?.createdAt ?? new Date().toISOString()),
  })).filter((document) => document.content.trim().length >= 20);
}

function memoryFromOnboarding(documents: ClientDocument[], onboarding: AiOnboarding | undefined) {
  const profile = onboarding?.profile;
  const learnings = [
    onboarding?.summary,
    profile?.positioning && `מיצוב: ${profile.positioning}`,
    profile?.contentAngles?.length && `זוויות תוכן: ${profile.contentAngles.join(", ")}`,
    profile?.commercialMoments?.length && `רגעים מסחריים: ${profile.commercialMoments.join(", ")}`,
    profile?.missingInfo?.length && `מידע חסר: ${profile.missingInfo.join(", ")}`,
    onboarding?.questions?.length && `שאלות להשלמה: ${onboarding.questions.join(" | ")}`,
  ].filter(Boolean).join("\n");
  return {
    brandVoice: profile?.brandVoice ?? "",
    audiences: profile?.audiences?.join("\n") ?? "",
    products: profile?.products?.join("\n") ?? "",
    constraints: profile?.constraints?.join("\n") ?? "",
    learnings,
    documents,
    updatedAt: new Date(),
  };
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, code: "DATABASE_NOT_CONFIGURED", message: "Neon עדיין לא מחובר." }, { status: 409 });
  }
  const context = await requireOwner();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({}));
  const apiKey = String(body.apiKey ?? "").trim();
  const clientName = String(body.clientName ?? "").trim();
  const industry = String(body.industry ?? "").trim();
  const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
  const clientUserName = String(body.clientUserName ?? clientName).trim();
  const temporaryPassword = String(body.temporaryPassword ?? "");
  const visibleModules = Array.isArray(body.visibleModules)
    ? body.visibleModules.filter((module: unknown) => ["reports", "planner", "ai"].includes(String(module)))
    : ["reports", "planner", "ai"];
  const documents = cleanDocuments(body.documents);
  const onboarding = body.onboarding as AiOnboarding | undefined;

  if (!apiKey || !clientName) return NextResponse.json({ success: false, message: "חסרים שם לקוח או API key." }, { status: 400 });
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return NextResponse.json({ success: false, message: "אימייל משתמש הלקוח אינו תקין." }, { status: 400 });
  }
  if (clientEmail) {
    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
  }

  let flashyAccount;
  try {
    flashyAccount = (await validateFlashyAccount(apiKey)).data;
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "אימות Flashy נכשל." }, { status: 400 });
  }

  const db = getDb();
  const [duplicateAccount] = await db.select({ id: flashyAccounts.id, clientId: flashyAccounts.clientId })
    .from(flashyAccounts).where(eq(flashyAccounts.flashyAccountId, flashyAccount.id)).limit(1);
  if (duplicateAccount) {
    return NextResponse.json({ success: false, code: "FLASHY_ACCOUNT_EXISTS", message: "חשבון Flashy הזה כבר מחובר למערכת.", data: duplicateAccount }, { status: 409 });
  }
  if (clientEmail) {
    const [duplicateUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, clientEmail));
    if (duplicateUser) return NextResponse.json({ success: false, code: "USER_EXISTS", message: "כבר קיים משתמש עם האימייל הזה. אפשר לשייך אותו ללקוח אחרי ההקמה." }, { status: 409 });
  }

  const clientId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const userId = clientEmail ? crypto.randomUUID() : null;
  const insertClient = db.insert(clients).values({ id: clientId, name: clientName, owner: clientEmail || null, industry: industry || "לקוח Flashy", visibleModules, onboardingStatus: "syncing" });
  const insertAccount = db.insert(flashyAccounts).values({
      id: accountId,
      clientId,
      flashyAccountId: flashyAccount.id,
      name: flashyAccount.name || flashyAccount.account || clientName,
      website: flashyAccount.website || null,
      currency: flashyAccount.currency || "ILS",
      timezone: flashyAccount.timezone || "Asia/Jerusalem",
      encryptedApiKey: encryptSecret(apiKey),
      usdIlsRate: String(numeric(body.usdIlsRate, 3.7)),
      smsCreditPriceUsd: String(numeric(body.smsCreditPriceUsd)),
      monthlySubscriptionCostUsd: String(numeric(body.monthlySubscriptionCostUsd)),
      agencyRetainerCostIls: String(numeric(body.agencyRetainerCostIls)),
      active: true,
    });
  const insertMemory = db.insert(aiAccountMemory).values({ clientId, ...memoryFromOnboarding(documents, onboarding) });

  try {
    if (clientEmail && userId) {
      const passwordHash = await hashPassword(temporaryPassword);
      await db.batch([
        insertClient,
        insertAccount,
        insertMemory,
        db.insert(users).values({ id: userId, email: clientEmail, name: clientUserName || clientName, passwordHash, role: "client", status: "active", mustChangePassword: true }),
        db.insert(clientUsers).values({ clientId, userId }),
      ]);
    } else {
      await db.batch([insertClient, insertAccount, insertMemory]);
    }
  } catch {
    return NextResponse.json({ success: false, message: "שמירת הלקוח נכשלה. לא נוצרו רשומות חלקיות." }, { status: 409 });
  }
  await recordAudit({ actorUserId: context.access.userId, action: "client.created", entityType: "client", entityId: clientId, metadata: { flashyAccountId: flashyAccount.id, documents: documents.length, userCreated: Boolean(userId) } });

  try {
    const sync = await syncPersistedFlashyAccount(accountId, { lookbackDays: 365 });
    await db.update(clients).set({ onboardingStatus: "ready" }).where(eq(clients.id, clientId));
    return NextResponse.json({ success: true, data: { clientId, accountId, userId, sync } }, { status: 201 });
  } catch (error) {
    await db.update(clients).set({ onboardingStatus: "needs_attention" }).where(eq(clients.id, clientId));
    const message = error instanceof PersistedSyncError ? error.message : "הסנכרון הראשוני נכשל.";
    return NextResponse.json({ success: true, warning: true, message: `${message} הלקוח נשמר ואפשר לנסות לסנכרן שוב.`, data: { clientId, accountId, userId } }, { status: 201 });
  }
}
