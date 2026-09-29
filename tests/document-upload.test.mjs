import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  createDocumentUploadPath,
  documentUploadContentType,
  documentUploadSizeError,
  isDocumentUploadPath,
  readDocumentUploadResponse,
} from "../src/lib/document-upload.ts";

test("documents above the Vercel-safe limit are rejected before upload", () => {
  assert.equal(documentUploadSizeError({ size: DOCUMENT_UPLOAD_MAX_BYTES }), null);
  assert.match(
    documentUploadSizeError({ size: DOCUMENT_UPLOAD_MAX_BYTES + 1 }) ?? "",
    /20MB/,
  );
});

test("a plain-text Vercel 413 becomes a useful upload error", async () => {
  await assert.rejects(
    readDocumentUploadResponse(
      new Response("Request Entity Too Large", { status: 413 }),
    ),
    /20MB/,
  );
});

test("document uploads use a private, constrained Blob pathname", () => {
  const pathname = createDocumentUploadPath("Client strategy 2026.pdf");
  assert.equal(isDocumentUploadPath(pathname), true);
  assert.match(pathname, /^ai-documents\/[0-9a-f-]+-Client-strategy-2026\.pdf$/);
  assert.equal(isDocumentUploadPath("planner/client/private.pdf"), false);
  assert.equal(isDocumentUploadPath("ai-documents/../private.pdf"), false);
});

test("document upload content type is derived from the supported extension", () => {
  assert.equal(documentUploadContentType({ name: "brief.docx", type: "" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(documentUploadContentType({ name: "strategy.md", type: "" }), "text/markdown");
});

test("a successful document response returns the parsed document", async () => {
  const document = { name: "strategy.txt", content: "Useful client strategy content", createdAt: "2026-09-29T00:00:00.000Z" };
  const result = await readDocumentUploadResponse(
    Response.json({ success: true, data: document }),
  );
  assert.deepEqual(result, document);
});
