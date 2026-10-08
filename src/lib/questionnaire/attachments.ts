export const QUESTIONNAIRE_FILE_LIMIT = 20 * 1024 * 1024;
export const QUESTIONNAIRE_FILE_COUNT = 5;
export const QUESTIONNAIRE_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", zip: "application/zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};
export type QuestionnaireAttachment = { pathname: string; name: string; size: number; contentType: string; receipt: string };
export function attachmentContentType(name: string) {
  return QUESTIONNAIRE_FILE_TYPES[name.split(".").pop()?.toLowerCase() || ""] || null;
}
export function attachmentFileError(file: { name: string; size: number }) {
  if (!file.name.trim() || file.name.length > 180 || /[\u0000-\u001f\u007f]/.test(file.name) || !attachmentContentType(file.name)) return "אפשר לצרף PDF, תמונות PNG/JPG/WebP, מסמך Word, TXT או ZIP.";
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > QUESTIONNAIRE_FILE_LIMIT) return "גודל הקובץ צריך להיות עד 20MB.";
  return null;
}
export function attachmentPathIsSafe(pathname: string) {
  return /^questionnaire-assets\/[a-f0-9]{64}\/[a-zA-Z0-9_-]{1,100}\.(pdf|png|jpg|jpeg|webp|zip|docx|txt)$/.test(pathname);
}
export function parseAttachmentMetadata(input: unknown): QuestionnaireAttachment[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > QUESTIONNAIRE_FILE_COUNT) throw new Error("אפשר לצרף עד חמישה קבצים.");
  const paths = new Set<string>();
  return input.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["pathname", "name", "size", "contentType", "receipt"].includes(key))) throw new Error("פרטי הקובץ אינם תקינים.");
    const row = value as QuestionnaireAttachment;
    if (typeof row.pathname !== "string" || !attachmentPathIsSafe(row.pathname) || paths.has(row.pathname)
      || typeof row.name !== "string" || attachmentFileError(row) || row.contentType !== attachmentContentType(row.name)
      || typeof row.receipt !== "string" || !/^[a-f0-9]{64}$/.test(row.receipt)) throw new Error("פרטי הקובץ אינם תקינים.");
    paths.add(row.pathname);
    return { pathname: row.pathname, name: row.name, size: row.size, contentType: row.contentType, receipt: row.receipt };
  });
}
