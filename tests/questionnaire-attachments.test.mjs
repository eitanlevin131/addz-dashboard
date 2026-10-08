import test from "node:test";
import assert from "node:assert/strict";
import { attachmentContentType, attachmentFileError, attachmentPathIsSafe, parseAttachmentMetadata, QUESTIONNAIRE_FILE_LIMIT } from "../src/lib/questionnaire/attachments.ts";
import { attachmentPrefix, attachmentBelongsTo, attachmentReceipt, validAttachmentReceipt } from "../src/lib/questionnaire/attachment-security.ts";
import { generateQuestionnaire, parseAnswers, editableQuestionnaireAnswer } from "../src/lib/questionnaire/core.ts";

const secret = "isolated-test-secret", id = "questionnaire-one";
const file = { pathname: attachmentPrefix(id, secret) + "file.pdf", name: "חומרי מותג.pdf", size: 1024, contentType: "application/pdf" };
const sealed = () => ({ ...file, receipt: attachmentReceipt(file, id, secret) });
test("only bounded supported documents/images are accepted; active markup is excluded", () => {
  for (const name of ["brand.pdf", "photo.PNG", "images.zip", "brief.docx", "notes.txt", "image.webp"]) assert.equal(attachmentFileError({ name, size: 1024 }), null);
  for (const name of ["logo.svg", "page.html", "run.exe", "bad\r\nname.pdf", " ", "x".repeat(181) + ".pdf"]) assert.ok(attachmentFileError({ name, size: 1 }));
  for (const size of [0, -1, 1.5, NaN, QUESTIONNAIRE_FILE_LIMIT + 1]) assert.ok(attachmentFileError({ name: "a.pdf", size }));
  assert.equal(attachmentFileError({ name: "a.pdf", size: QUESTIONNAIRE_FILE_LIMIT }), null);
  assert.equal(attachmentContentType("photo.JPG"), "image/jpeg");
});
test("opaque storage scope rejects cross-questionnaire paths and traversal", () => {
  assert.equal(attachmentBelongsTo(file.pathname, id, secret), true);
  assert.equal(attachmentBelongsTo(file.pathname, "different-questionnaire", secret), false);
  for (const path of [file.pathname + "/../other.pdf", "https://example.test/file.pdf", file.pathname.replace("file.pdf", "../file.pdf"), file.pathname.replace(".pdf", ".svg")]) assert.equal(attachmentPathIsSafe(path), false);
  assert.ok(!file.pathname.includes(id));
});
test("sealed receipt binds every file attribute and questionnaire, not a client supplied URL", () => {
  assert.equal(validAttachmentReceipt(sealed(), id, secret), true);
  assert.equal(validAttachmentReceipt(sealed(), "other", secret), false);
  assert.equal(validAttachmentReceipt(sealed(), id, "different-secret"), false);
  for (const mutation of [{ name: "other.pdf" }, { size: 1025 }, { contentType: "text/html" }, { pathname: attachmentPrefix(id, secret) + "other.pdf" }, { receipt: "0".repeat(64) }, { receipt: "bad" }]) assert.equal(validAttachmentReceipt({ ...sealed(), ...mutation }, id, secret), false);
});
test("metadata rejects duplicate files, unsupported types, extra fields and excessive count", () => {
  assert.deepEqual(parseAttachmentMetadata([sealed()]), [sealed()]);
  for (const input of [[sealed(), sealed()], Array.from({ length: 6 }, (_, i) => ({ ...sealed(), pathname: attachmentPrefix(id, secret) + i + ".pdf" })), [{ ...sealed(), url: "https://public.example/file.pdf" }], [{ ...sealed(), contentType: "text/html" }], [{ ...sealed(), size: "1024" }], "file.pdf"]) assert.throws(() => parseAttachmentMetadata(input));
});
test("asset-only answer supports links/files; all other answers preserve existing text requirements", () => {
  const q = generateQuestionnaire({ name: "test", website: null, commercialScope: null, includedServices: [] }, null, []);
  const selected = q.items.map(item => item.id);
  const answer = parseAnswers(q, selected, { assets: { state: "answered", text: "", attachments: [sealed()] } }).assets;
  assert.equal(answer.attachments.length, 1);
  assert.deepEqual(editableQuestionnaireAnswer(answer).attachments, [sealed()]);
  assert.ok(!("updatedAt" in editableQuestionnaireAnswer(answer)));
  assert.equal(parseAnswers(q, selected, { assets: { state: "answered", text: "", links: ["https://example.test/photos"] } }).assets.links.length, 1);
  assert.throws(() => parseAnswers(q, selected, { priorities: { state: "answered", text: "", attachments: [sealed()] } }));
  assert.throws(() => parseAnswers(q, selected, { assets: { state: "answered", text: "" } }));
});
