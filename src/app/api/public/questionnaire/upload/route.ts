import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { publicQuestionnaireApi, questionnaireBody } from "@/lib/questionnaire/api";
import { attachmentStoreToken, writableAttachmentQuestionnaire } from "@/lib/questionnaire/attachment-server";
import { attachmentBelongsTo } from "@/lib/questionnaire/attachment-security";
import { QUESTIONNAIRE_FILE_LIMIT, QUESTIONNAIRE_FILE_TYPES } from "@/lib/questionnaire/attachments";
import { QuestionnaireError } from "@/lib/questionnaire/core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: HandleUploadBody;
  try { body = await questionnaireBody(request) as unknown as HandleUploadBody; }
  catch { return NextResponse.json({ message: "בקשת ההעלאה אינה תקינה." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const completed = body.type === "blob.upload-completed";
  const handle = async (token: string | null) => {
    const row = completed ? null : await writableAttachmentQuestionnaire(token);
    try {
      return await handleUpload({ request, body, token: attachmentStoreToken(),
        onBeforeGenerateToken: async pathname => {
          if (!row || !attachmentBelongsTo(pathname, row.id, process.env.AUTH_SECRET!)) throw new QuestionnaireError("נתיב הקובץ אינו מורשה.", 403);
          return { tokenPayload: "", allowedContentTypes: Object.values(QUESTIONNAIRE_FILE_TYPES), maximumSizeInBytes: QUESTIONNAIRE_FILE_LIMIT,
            addRandomSuffix: true, allowOverwrite: false, validUntil: Math.min(Date.now() + 10 * 60000, row.linkExpiresAt!.getTime()) };
        },
        onUploadCompleted: async () => undefined,
      });
    } catch (error) {
      if (error instanceof QuestionnaireError) throw error;
      throw new QuestionnaireError("לא ניתן להתחיל את ההעלאה לאחסון הפרטי.", 503);
    }
  };
  // The SDK validates the provider signature for callbacks; no public bearer is persisted.
  if (completed) {
    try { return NextResponse.json(await handle(null), { headers: { "Cache-Control": "no-store" } }); }
    catch { return NextResponse.json({ message: "בקשת ההעלאה אינה תקינה." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
  }
  return publicQuestionnaireApi(request, async token => new Response(JSON.stringify(await handle(token)), { headers: { "content-type": "application/json" } }));
}
