import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const LOGIN_CODE_TTL_MINUTES = 10;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const LOGIN_CODE_EMAIL_LIMIT_PER_HOUR = 5;
export const LOGIN_CODE_IP_LIMIT_PER_HOUR = 20;
export const LOGIN_CODE_COOLDOWN_SECONDS = 60;

export function normalizeLoginEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidLoginEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createLoginCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashLoginIdentity(value: string, secret: string) {
  return createHmac("sha256", secret).update(`identity:${value}`).digest("hex");
}

export function hashLoginCode(id: string, email: string, code: string, secret: string) {
  return createHmac("sha256", secret).update(`login-code:${id}:${email}:${code}`).digest("hex");
}

export function loginCodeMatches(expectedHash: string, actualHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !/^[a-f0-9]{64}$/.test(actualHash)) return false;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
