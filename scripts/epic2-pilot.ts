import fs from "node:fs";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { createClient } from "../src/lib/clients";
import { advanceScan } from "../src/lib/website-intelligence/worker";
import { scanDetails } from "../src/lib/website-intelligence/repository";

async function pilot() {
  loadEnvConfig(process.cwd());
  const isolated = JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8"));
  const target = new URL(isolated.E2E_DATABASE_URL);
  if (target.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || target.pathname !== "/addz_epic2_validation") throw Error("Unsafe pilot database");
  process.env.DATABASE_URL = target.href;
  process.env.E2E_DATABASE_URL = target.href;
  process.env.WEBSITE_SCAN_E2E = "0";
  process.env.RESEND_API_KEY = "";
  process.env.BLOB_READ_WRITE_TOKEN = "";
  process.env.AI_DOCUMENTS_READ_WRITE_TOKEN = "";
  process.env.CRON_SECRET = "disabled-pilot";
  delete process.env.OPENAI_API_BASE_URL;
  const db = neon(target.href);
  const actor = "pilot-" + crypto.randomUUID();
  await db.query("insert into users(id,email,role,status) values($1,$2,'admin','active')", [actor, actor + "@example.test"]);
  const started = Date.now();
  const client = await createClient({ name: "[TEST] Epic 2 public ecommerce pilot", website: "https://pipandnut.com/", ownerUserId: actor }, actor);
  const id = client.initialWebsiteScanId!;
  console.log(JSON.stringify({ phase: "pilot-started", clientId: client.id, scanId: id, website: client.website, isolated: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }));
  let result;
  for (let step = 0; step < 250; step++) {
    await advanceScan(client.id, id);
    result = await scanDetails(client.id, id);
    console.log(JSON.stringify({ phase: result.scan.state.stage, status: result.scan.status, requests: result.scan.requestCount, sources: result.sources.length, processed: result.sources.filter(source => source.status === "completed").length, findings: result.findings.length, aiRuns: result.runs.length }));
    if (["completed", "completed_with_warnings", "failed", "cancelled"].includes(result.scan.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  if (!result || !["completed", "completed_with_warnings", "failed"].includes(result.scan.status)) throw Error("Pilot did not reach terminal state");
  const report = {
    time: new Date().toISOString(), website: client.website, syntheticClientId: client.id, scanId: id, database: target.pathname.slice(1), databaseHostname: target.hostname,
    status: result.scan.status, error: result.scan.errorCode, durationMs: Date.now() - started,
    discovered: result.scan.state.candidates.length, sitemaps: result.scan.state.sitemapVisited, robots: { fetched: Boolean(result.scan.state.robotsRoot), crawlDelay: result.scan.state.crawlDelay },
    processed: result.sources.filter(source => source.status === "completed").length, selected: result.sources.length, warnings: result.scan.state.warnings, evidence: result.scan.state.evidence,
    deterministic: result.findings.filter(finding => finding.sourceType !== "ai").length, ai: result.findings.filter(finding => finding.sourceType === "ai").length,
    observed: result.findings.filter(finding => finding.observationStatus === "observed").length, inferred: result.findings.filter(finding => finding.observationStatus === "inferred").length,
    inputTokens: result.runs.reduce((total, run) => total + (run.inputTokens || 0), 0), outputTokens: result.runs.reduce((total, run) => total + (run.outputTokens || 0), 0),
    runs: result.runs.map(({ task, model, status, errorCode, durationMs, inputTokens, outputTokens }) => ({ task, model, status, errorCode, durationMs, inputTokens, outputTokens })),
    sources: result.sources.map(({ id, url, canonicalUrl, pageType, title, status, errorCode, extracted }) => ({ id, url, canonicalUrl, pageType, title, status, errorCode, redirects: (extracted as { redirects?: string[] }).redirects || [] })),
    sampleFindings: result.findings.slice(0, 20).map(({ category, key, value, sourceId, evidence, observationStatus, confidence, sourceType }) => ({ category, key, value, sourceId, evidence, observationStatus, confidence, sourceType })),
  };
  fs.writeFileSync(".tmp/epic2/pilot-report.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ phase: "pilot-completed", status: report.status, discovered: report.discovered, processed: report.processed, deterministic: report.deterministic, ai: report.ai, observed: report.observed, inferred: report.inferred, durationMs: report.durationMs, warnings: report.warnings, inputTokens: report.inputTokens, outputTokens: report.outputTokens }));
}
pilot().catch(error => { console.error("Isolated pilot failed", { type: error?.name, code: error?.code, causeCode: error?.cause?.code, frames: String(error?.stack || "").split("\n").filter(line => line.trim().startsWith("at ")).slice(0, 4) }); process.exitCode = 1; });
