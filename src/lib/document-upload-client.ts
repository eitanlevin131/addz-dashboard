"use client";

import { upload } from "@vercel/blob/client";
import {
  DOCUMENT_DIRECT_UPLOAD_MAX_BYTES,
  createDocumentUploadPath,
  documentUploadContentType,
  documentUploadSizeError,
  type ParsedClientDocument,
  readDocumentUploadResponse,
} from "@/lib/document-upload";

type UploadProgressHandler = (percentage: number) => void;

async function parseDirectUpload(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/ai/documents/parse", {
    method: "POST",
    body: formData,
  });
  return readDocumentUploadResponse(response);
}

async function cleanupBlob(pathname: string) {
  await fetch("/api/ai/documents/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function uploadClientDocument(
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<ParsedClientDocument> {
  const sizeError = documentUploadSizeError(file);
  if (sizeError) throw new Error(sizeError);

  let pathname: string | null = null;
  try {
    const blob = await upload(createDocumentUploadPath(file.name), file, {
      access: "private",
      handleUploadUrl: "/api/ai/documents/upload",
      contentType: documentUploadContentType(file),
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
    pathname = blob.pathname;

    const response = await fetch("/api/ai/documents/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: blob.pathname, name: file.name }),
    });
    return await readDocumentUploadResponse(response);
  } catch (error) {
    if (pathname) {
      await cleanupBlob(pathname);
      throw error;
    }

    if (file.size <= DOCUMENT_DIRECT_UPLOAD_MAX_BYTES) {
      return parseDirectUpload(file);
    }

    throw new Error(
      error instanceof Error && /unauthorized|forbidden|401|403/i.test(error.message)
        ? "צריך להתחבר מחדש לפני העלאת המסמך."
        : "העלאת המסמך נכשלה. ודא ש־Vercel Blob מחובר לפרויקט ונסה שוב.",
    );
  }
}
