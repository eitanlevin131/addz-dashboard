import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { teamAttachment } from "@/lib/questionnaire/attachment-server";
import { QuestionnaireError } from "@/lib/questionnaire/core";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try { return await teamAttachment((await context.params).id, new URL(request.url).searchParams.get("pathname") || ""); }
  catch (error) { return NextResponse.json({ success: false, message: error instanceof QuestionnaireError ? error.message : "הקובץ אינו זמין." },
    { status: error instanceof QuestionnaireError ? error.status : 503, headers: { "Cache-Control": "no-store, private" } }); }
}
