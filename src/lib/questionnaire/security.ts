import { createHash, createHmac, randomBytes } from "node:crypto";

export const PUBLIC_BODY_LIMIT = 64 * 1024;
export const PUBLIC_REQUESTS_PER_MINUTE = 120;
export function createQuestionnaireToken() { return randomBytes(32).toString("base64url"); }
export function questionnaireTokenHash(token: unknown) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export function publicRateBucket(ip: string, secret: string, time = Date.now()) {
  return createHmac("sha256", secret).update(`questionnaire:${Math.floor(time / 60000)}:${ip}`).digest("hex");
}
export function isLiveQuestionnaireLink(row: { status: string; revokedAt: unknown; linkExpiresAt: Date | string | null }, now = Date.now()) {
  return ["sent", "in_progress", "submitted", "reviewed"].includes(row.status) && !row.revokedAt && Boolean(row.linkExpiresAt && new Date(row.linkExpiresAt).getTime() > now);
}
export function validPublicRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
export async function readQuestionnaireBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new Error("invalid_body");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > PUBLIC_BODY_LIMIT)) throw new Error("oversized_body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PUBLIC_BODY_LIMIT) { await reader.cancel(); throw new Error("oversized_body"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_body");
  return payload as Record<string, unknown>;
}
