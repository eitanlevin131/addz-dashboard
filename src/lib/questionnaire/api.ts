import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientApi } from "@/lib/client-api";
import { ClientInputError } from "@/lib/client-foundation";
import { QuestionnaireError } from "./core";
import { PUBLIC_REQUESTS_PER_MINUTE, publicRateBucket, readQuestionnaireBody, validPublicRequestOrigin } from "./security";

const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Vary": "Authorization, Cookie" };
export async function questionnaireBody(request: Request) {
  try { return await readQuestionnaireBody(request); }
  catch (error) { throw new QuestionnaireError(error instanceof Error && error.message === "oversized_body" ? "הבקשה גדולה מדי." : "פרטי הבקשה אינם תקינים.", error instanceof Error && error.message === "oversized_body" ? 413 : 400); }
}
export async function teamQuestionnaireApi(work: (actorId: string) => Promise<unknown>, status = 200) {
  const response = await clientApi(async actor => {
    try { return await work(actor); }
    catch (error) { if (error instanceof QuestionnaireError) throw new ClientInputError(error.message, error.status); throw error; }
  }, status);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}
export async function publicQuestionnaireApi(request: Request, work: (token: string | null) => Promise<unknown>) {
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers });
  if (!validPublicRequestOrigin(request)) return respond({ success: false, message: "מקור הבקשה אינו מורשה." }, 403);
  if (!isDatabaseConfigured() || !process.env.AUTH_SECRET) return respond({ success: false, message: "השאלון אינו זמין כרגע." }, 503);
  try {
    // Durable per-minute buckets cover invalid tokens as well as valid links.
    // Trust forwarded client IP only behind Vercel; local requests share one bucket.
    const ip = process.env.VERCEL ? (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 128) : "local";
    const bucket = publicRateBucket(ip, process.env.AUTH_SECRET);
    const result = await getDb().batch([
      getDb().execute(sql`delete from questionnaire_rate_limits where expires_at < now()`),
      getDb().execute(sql`insert into questionnaire_rate_limits(bucket,requests,expires_at) values(${bucket},1,now()+interval '2 minutes') on conflict(bucket) do update set requests=questionnaire_rate_limits.requests+1 returning requests`),
    ]);
    if (Number(result[1].rows[0].requests) > PUBLIC_REQUESTS_PER_MINUTE) {
      const response = respond({ success: false, message: "יותר מדי בקשות. נסו שוב בעוד דקה." }, 429);
      response.headers.set("Retry-After", "60"); return response;
    }
    const auth = request.headers.get("authorization") || "";
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth)?.[1] || null;
    return respond({ success: true, data: await work(token) });
  } catch (error) {
    if (error instanceof QuestionnaireError) return respond({ success: false, message: error.message }, error.status);
    // Never log token, answer text, DB errors or request headers.
    return respond({ success: false, message: "לא ניתן להשלים את הפעולה כרגע. נסו שוב." }, 503);
  }
}
