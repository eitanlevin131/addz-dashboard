export const DOCUMENT_UPLOAD_MAX_BYTES = 4_000_000;
export const DOCUMENT_UPLOAD_MAX_LABEL = "4MB";

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
