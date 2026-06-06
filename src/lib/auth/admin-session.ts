import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "fgd_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function getSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function signPayload(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAdminSessionCookieName() {
  return COOKIE_NAME;
}

export function getAdminSessionMaxAge() {
  return MAX_AGE_SECONDS;
}

export function createAdminSessionToken(email: string) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), expiresAt })).toString(
    "base64url",
  );
  return `${payload}.${signPayload(payload)}`;
}

export function readAdminSessionToken(token?: string) {
  if (!token || !getSecret()) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      expiresAt?: number;
    };
    if (!data.email || !data.expiresAt || data.expiresAt < Date.now()) return null;
    return { email: data.email.toLowerCase() };
  } catch {
    return null;
  }
}
