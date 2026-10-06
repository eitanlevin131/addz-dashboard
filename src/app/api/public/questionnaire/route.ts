import { publicQuestionnaireApi, questionnaireBody } from "@/lib/questionnaire/api";
import { loadPublicQuestionnaire, savePublicQuestionnaire } from "@/lib/questionnaire/repository";
export const runtime = "nodejs";
export async function GET(request: Request) { return publicQuestionnaireApi(request, loadPublicQuestionnaire); }
export async function PATCH(request: Request) { return publicQuestionnaireApi(request, async token => savePublicQuestionnaire(token, await questionnaireBody(request))); }
