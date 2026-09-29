import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/access";
import { documentBlobToken } from "@/lib/document-blob-server";
import {
  DOCUMENT_UPLOAD_CONTENT_TYPES,
  DOCUMENT_UPLOAD_MAX_BYTES,
  isDocumentUploadPath,
} from "@/lib/document-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ success: false, message: "בקשת ההעלאה אינה תקינה." }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      token: documentBlobToken(),
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const context = await requireAdmin();
        if (!context.ok) throw new Error("Unauthorized document upload");
        if (!isDocumentUploadPath(pathname)) throw new Error("Invalid document pathname");

        return {
          allowedContentTypes: [...DOCUMENT_UPLOAD_CONTENT_TYPES],
          maximumSizeInBytes: DOCUMENT_UPLOAD_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unauthorized/i.test(message)) {
      return NextResponse.json({ success: false, message: "צריך להתחבר מחדש." }, { status: 401 });
    }
    return NextResponse.json(
      {
        success: false,
        message: /token|store|blob|environment/i.test(message)
          ? "אחסון המסמכים עדיין לא מחובר לפרויקט."
          : "לא ניתן להתחיל את העלאת המסמך.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const context = await requireAdmin();
  if (!context.ok) return context.response;
  const payload = await request.json().catch(() => null) as { pathname?: unknown } | null;
  const pathname = typeof payload?.pathname === "string" ? payload.pathname : "";
  if (!isDocumentUploadPath(pathname)) {
    return NextResponse.json({ success: false, message: "נתיב המסמך אינו תקין." }, { status: 400 });
  }
  await del(pathname, { token: documentBlobToken() }).catch(() => undefined);
  return NextResponse.json({ success: true });
}
