import { publicQuestionnaireApi, questionnaireBody } from "@/lib/questionnaire/api";
import { prepareAttachment, publicAttachment, verifyUploadedAttachment } from "@/lib/questionnaire/attachment-server";
export const runtime = "nodejs";
export async function POST(request: Request) { return publicQuestionnaireApi(request, async token => prepareAttachment(token, await questionnaireBody(request))); }
export async function PATCH(request: Request) { return publicQuestionnaireApi(request, async token => verifyUploadedAttachment(token, await questionnaireBody(request))); }
export async function GET(request: Request) { return publicQuestionnaireApi(request, token => publicAttachment(token, new URL(request.url).searchParams.get("pathname") || "")); }
