import { and, count, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { loginCodes, users } from "@/lib/schema";
import { isOwnerEmail } from "./owner";
import {
  createLoginCode,
  hashLoginCode,
  hashLoginIdentity,
  isValidLoginEmail,
  LOGIN_CODE_COOLDOWN_SECONDS,
  LOGIN_CODE_EMAIL_LIMIT_PER_HOUR,
  LOGIN_CODE_IP_LIMIT_PER_HOUR,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_MINUTES,
  loginCodeMatches,
  normalizeLoginEmail,
} from "./email-code-core";

const genericMessage = "אם כתובת המייל מורשית, קוד כניסה יישלח אליה בדקות הקרובות.";

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for email login codes.");
  return secret;
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function sendLoginCodeEmail(input: { to: string; code: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM are required.");

  const baseUrl = process.env.RESEND_API_BASE_URL?.trim() || "https://api.resend.com";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "קוד הכניסה שלך ל-addz Growth Desk",
      text: `קוד הכניסה שלך הוא ${input.code}. הקוד תקף ל-${LOGIN_CODE_TTL_MINUTES} דקות וניתן לשימוש פעם אחת בלבד.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111318"><h2 style="margin:0 0 16px">קוד כניסה ל-addz Growth Desk</h2><p>הקוד שלך:</p><div dir="ltr" style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${input.code}</div><p style="color:#667085">הקוד תקף ל-${LOGIN_CODE_TTL_MINUTES} דקות וניתן לשימוש פעם אחת בלבד. אם לא ביקשת את הקוד, אפשר להתעלם מהמייל.</p></div>`,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message || `Resend returned ${response.status}`);
  }
  return payload.id;
}

export async function requestLoginCode(input: { email: string; ip: string }) {
  const email = normalizeLoginEmail(input.email);
  if (!isValidLoginEmail(email)) return { accepted: false as const, message: "כתובת המייל אינה תקינה." };

  const secret = authSecret();
  const emailHash = hashLoginIdentity(email, secret);
  const ipHash = hashLoginIdentity(input.ip || "unknown", secret);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const cooldownStart = new Date(now.getTime() - LOGIN_CODE_COOLDOWN_SECONDS * 1000);
  const staleBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const db = getDb();

  if (isOwnerEmail(email)) {
    await db.insert(users).values({
      id: crypto.randomUUID(),
      email,
      name: "Agency Owner",
      role: "owner",
      status: "active",
      mustChangePassword: false,
    }).onConflictDoNothing();
  }

  await db.delete(loginCodes).where(lt(loginCodes.requestedAt, staleBefore));
  const [[emailRequests], [ipRequests], recent] = await Promise.all([
    db.select({ value: count() }).from(loginCodes).where(and(eq(loginCodes.emailHash, emailHash), gte(loginCodes.requestedAt, hourAgo))),
    db.select({ value: count() }).from(loginCodes).where(and(eq(loginCodes.requestIpHash, ipHash), gte(loginCodes.requestedAt, hourAgo))),
    db.select({ id: loginCodes.id }).from(loginCodes).where(and(eq(loginCodes.emailHash, emailHash), gte(loginCodes.requestedAt, cooldownStart))).limit(1),
  ]);

  if (recent.length || emailRequests.value >= LOGIN_CODE_EMAIL_LIMIT_PER_HOUR || ipRequests.value >= LOGIN_CODE_IP_LIMIT_PER_HOUR) {
    return { accepted: true as const, delivered: false, rateLimited: true, message: genericMessage };
  }

  const user = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)).limit(1).then((rows) => rows[0]);
  const activeUser = user?.status === "active" ? user : null;
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + LOGIN_CODE_TTL_MINUTES * 60 * 1000);
  const code = activeUser ? createLoginCode() : null;

  if (activeUser) {
    await db.update(loginCodes).set({ consumedAt: now, status: "superseded" }).where(and(
      eq(loginCodes.emailHash, emailHash),
      isNull(loginCodes.consumedAt),
    ));
  }

  await db.insert(loginCodes).values({
    id,
    userId: activeUser?.id ?? null,
    emailHash,
    requestIpHash: ipHash,
    codeHash: code ? hashLoginCode(id, email, code, secret) : null,
    status: activeUser ? "pending" : "ignored",
    expiresAt,
  });

  if (!activeUser || !code) {
    return { accepted: true as const, delivered: false, rateLimited: false, message: genericMessage };
  }

  try {
    const providerMessageId = await sendLoginCodeEmail({ to: email, code });
    await db.update(loginCodes).set({ status: "sent", sentAt: new Date(), providerMessageId }).where(eq(loginCodes.id, id));
    await recordAudit({ actorUserId: null, action: "auth.login_code_sent", entityType: "user", entityId: activeUser.id });
    return { accepted: true as const, delivered: true, rateLimited: false, message: genericMessage };
  } catch (error) {
    await db.update(loginCodes).set({ status: "failed", consumedAt: new Date() }).where(eq(loginCodes.id, id));
    console.error("Email login code delivery failed", error instanceof Error ? error.message : "Unknown delivery error");
    return { accepted: true as const, delivered: false, rateLimited: false, message: genericMessage };
  }
}

export async function consumeLoginCode(input: { email: string; code: string }) {
  const email = normalizeLoginEmail(input.email);
  const code = String(input.code ?? "").trim();
  if (!isValidLoginEmail(email) || !/^\d{6}$/.test(code)) return null;

  const secret = authSecret();
  const emailHash = hashLoginIdentity(email, secret);
  const now = new Date();
  const db = getDb();
  const challenge = await db.select().from(loginCodes).where(and(
    eq(loginCodes.emailHash, emailHash),
    eq(loginCodes.status, "sent"),
    isNull(loginCodes.consumedAt),
    gt(loginCodes.expiresAt, now),
    lt(loginCodes.attempts, LOGIN_CODE_MAX_ATTEMPTS),
  )).orderBy(desc(loginCodes.requestedAt)).limit(1).then((rows) => rows[0]);

  if (!challenge?.userId || !challenge.codeHash) return null;
  const actualHash = hashLoginCode(challenge.id, email, code, secret);
  if (!loginCodeMatches(challenge.codeHash, actualHash)) {
    await db.update(loginCodes).set({
      attempts: sql`${loginCodes.attempts} + 1`,
      status: sql`CASE WHEN ${loginCodes.attempts} + 1 >= ${LOGIN_CODE_MAX_ATTEMPTS} THEN 'locked' ELSE ${loginCodes.status} END`,
    }).where(and(eq(loginCodes.id, challenge.id), isNull(loginCodes.consumedAt), lt(loginCodes.attempts, LOGIN_CODE_MAX_ATTEMPTS)));
    return null;
  }

  const [consumed] = await db.update(loginCodes).set({ consumedAt: now, status: "consumed" }).where(and(
    eq(loginCodes.id, challenge.id),
    isNull(loginCodes.consumedAt),
    lt(loginCodes.attempts, LOGIN_CODE_MAX_ATTEMPTS),
  )).returning({ id: loginCodes.id });
  if (!consumed) return null;

  const user = await db.select().from(users).where(and(eq(users.id, challenge.userId), eq(users.status, "active"))).limit(1).then((rows) => rows[0]);
  if (!user) return null;
  await db.update(users).set({
    emailVerified: user.emailVerified ?? now,
    lastLoginAt: now,
    loginAttempts: 0,
    loginWindowStart: null,
    mustChangePassword: false,
  }).where(eq(users.id, user.id));
  await recordAudit({ actorUserId: user.id, action: "auth.login_code_consumed", entityType: "user", entityId: user.id });
  return user;
}
