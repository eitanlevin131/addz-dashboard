import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { attachmentPrefix, validAttachmentReceipt } from "../src/lib/questionnaire/attachment-security.ts";

// Exercise the real server module with isolated in-memory database/storage adapters.
// No credentials, external storage writes or database connections are available.
const slot = Symbol.for("addz.questionnaire.attachment.tests");
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
const adapter = moduleUrl(`
const fixture=()=>globalThis[Symbol.for("addz.questionnaire.attachment.tests")];
export const publicQuestionnaire=async token=>{if(token!=="valid"||fixture().revoked){const error=new Error("unavailable");error.status=404;throw error;}return fixture().row;};
export const head=async()=>{fixture().heads++;return fixture().blob;};
export const get=async()=>({statusCode:200,blob:{size:fixture().blob.size},stream:new ReadableStream({start(c){c.enqueue(new Uint8Array(fixture().blob.size));c.close();}})});
export const requireClient=async id=>{if(id!==fixture().row.clientId)throw Error("client_denied");};
export const eq=()=>null,clientQuestionnaires={clientId:"clientId"};
export const getDb=()=>({select(){return {from(){return {where:async()=>[fixture().row]};}};}});
`);
let source = await readFile(new URL("../src/lib/questionnaire/attachment-server.ts", import.meta.url), "utf8");
for (const path of ["@vercel/blob", "drizzle-orm", "@/lib/db", "@/lib/schema", "@/lib/clients", "./repository"]) source = source.replace(JSON.stringify(path), JSON.stringify(adapter));
for (const name of ["core", "attachments", "attachment-security"]) source = source.replace(JSON.stringify("./" + name), JSON.stringify(new URL(`../src/lib/questionnaire/${name}.ts`, import.meta.url).href));
const server = await import(moduleUrl(source));
function fixture(t) {
  const previous = { AUTH_SECRET: process.env.AUTH_SECRET, QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN: process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN };
  process.env.AUTH_SECRET = "attachment-test-secret";
  process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN = "test-adapter-only";
  const row = { id: "questionnaire", clientId: "synthetic-client", status: "sent", selectedIds: ["assets"], snapshot: { items: [{ id: "assets", links: true }] }, answers: {} };
  const pathname = attachmentPrefix(row.id, process.env.AUTH_SECRET) + "file.pdf";
  const data = { row, heads: 0, revoked: false, blob: { pathname, size: 10, contentType: "application/pdf", url: "https://isolated.private.blob.vercel-storage.com/file.pdf" } };
  globalThis[slot] = data;
  t.after(() => { delete globalThis[slot]; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  return data;
}
test("invalid, revoked and submitted links are rejected before any storage interaction", async t => {
  const f = fixture(t); delete process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN;
  await assert.rejects(server.prepareAttachment("invalid", { name: "a.pdf", size: 10 }), { status: 404 });
  f.revoked = true;
  await assert.rejects(server.verifyUploadedAttachment("valid", {}), { status: 404 });
  f.revoked = false; f.row.status = "submitted";
  await assert.rejects(server.prepareAttachment("valid", { name: "a.pdf", size: 10 }), { status: 409 });
  assert.equal(f.heads, 0);
});
test("dedicated private store is required; no shared Blob token fallback", async t => {
  fixture(t); delete process.env.QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN;
  await assert.rejects(server.prepareAttachment("valid", { name: "a.pdf", size: 10 }), { status: 503 });
});
test("preparation validates size/type, scopes the pathname and enforces saved file quota", async t => {
  const f = fixture(t);
  const permission = await server.prepareAttachment("valid", { name: "תמונות.pdf", size: 10 });
  assert.ok(permission.pathname.startsWith(attachmentPrefix(f.row.id, process.env.AUTH_SECRET)));
  assert.equal(permission.contentType, "application/pdf");
  await assert.rejects(server.prepareAttachment("valid", { name: "page.html", size: 10 }), { status: 400 });
  f.row.answers.assets = { attachments: Array(5).fill({}) };
  await assert.rejects(server.prepareAttachment("valid", { name: "a.pdf", size: 10 }), { status: 400 });
});
test("verification rejects foreign paths, wrong MIME, size and public storage before sealing", async t => {
  const f = fixture(t);
  const body = { pathname: f.blob.pathname, name: "a.pdf", size: 10 };
  await assert.rejects(server.verifyUploadedAttachment("valid", { ...body, pathname: attachmentPrefix("other", process.env.AUTH_SECRET) + "file.pdf" }), { status: 400 });
  assert.equal(f.heads, 0);
  const original = { ...f.blob };
  for (const change of [{ size: 11 }, { contentType: "text/html" }, { url: "https://public.blob.vercel-storage.com/file.pdf" }]) {
    f.blob = { ...original, ...change };
    await assert.rejects(server.verifyUploadedAttachment("valid", body), { status: 503 });
  }
  f.blob = original;
  const sealed = await server.verifyUploadedAttachment("valid", body);
  assert.equal(validAttachmentReceipt(sealed, f.row.id, process.env.AUTH_SECRET), true);
  assert.equal("url" in sealed, false);
});
test("downloads require saved membership and force safe non-executable attachment delivery", async t => {
  const f = fixture(t);
  const body = { pathname: f.blob.pathname, name: "חומרים.pdf", size: 10 };
  const sealed = await server.verifyUploadedAttachment("valid", body);
  await assert.rejects(server.publicAttachment("valid", body.pathname), { status: 404 });
  f.row.answers.assets = { attachments: [sealed] };
  const response = await server.publicAttachment("valid", body.pathname);
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Disposition"), /^attachment;/);
  assert.match(response.headers.get("Content-Security-Policy"), /sandbox/);
  assert.equal((await response.arrayBuffer()).byteLength, 10);
  await assert.rejects(server.teamAttachment("different-client", body.pathname), /client_denied/);
  f.revoked = true;
  await assert.rejects(server.publicAttachment("valid", body.pathname), { status: 404 });
});
