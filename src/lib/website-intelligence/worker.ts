import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiRuns, websiteScans, websiteScanSources } from "@/lib/schema";
import { auditInsert } from "@/lib/audit";
import { AI_TASKS, SCAN_LIMITS, SCAN_VERSION } from "./config";
import { checksum, deterministicFindings, evidenceThreshold, extractWebsitePage, pageType, robotsRules, selectPages, sitemapLinks } from "./extraction";
import { aiInput, interpretWebsite, prepareAiTask, WEBSITE_AI_VERSION, WebsiteAiError } from "./ai";
import { findingsInsert, requireScan } from "./repository";
import { retryAt, type ScanState } from "./state";
import { safeWebsiteFetch, WebsiteFetchError } from "./safe-fetch";
import { fixtureFetch } from "./test-fixture";
import { notifyScanRequester } from "./notification";

type Scan = typeof websiteScans.$inferSelect;
function errorCode(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string" && /^[a-z_]{1,60}$/.test(error.code) ? error.code : "processing_failed";
}
async function checkpoint(scan: Scan, token: string, state: ScanState, writes: unknown[] = [], extra: Partial<typeof websiteScans.$inferInsert> = {}) {
  const db = getDb();
  // This locked assertion and the following writes share a single DB transaction.
  // A cancelled/reclaimed lease cannot publish results from an old network request.
  const guard = db.execute(sql`select 1 / (case when (select lease_token from website_scans where id=${scan.id}::uuid and status in ('pending','running','processing') for update) = ${token}::uuid then 1 else 0 end) as fence`);
  const update = db.update(websiteScans).set({ state, leaseToken: null, leaseUntil: null, nextRetryAt: null, stepAttempts: 0, updatedAt: new Date(), ...extra }).where(eq(websiteScans.id, scan.id));
  const queries = [guard, ...writes, update];
  await db.batch(queries as unknown as Parameters<typeof db.batch>[0]);
}
async function request(scan: Scan, token: string, url: string, attempt = 0) {
  const db = getDb();
  const deadline = Date.now() + 30000;
  const gate = async (target?: URL) => {
    if (target && scan.state.robotsRoot && !robotsRules(scan.state.robots, scan.state.robotsRoot).allowed(target.href)) throw new WebsiteFetchError("robots_disallowed");
    const [current] = await db.select({ next: websiteScans.nextRequestAt }).from(websiteScans).where(eq(websiteScans.id, scan.id));
    const wait = Math.max(0, (current?.next?.getTime() || 0) - Date.now());
    if (Date.now() + wait + SCAN_LIMITS.requestMs * 2 > deadline) throw new WebsiteFetchError("chunk_budget");
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const [row] = await db.update(websiteScans).set({ requestCount: sql`${websiteScans.requestCount}+1`, nextRequestAt: sql`now() + ${scan.state.crawlDelay} * interval '1 second'` })
      .where(and(eq(websiteScans.id, scan.id), eq(websiteScans.leaseToken, token), sql`${websiteScans.status} in ('running','processing')`, sql`${websiteScans.requestCount}<${SCAN_LIMITS.requests}`)).returning();
    if (!row) throw new WebsiteFetchError("request_budget_or_lease");
  };
  const fixture = fixtureFetch(url, scan.websiteUrl, attempt);
  if (fixture) { await gate(); return fixture; }
  return safeWebsiteFetch(url, gate, new URL(scan.finalUrl || scan.websiteUrl));
}
function warn(state: ScanState, value: string) { if (!state.warnings.includes(value)) state.warnings.push(value); state.warnings = state.warnings.slice(0, 100); }
function sourceRows(scanId: string, state: ScanState, existing: (typeof websiteScanSources.$inferSelect)[] = []) {
  const rules = robotsRules(state.robots, state.robotsRoot!);
  return selectPages([...existing.map(item => ({ url: item.url, type: item.pageType, depth: item.depth })), ...state.candidates]).filter(item => rules.allowed(item.url)).map(item => ({ scanId, url: item.url, canonicalUrl: item.url, urlHash: checksum(item.url), pageType: item.type, depth: item.depth }));
}
async function finish(scan: Scan, token: string, state: ScanState, forcedFailure?: string) {
  const db = getDb();
  const { rows: [count] } = await db.execute(sql`select count(*)::int as count from website_findings where scan_id=${scan.id}::uuid`);
  const status = forcedFailure || !Number(count.count) ? "failed" : state.warnings.length ? "completed_with_warnings" : "completed";
  state.notification = { status: "pending", attempts: 0 };
  await checkpoint(scan, token, state, [auditInsert({ clientId: scan.clientId, actorType: "system", action: "website_scan." + status, entityType: "website_scan", entityId: scan.id, metadata: { warnings: state.warnings, evidence: state.evidence } })], { status, completedAt: new Date(), errorCode: status === "failed" ? forcedFailure || "insufficient_evidence" : null });
  await notifyScanRequester(scan.id);
}
export async function advanceScan(clientId: string, scanId: string) {
  const existing = await requireScan(clientId, scanId);
  if (["completed", "completed_with_warnings", "failed"].includes(existing.status)) {
    await notifyScanRequester(scanId);
    return { advanced: false };
  }
  const db = getDb();
  const token = crypto.randomUUID();
  const [scan] = await db.update(websiteScans).set({ leaseToken: token, leaseUntil: new Date(Date.now() + SCAN_LIMITS.leaseMs), updatedAt: new Date() })
    .where(and(eq(websiteScans.id, scanId), eq(websiteScans.clientId, clientId), sql`${websiteScans.status} in ('pending','running','processing')`,
      sql`(${websiteScans.leaseUntil} is null or ${websiteScans.leaseUntil}<=now())`, sql`(${websiteScans.nextRetryAt} is null or ${websiteScans.nextRetryAt}<=now())`,
      sql`(${websiteScans.nextRequestAt} is null or ${websiteScans.nextRequestAt}<=now())`)).returning();
  if (!scan) return { advanced: false };
  const state = structuredClone(scan.state);
  try {
    if (scan.version !== SCAN_VERSION) return await finish(scan, token, state, "scanner_version_mismatch");
    if (scan.status === "pending") {
      await db.batch([
        db.update(websiteScans).set({ status: "running", startedAt: new Date() }).where(and(eq(websiteScans.id, scanId), eq(websiteScans.leaseToken, token))),
        auditInsert({ clientId, actorType: "system", action: "website_scan.started", entityType: "website_scan", entityId: scanId }),
      ]);
      scan.status = "running";
    }
    if (state.stage === "bootstrap") {
      const robots = await request(scan, token, new URL("/robots.txt", scan.websiteUrl).href);
      if (robots.status !== 404 && robots.status !== 410 && robots.status !== 200) throw new WebsiteFetchError("robots_unavailable");
      if (robots.status === 200 && robots.headers["content-type"]?.includes("html")) throw new WebsiteFetchError("robots_challenge");
      state.robots = robots.status === 200 ? robots.body : "";
      state.robotsRoot = robots.url;
      const rules = robotsRules(state.robots, scan.websiteUrl);
      state.crawlDelay = rules.delay;
      state.sitemapQueue = [...new Set([...rules.sitemaps, new URL("/sitemap.xml", scan.websiteUrl).href])];
      state.candidates = [{ url: scan.websiteUrl, type: "home", depth: 0 }];
      state.stage = "sitemaps";
      await checkpoint(scan, token, state);
    } else if (state.stage === "sitemaps") {
      const target = state.sitemapQueue.shift();
      if (target && state.sitemapVisited.length < SCAN_LIMITS.sitemaps) {
        state.sitemapVisited.push(target);
        const rules = robotsRules(state.robots, state.robotsRoot!);
        if (!rules.allowed(target)) warn(state, "sitemap_robots_disallowed");
        else {
          try {
            const response = await request(scan, token, target);
            if (response.status !== 200) warn(state, "sitemap_unavailable");
            else {
              const parsed = sitemapLinks(response.body, scan.websiteUrl);
              if (parsed.index) state.sitemapQueue.push(...parsed.urls.filter(url => !state.sitemapVisited.includes(url)).slice(0, SCAN_LIMITS.sitemaps));
              else state.candidates.push(...parsed.urls.map(url => ({ url, type: pageType(url), depth: 1 })));
            }
          } catch (error) { warn(state, "sitemap_" + errorCode(error)); }
        }
      }
      state.candidates = [...new Map(state.candidates.map(item => [item.url, item])).values()].slice(0, SCAN_LIMITS.candidates);
      if (!state.sitemapQueue.length || state.sitemapVisited.length >= SCAN_LIMITS.sitemaps) state.stage = "fetch";
      const rows = state.stage === "fetch" ? sourceRows(scanId, state) : [];
      await checkpoint(scan, token, state, rows.length ? [db.insert(websiteScanSources).values(rows).onConflictDoNothing()] : []);
    } else if (state.stage === "fetch") {
      const sources = await db.select().from(websiteScanSources).where(eq(websiteScanSources.scanId, scanId));
      const source = sources.find(item => item.status === "pending");
      if (!source) {
        state.evidence = evidenceThreshold(sources.map(item => ({ text: item.text || "", type: item.pageType, contentHash: item.contentHash || item.id })));
        if (!state.evidence.sufficient) { warn(state, "insufficient_evidence_ai_skipped"); state.stage = "finalize"; }
        else state.stage = "ai";
        await checkpoint(scan, token, state, [], { status: "processing" });
      } else {
        const rules = robotsRules(state.robots, state.robotsRoot!);
        const response = await request(scan, token, source.url, source.attempts);
        if (!rules.allowed(response.url)) throw new WebsiteFetchError("redirect_robots_disallowed");
        if ([429,500,502,503,504].includes(response.status)) throw new WebsiteFetchError("page_temporarily_unavailable");
        const page = extractWebsitePage(response.body, response.url, response.headers);
        const blocked = response.status !== 200 ? "http_" + response.status : page.blocked;
        if (blocked) warn(state, blocked);
        if (page.truncated) warn(state, "text_truncated");
        const writes: unknown[] = [db.update(websiteScanSources).set({ status: blocked ? "skipped" : "completed", attempts: source.attempts + 1, canonicalUrl: response.url, title: page.title, language: page.language,
          text: blocked ? null : page.text, contentHash: page.contentHash, extracted: blocked ? {} : { structured: page.structured, redirects: response.redirects }, httpStatus: response.status, bytes: response.bytes, errorCode: blocked, fetchedAt: new Date() }).where(eq(websiteScanSources.id, source.id))];
        if (!blocked) {
          const findings = deterministicFindings(source.id, response.url, source.pageType, page);
          if (findings.length) writes.push(findingsInsert(scanId, findings));
          const current = new Set(sources.map(item => item.url));
          state.candidates.push(...page.links.map(item => ({ ...item, depth: source.depth + 1 })));
          state.candidates = [...new Map(state.candidates.map(item => [item.url, item])).values()].slice(0, SCAN_LIMITS.candidates);
          const rows = sourceRows(scanId, state, sources).filter(item => !current.has(item.url)).slice(0, Math.max(0, SCAN_LIMITS.pages - sources.length));
          if (rows.length) writes.push(db.insert(websiteScanSources).values(rows).onConflictDoNothing());
        }
        await checkpoint(scan, token, state, writes, source.pageType === "home" ? { finalUrl: response.url } : {});
      }
    } else if (state.stage === "ai") {
      const task = AI_TASKS[state.taskIndex];
      if (!task || state.aiAttempts >= SCAN_LIMITS.aiAttempts) { if (task) warn(state, "ai_attempt_budget_exhausted"); state.stage = "finalize"; await checkpoint(scan, token, state); }
      else {
        const sources = await db.select().from(websiteScanSources).where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "completed")));
        const measured = evidenceThreshold(sources.map(item => ({ text: item.text || "", type: item.pageType, contentHash: item.contentHash || item.id })));
        const prepared = prepareAiTask(task, sources.map(item => ({ id: item.id, url: item.canonicalUrl, pageType: item.pageType, text: item.text || "", contentHash: item.contentHash || item.id })));
        if (!measured.sufficient || !prepared.sufficient) { warn(state, task + "_insufficient_evidence"); state.taskIndex++; await checkpoint(scan, token, state); }
        else {
          const runs = await db.select().from(aiRuns).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, task)));
          if (runs.some(run => run.status === "completed") || runs.length >= 2) { if (runs.length >= 2) warn(state, task + "_attempts_exhausted"); state.taskIndex++; await checkpoint(scan, token, state); }
          else {
            const id = crypto.randomUUID();
            const model = String((scan.configuration as { model?: string }).model || "gpt-5-mini");
            state.aiAttempts++;
            await db.batch([
              db.execute(sql`select 1/(case when (select lease_token from website_scans where id=${scanId}::uuid for update)=${token}::uuid then 1 else 0 end)`),
              db.update(aiRuns).set({ status: "failed", errorCode: "interrupted" }).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, task), eq(aiRuns.status, "running"))),
              db.insert(aiRuns).values({ id, clientId, scanId, task, attempt: runs.length + 1, model, ...WEBSITE_AI_VERSION, sourceIds: prepared.sources.map(item => item.id), inputHash: checksum(aiInput(task, prepared.sources)), status: "running" }),
              db.update(websiteScans).set({ state }).where(eq(websiteScans.id, scanId)),
            ]);
            const started = Date.now();
            try {
              const result = await interpretWebsite(task, prepared.sources, model);
              if (result.rejected) warn(state, task + "_invalid_findings_rejected");
              state.taskIndex++;
              const writes: unknown[] = [db.update(aiRuns).set({ status: "completed", output: result.output, durationMs: Date.now() - started, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, providerRequestId: result.providerRequestId }).where(eq(aiRuns.id, id))];
              if (result.findings.length) writes.push(findingsInsert(scanId, result.findings, id));
              await checkpoint(scan, token, state, writes);
            } catch (error) {
              warn(state, task + "_" + errorCode(error));
              await checkpoint(scan, token, state, [db.update(aiRuns).set({ status: "failed", errorCode: errorCode(error), durationMs: Date.now() - started,
                ...(error instanceof WebsiteAiError ? { output: error.output, inputTokens: error.usage?.input_tokens, outputTokens: error.usage?.output_tokens, providerRequestId: error.providerRequestId } : {}),
              }).where(eq(aiRuns.id, id))], { nextRetryAt: retryAt(runs.length + 1) });
            }
          }
        }
      }
    } else await finish(scan, token, state);
  } catch (error) {
    const code = errorCode(error);
    try {
      if (state.stage === "fetch") {
        const [source] = await db.select().from(websiteScanSources).where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "pending"))).limit(1);
        if (source) {
          const attempts = source.attempts + 1;
          if (attempts >= 2 || code === "request_budget_or_lease") warn(state, code);
          await checkpoint(scan, token, state, [db.update(websiteScanSources).set({ attempts, status: attempts >= 2 || code === "request_budget_or_lease" ? "failed" : "pending", errorCode: code }).where(eq(websiteScanSources.id, source.id))], { nextRetryAt: attempts < 2 ? retryAt(attempts) : null });
        } else await finish(scan, token, state, code);
      } else if (scan.stepAttempts < 1 && state.stage === "bootstrap") await checkpoint(scan, token, state, [], { stepAttempts: scan.stepAttempts + 1, nextRetryAt: retryAt(scan.stepAttempts + 1) });
      else await finish(scan, token, state, code);
    } catch { /* Lost leases/cancellation cannot overwrite newer state; interrupted work is resumable. */ }
  }
  return { advanced: true };
}
