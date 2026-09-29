import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  documentUploadSizeError,
  readDocumentUploadResponse,
} from "../src/lib/document-upload.ts";

test("documents above the Vercel-safe limit are rejected before upload", () => {
  assert.equal(documentUploadSizeError({ size: DOCUMENT_UPLOAD_MAX_BYTES }), null);
  assert.match(
    documentUploadSizeError({ size: DOCUMENT_UPLOAD_MAX_BYTES + 1 }) ?? "",
    /4MB/,
  );
});

test("a plain-text Vercel 413 becomes a useful upload error", async () => {
  await assert.rejects(
    readDocumentUploadResponse(
      new Response("Request Entity Too Large", { status: 413 }),
    ),
    /4MB/,
  );
});

test("a successful document response returns the parsed document", async () => {
  const document = { name: "strategy.txt", content: "Useful client strategy content", createdAt: "2026-09-29T00:00:00.000Z" };
  const result = await readDocumentUploadResponse(
    Response.json({ success: true, data: document }),
  );
  assert.deepEqual(result, document);
});
