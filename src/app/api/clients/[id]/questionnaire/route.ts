import { teamQuestionnaireApi, questionnaireBody } from "@/lib/questionnaire/api";
import { createQuestionnaire, questionnaireDetails, changeQuestionnaire } from "@/lib/questionnaire/repository";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return teamQuestionnaireApi(async () => questionnaireDetails((await context.params).id));
}
export async function POST(request: Request, context: Context) {
  return teamQuestionnaireApi(async actor => { sameOriginMutation(request); return createQuestionnaire((await context.params).id, actor); }, 201);
}
export async function PATCH(request: Request, context: Context) {
  return teamQuestionnaireApi(async actor => { sameOriginMutation(request); return changeQuestionnaire((await context.params).id, await questionnaireBody(request), actor); });
}
