import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import https from "node:https";
import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { robotsRules } from "../src/lib/website-intelligence/extraction.ts";
import { websiteWarningLabel, SCAN_LIMITS } from "../src/lib/website-intelligence/config.ts";
import { crawlDelayPolicy, initialScanState, retryAfterDeadline, retryAt, transientWebsiteStatus, websiteRequestsPending } from "../src/lib/website-intelligence/state.ts";
import { WebsiteFetchError } from "../src/lib/website-intelligence/safe-fetch.ts";

const root = "https://shop.example.com/";
test("crawl delay respects zero, fractional and up-to-five-second values; caps only larger values", () => {
  for (const delay of [0, 0.5, 1, 3, 5]) {
    const rules = robotsRules(`User-agent: *\nCrawl-delay: ${delay}`, root);
    assert.equal(rules.delay, delay); assert.equal(rules.originalDelay, delay); assert.equal(rules.delayWarning, null);
  }
  for (const delay of [5.5, 120, 3600, 1e30]) {
    const rules = robotsRules(`User-agent: *\nCrawl-delay: ${delay}`, root);
    assert.equal(rules.delay, 5); assert.equal(rules.originalDelay, delay);
    assert.equal(rules.delayWarning, `crawl_delay_capped:${delay}:5`);
    assert.ok(websiteWarningLabel(rules.delayWarning).includes(String(delay)));
    assert.ok(websiteWarningLabel(rules.delayWarning).includes("5 שניות"));
  }
  for (const value of [undefined, NaN, Infinity, -1]) assert.deepEqual(crawlDelayPolicy(value), { original: null, effective: 1, warning: null });
});
test("capping delay never changes Disallow or user-agent matching", () => {
  const rules = robotsRules(`User-agent: *\nCrawl-delay: 120\nDisallow: /private\nUser-agent: ADDZWebsiteBot\nCrawl-delay: 4\nDisallow: /checkout`, root);
  assert.equal(rules.delay, 4); assert.equal(rules.allowed(root + "checkout"), false);
  const wildcard = robotsRules("User-agent: *\nCrawl-delay: 120\nDisallow: /private", root);
  assert.equal(wildcard.delay, 5); assert.equal(wildcard.allowed(root + "private/x"), false);
});
test("Retry-After numeric and HTTP-date deadlines are not capped, and backoff remains independent", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(retryAfterDeadline("120", now).getTime(), now + 120000);
  assert.equal(retryAfterDeadline("7200", now).getTime(), now + 7200000);
  assert.equal(retryAfterDeadline("Mon, 05 Oct 2026 14:00:00 GMT", now).getTime(), now + 7200000);
  for (const value of [undefined, "", "-1", "Infinity", "1.5", "not a date", "Sun, 04 Oct 2026 12:00:00 GMT"]) assert.equal(retryAfterDeadline(value, now), null);
  assert.equal(retryAt(1, now).getTime(), now + 4000);
  assert.equal(retryAt(2, now).getTime(), now + 8000);
  assert.equal(retryAt(30, now).getTime(), now + 60000);
  assert.equal(retryAt(1, now, 7200).getTime(), now + 7200000);
  for (const status of [429, 500, 501, 502, 503, 504, 599]) assert.equal(transientWebsiteStatus(status), true);
  for (const status of [200, 301, 400, 403, 404, 600]) assert.equal(transientWebsiteStatus(status), false);
});
test("the crawler clock applies only while website requests remain, not AI or finalization", () => {
  const state = initialScanState();
  assert.equal(websiteRequestsPending(state, false), true);
  state.stage = "sitemaps"; assert.equal(websiteRequestsPending(state, false), false);
  state.sitemapQueue = [root + "sitemap.xml"]; assert.equal(websiteRequestsPending(state, false), true);
  state.sitemapVisited = Array(SCAN_LIMITS.sitemaps).fill(root); assert.equal(websiteRequestsPending(state, false), false);
  state.stage = "fetch"; assert.equal(websiteRequestsPending(state, true), true); assert.equal(websiteRequestsPending(state, false), false);
  for (const stage of ["ai", "finalize"]) { state.stage = stage; assert.equal(websiteRequestsPending(state, true), false); }
});

// Exercise the real worker with in-memory DB/provider adapters. No credentials,
// database connection, website request or AI call is available in this fixture.
const slot = Symbol.for("addz.website.crawl.policy.tests");
function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const adapter = moduleUrl(`
const context=()=>globalThis[Symbol.for("addz.website.crawl.policy.tests")];
export const getDb=()=>context().db;
export const requireScan=async()=>structuredClone(context().scan);
export const notifyScanRequester=async()=>{};
export const auditInsert=()=>Promise.resolve();
export const findingsInsert=()=>Promise.resolve();
export const fixtureFetch=()=>null;
export const safeWebsiteFetch=(...args)=>context().fetch(...args);
const table=name=>new Proxy({}, {get:(_target,key)=>context().column(name,key)});
export const websiteScans=table("scans"),websiteScanSources=table("sources"),websiteFindings=table("findings"),aiRuns=table("runs");
`);
let source = await readFile(new URL("../src/lib/website-intelligence/worker.ts", import.meta.url), "utf8");
for (const path of ["@/lib/db", "@/lib/schema", "@/lib/audit", "./repository", "./notification", "./test-fixture"]) source = source.replace(JSON.stringify(path), JSON.stringify(adapter));
source = source.replace('import { safeWebsiteFetch, WebsiteFetchError } from "./safe-fetch";', `import { safeWebsiteFetch } from ${JSON.stringify(adapter)}; import { WebsiteFetchError } from ${JSON.stringify(new URL("../src/lib/website-intelligence/safe-fetch.ts", import.meta.url).href)};`);
source = source.replace('"drizzle-orm"', JSON.stringify(import.meta.resolve("drizzle-orm")));
for (const path of ["./config", "./extraction", "./ai", "./state", "./research-map", "./research-candidates", "./finding-review", "./catalog", "./strategic", "./strategic-contract"]) source = source.replace(JSON.stringify(path), JSON.stringify(new URL(`../src/lib/website-intelligence/${path.slice(2)}.ts`, import.meta.url).href));
const worker = await import(moduleUrl(source + "\nexport { request as policyRequest };"));
let fetchSource = await readFile(new URL("../src/lib/website-intelligence/safe-fetch.ts", import.meta.url), "utf8");
for (const path of ["./config.ts", "./state.ts"]) fetchSource = fetchSource.replace(JSON.stringify(path), JSON.stringify(new URL(`../src/lib/website-intelligence/${path.slice(2)}`, import.meta.url).href));
fetchSource = fetchSource.replace('"ipaddr.js"', JSON.stringify(import.meta.resolve("ipaddr.js")));
const { policyPinnedRequest } = await import(moduleUrl(fetchSource + "\nexport { pinnedRequest as policyPinnedRequest };"));
for (const status of [429, 503]) test(`${status} JSON responses retain Retry-After without reading unsupported/error bodies`, async t => {
  let destroyed = false;
  t.mock.method(https, "request", (_url, _options, callback) => {
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      Object.assign(response, { statusCode: status, headers: { "content-type": "application/json", "retry-after": "7200" }, destroy: () => { destroyed = true; } });
      callback(response);
    };
    request.destroy = () => {};
    return request;
  });
  const response = await policyPinnedRequest({ url: new URL(root), hostname: "shop.example.com", address: "1.1.1.1", family: 4 });
  assert.equal(response.status, status); assert.equal(response.headers["retry-after"], "7200");
  assert.equal(response.body, ""); assert.equal(response.bytes, 0); assert.equal(destroyed, true);
});
function fixture(state, sources = []) {
  const writes = [], conditions = [], fetchCalls = [];
  const scan = { id: "scan", clientId: "client", websiteUrl: root, finalUrl: root, version: "website-v3", status: "running", state,
    stepAttempts: 0, nextRequestAt: new Date(Date.now() + 120000), nextRetryAt: null };
  const column = (table, key) => sql.identifier(`${table}.${String(key)}`);
  const db = {
    select(fields) { return { from() { return { where() { const rows = fields?.next ? [{ next: null }] : fields?.id ? sources.filter(s => s.status === "pending") : sources;
      const result = Promise.resolve(rows); result.limit = n => Promise.resolve(rows.slice(0, n)); return result; } }; } }; },
    update(table) { return { set(values) { writes.push({ table, values }); return { where(condition) { conditions.push(condition); return {
      returning: async () => [structuredClone(scan)], then: resolve => resolve([]),
    }; } }; } }; },
    execute: () => Promise.resolve({ rows: [{ count: 1 }] }),
    batch: queries => Promise.all(queries),
  };
  const context = { db, column, scan, fetch: async (url, gate) => {
    fetchCalls.push(url); await gate(new URL(url));
    return { url, status: 429, headers: { "retry-after": "120" }, body: "", bytes: 0, redirects: [] };
  } };
  globalThis[slot] = context;
  return { context, writes, conditions, fetchCalls };
}
test("worker resumes an old capped checkpoint and persists both original/effective values in its warning", async () => {
  const state = { ...initialScanState(), stage: "sitemaps", robots: "User-agent: *\nCrawl-delay: 120", robotsRoot: root, crawlDelay: 120, sitemapQueue: [root + "sitemap.xml"] };
  const f = fixture(state);
  await worker.advanceScan("client", "scan");
  const saved = f.writes.findLast(w => w.values.state)?.values;
  assert.equal(saved.state.crawlDelay, 5); assert.equal(saved.state.crawlDelayOriginal, 120);
  assert.ok(saved.state.warnings.includes("crawl_delay_capped:120:5"));
  assert.equal(saved.state.sitemapQueue.length, 1); // 429 retries do not silently consume the sitemap.
  assert.ok(Date.parse(saved.state.websiteRetryAfterAt) >= Date.now() + 119000);
  assert.ok(saved.nextRetryAt.getTime() >= Date.now() + 3000);
  const claim = new PgDialect().sqlToQuery(f.conditions[0]);
  assert.match(claim.sql, /greatest\(0, coalesce.*crawlDelay/);
  assert.match(claim.sql, /websiteRetryAfterAt/);
});
test("worker clears the crawler deadline on fetch completion and does not defer the AI transition", async () => {
  const f = fixture({ ...initialScanState(), stage: "fetch", crawlPhase: "deep", robotsRoot: root }, ["home", "about"].map((pageType, n) => ({
    id: `source-${n}`, status: "completed", pageType, text: "Useful public ecommerce content. ".repeat(100), contentHash: `hash-${n}`,
  })));
  await worker.advanceScan("client", "scan");
  assert.equal(f.writes[0].values.nextRequestAt, null);
  const claim = new PgDialect().sqlToQuery(f.conditions[0]);
  assert.ok(claim.params.includes(false));
  const checkpoint = f.writes.findLast(w => w.values.state)?.values;
  assert.equal(checkpoint.nextRequestAt, null); assert.equal(checkpoint.status, "processing");
  assert.equal(checkpoint.state.stage, "ai");
  assert.equal(f.fetchCalls.length, 0);
});
test("all redirect hops use the effective delay and retain an independent Retry-After checkpoint", async () => {
  const state = { ...initialScanState(), robots: "User-agent: *\nCrawl-delay: 120\nDisallow: /private", robotsRoot: root, crawlDelay: 5 };
  const f = fixture(state);
  f.context.fetch = async (url, gate, _root, continuation) => {
    await gate(new URL(url));
    await continuation.onRedirect({ currentUrl: root + "new", redirects: [root + "new"] }, new Date(Date.now() + 120000));
    await gate(new URL(root + "new"));
    throw Error("must wait for Retry-After before fetching the redirect");
  };
  await assert.rejects(worker.policyRequest(f.context.scan, "token", state, root + "old"), /chunk_budget/);
  assert.equal(state.request.currentUrl, root + "new");
  assert.ok(Date.parse(state.websiteRetryAfterAt) >= Date.now() + 119000);
  const clock = f.writes.find(w => w.values.requestCount)?.values.nextRequestAt;
  assert.deepEqual(new PgDialect().sqlToQuery(clock).params, [5]);
  await assert.rejects(worker.policyRequest(f.context.scan, "token", state, root + "private"), /robots_disallowed/);
});
test("both original and redirected requests use five seconds when no server cooldown is present", async () => {
  const state = { ...initialScanState(), robotsRoot: root, crawlDelay: robotsRules("User-agent: *\nCrawl-delay: 120", root).delay };
  const f = fixture(state);
  f.context.fetch = async (url, gate, _root, continuation) => {
    await gate(new URL(url));
    await continuation.onRedirect({ currentUrl: root + "new", redirects: [root + "new"] });
    await gate(new URL(root + "new"));
    return { url: root + "new", status: 200, headers: {}, body: "", bytes: 0, redirects: [root + "new"] };
  };
  await worker.policyRequest(f.context.scan, "token", state, root + "old");
  const clocks = f.writes.filter(w => w.values.requestCount).map(w => new PgDialect().sqlToQuery(w.values.nextRequestAt).params);
  assert.deepEqual(clocks, [[5], [5]]); assert.equal(state.request, undefined);
});
for (const outcome of [503, "timeout"]) test(`worker preserves ${outcome} retries/backoff independently of the five-second cap`, async () => {
  const f = fixture({ ...initialScanState(), stage: "sitemaps", robotsRoot: root, sitemapQueue: [root + "sitemap.xml"] });
  f.context.fetch = async () => {
    if (outcome === "timeout") throw new WebsiteFetchError("request_timeout");
    return { url: root, status: 503, headers: { "retry-after": "7200" }, body: "", bytes: 0, redirects: [] };
  };
  await worker.advanceScan("client", "scan");
  const saved = f.writes.findLast(w => w.values.state)?.values;
  assert.equal(saved.stepAttempts, 1); assert.equal(saved.state.sitemapQueue.length, 1);
  assert.ok(saved.nextRetryAt.getTime() >= Date.now() + 3000);
  if (outcome === 503) assert.ok(Date.parse(saved.state.websiteRetryAfterAt) >= Date.now() + 7199000);
});
