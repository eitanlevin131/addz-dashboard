import { get, head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clientQuestionnaires } from "@/lib/schema";
import { requireClient } from "@/lib/clients";
import { publicQuestionnaire } from "./repository";
import { QuestionnaireError } from "./core";
import { attachmentContentType, attachmentFileError, QUESTIONNAIRE_FILE_COUNT, type QuestionnaireAttachment } from "./attachments";
import { attachmentBelongsTo, attachmentPrefix, attachmentReceipt } from "./attachment-security";

export function attachmentStoreToken() {
  // Dedicated private store only; never fall back to the agency's other Blob stores.
  const token = process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN;
  if (!token) throw new QuestionnaireError("העלאת קבצים עדיין לא זמינה. אפשר לצרף קישור לתיקיית החומרים.", 503);
  return token;
}
export async function writableAttachmentQuestionnaire(token: unknown) {
  const row = await publicQuestionnaire(token);
  if (!["sent", "in_progress"].includes(row.status)) throw new QuestionnaireError("השאלון כבר נשלח ואינו פתוח להעלאת קבצים.", 409);
  if (!row.selectedIds.includes("assets") || !row.snapshot.items.some(q => q.id === "assets" && q.links)) throw new QuestionnaireError("לא ניתן לצרף קבצים לשאלון הזה.", 403);
  return row;
}
export async function prepareAttachment(token: unknown, body: Record<string, unknown>) {
  const row = await writableAttachmentQuestionnaire(token);
  attachmentStoreToken();
  if (Object.keys(body).some(key => !["name", "size"].includes(key)) || typeof body.name !== "string" || typeof body.size !== "number") throw new QuestionnaireError("פרטי הקובץ אינם תקינים.");
  const error = attachmentFileError({ name: body.name, size: body.size });
  if (error) throw new QuestionnaireError(error);
  if ((row.answers.assets?.attachments?.length || 0) >= QUESTIONNAIRE_FILE_COUNT) throw new QuestionnaireError("אפשר לצרף עד חמישה קבצים.");
  const extension = body.name.split(".").pop()!.toLowerCase();
  return { pathname: `${attachmentPrefix(row.id, process.env.AUTH_SECRET!)}${crypto.randomUUID()}.${extension}`, contentType: attachmentContentType(body.name) };
}
export async function verifyUploadedAttachment(token: unknown, body: Record<string, unknown>) {
  const row = await writableAttachmentQuestionnaire(token);
  const storeToken = attachmentStoreToken();
  if (Object.keys(body).some(key => !["pathname", "name", "size"].includes(key)) || typeof body.pathname !== "string" || typeof body.name !== "string" || typeof body.size !== "number"
    || !attachmentBelongsTo(body.pathname, row.id, process.env.AUTH_SECRET!)) throw new QuestionnaireError("הקובץ אינו שייך לשאלון.");
  const error = attachmentFileError({ name: body.name, size: body.size });
  if (error) throw new QuestionnaireError(error);
  if (attachmentContentType(body.pathname) !== attachmentContentType(body.name)) throw new QuestionnaireError("סוג הקובץ אינו תואם.");
  try {
    const blob = await head(body.pathname, { token: storeToken, abortSignal: AbortSignal.timeout(10000) });
    if (blob.pathname !== body.pathname || blob.size !== body.size || blob.contentType !== attachmentContentType(body.name)
      || !new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error("invalid_blob");
    const attachment = { pathname: body.pathname, name: body.name, size: blob.size, contentType: blob.contentType };
    return { ...attachment, receipt: attachmentReceipt(attachment, row.id, process.env.AUTH_SECRET!) };
  } catch { throw new QuestionnaireError("לא ניתן לאמת את הקובץ באחסון הפרטי. נסו שוב.", 503); }
}
export async function attachmentDownload(attachment: QuestionnaireAttachment) {
  try {
    const result = await get(attachment.pathname, { access: "private", token: attachmentStoreToken(), useCache: false, abortSignal: AbortSignal.timeout(10000) });
    if (!result || result.statusCode !== 200 || result.blob.size !== attachment.size) throw new Error("missing_attachment");
    return new Response(result.stream, { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Content-Length": String(attachment.size), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer",
    } });
  } catch { throw new QuestionnaireError("הקובץ אינו זמין כרגע.", 503); }
}
export async function publicAttachment(token: unknown, pathname: string) {
  const row = await publicQuestionnaire(token);
  const attachment = row.answers.assets?.attachments?.find(file => file.pathname === pathname);
  if (!attachment || !attachmentBelongsTo(pathname, row.id, process.env.AUTH_SECRET!)) throw new QuestionnaireError("הקובץ אינו זמין.", 404);
  return attachmentDownload(attachment);
}
export async function teamAttachment(clientId: string, pathname: string) {
  await requireClient(clientId);
  const [row] = await getDb().select().from(clientQuestionnaires).where(eq(clientQuestionnaires.clientId, clientId));
  const attachment = row?.answers.assets?.attachments?.find(file => file.pathname === pathname);
  if (!attachment || !attachmentBelongsTo(pathname, row.id, process.env.AUTH_SECRET!)) throw new QuestionnaireError("הקובץ אינו זמין.", 404);
  return attachmentDownload(attachment);
}
