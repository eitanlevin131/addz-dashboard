import { clientApi } from "@/lib/client-api";
import { ClientInputError } from "@/lib/client-foundation";
import { questionnaireBody } from "@/lib/questionnaire/api";
import { QuestionnaireError } from "@/lib/questionnaire/core";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
import { KickoffError } from "@/lib/kickoff/core";
import { createKickoff, changeKickoff, kickoffDetails } from "@/lib/kickoff/repository";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function teamApi(work: (actor: string) => Promise<unknown>, status = 200) {
  const response = await clientApi(async actor => {
    try { return await work(actor); }
    catch (error) { if (error instanceof KickoffError || error instanceof QuestionnaireError) throw new ClientInputError(error.message, error.status); throw error; }
  }, status);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Vary", "Cookie, Authorization");
  return response;
}
export async function GET(_request: Request, context: Context) {
  return teamApi(async () => kickoffDetails((await context.params).id));
}
export async function POST(request: Request, context: Context) {
  return teamApi(async actor => { sameOriginMutation(request); return createKickoff((await context.params).id, actor); }, 201);
}
export async function PATCH(request: Request, context: Context) {
  return teamApi(async actor => { sameOriginMutation(request); return changeKickoff((await context.params).id, await questionnaireBody(request), actor); });
}
