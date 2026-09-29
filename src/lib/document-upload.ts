export const DOCUMENT_UPLOAD_MAX_BYTES = 20_000_000;
export const DOCUMENT_UPLOAD_MAX_LABEL = "20MB";
export const DOCUMENT_DIRECT_UPLOAD_MAX_BYTES = 4_000_000;
export const DOCUMENT_UPLOAD_PREFIX = "ai-documents/";

export const DOCUMENT_UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;

export type ParsedClientDocument = {
  name: string;
  content: string;
  createdAt: string;
};

type DocumentUploadPayload = {
  success?: boolean;
  message?: string;
  data?: ParsedClientDocument;
};

export function documentUploadSizeError(file: Pick<File, "size">) {
  return file.size > DOCUMENT_UPLOAD_MAX_BYTES
    ? `המסמך גדול מדי. אפשר להעלות קובץ עד ${DOCUMENT_UPLOAD_MAX_LABEL}.`
    : null;
}

export function documentUploadContentType(file: Pick<File, "name" | "type">) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "json") return "application/json";
  if (extension === "csv") return "text/csv";
  if (extension === "md") return "text/markdown";
  return file.type || "text/plain";
}

export function safeDocumentFileName(value: string) {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-");
  return cleaned.slice(-140) || "document.txt";
}

export function createDocumentUploadPath(fileName: string) {
  return `${DOCUMENT_UPLOAD_PREFIX}${crypto.randomUUID()}-${safeDocumentFileName(fileName)}`;
}

export function isDocumentUploadPath(pathname: string) {
  return pathname.startsWith(DOCUMENT_UPLOAD_PREFIX)
    && pathname.length <= 320
    && !pathname.includes("..")
    && !pathname.includes("\\");
}

export async function readDocumentUploadResponse(response: Response) {
  const raw = await response.text();
  let payload: DocumentUploadPayload | null = null;

  try {
    payload = JSON.parse(raw) as DocumentUploadPayload;
  } catch {
    if (
      response.status === 413
      || /request entity too large|payload too large|function_payload_too_large/i.test(raw)
    ) {
      throw new Error(`המסמך גדול מדי. אפשר להעלות קובץ עד ${DOCUMENT_UPLOAD_MAX_LABEL}.`);
    }
    throw new Error(
      response.ok
        ? "השרת החזיר תשובה לא תקינה בזמן קריאת המסמך."
        : `קריאת המסמך נכשלה (שגיאת שרת ${response.status}).`,
    );
  }

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.message || "קריאת המסמך נכשלה.");
  }

  return payload.data;
}
