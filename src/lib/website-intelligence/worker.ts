import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiRuns, websiteFindings, websiteScans, websiteScanSources } from "@/lib/schema";
import { auditInsert } from "@/lib/audit";
import { AI_TASKS, SCAN_LIMITS, SCAN_VERSION } from "./config";
import { canonicalUrl, checksum, coveragePages, deterministicFindings, evidenceThreshold, extractWebsitePage, pageType, robotsRules, sitemapLinks } from "./extraction";
import { aiInput, interpretWebsite, prepareAiTask, validateAiFindings, WEBSITE_AI_VERSION, WebsiteAiError } from "./ai";
import { findingsInsert, requireScan } from "./repository";
import { retryAfterDeadline, retryAt, transientWebsiteStatus, websiteRequestsPending, type ScanState } from "./state";
import { safeWebsiteFetch, WebsiteFetchError } from "./safe-fetch";
import { fixtureFetch } from "./test-fixture";
import { notifyScanRequester } from "./notification";
import { createResearchMap, RESEARCH_MAP_VERSION, type ResearchRun } from "./research-map";
import { prepareResearchCandidates } from "./research-candidates";
import { findingReviewInput, reviewWebsiteFindings, FINDING_REVIEW_VERSION } from "./finding-review";
import { discoveryPages, representativeProducts, productIdentity } from "./catalog";

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
async function request(scan: Scan, token: string, state: ScanState, url: string, attempt = 0) {
  const db = getDb();
  const deadline = Date.now() + 30000;
  const gate = async (target?: URL) => {
    if (target && state.robotsRoot && !robotsRules(state.robots, state.robotsRoot).allowed(target.href)) throw new WebsiteFetchError("robots_disallowed");
    const [current] = await db.select({ next: websiteScans.nextRequestAt }).from(websiteScans).where(eq(websiteScans.id, scan.id));
    const wait = Math.max(0, Math.max(current?.next?.getTime() || 0, Date.parse(state.websiteRetryAfterAt || "") || 0) - Date.now());
    if (Date.now() + wait + SCAN_LIMITS.requestMs * 2 > deadline) throw new WebsiteFetchError("chunk_budget");
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const [row] = await db.update(websiteScans).set({ requestCount: sql`${websiteScans.requestCount}+1`, nextRequestAt: sql`now() + ${state.crawlDelay} * interval '1 second'` })
      .where(and(eq(websiteScans.id, scan.id), eq(websiteScans.leaseToken, token), sql`${websiteScans.status} in ('running','processing')`, sql`${websiteScans.requestCount}<${SCAN_LIMITS.requests}`)).returning();
    if (!row) throw new WebsiteFetchError("request_budget_or_lease");
  };
  const fixture = fixtureFetch(url, scan.websiteUrl, attempt);
  if (fixture) { await gate(); return fixture; }
  const response = await safeWebsiteFetch(url, gate, new URL(scan.finalUrl || scan.websiteUrl), {
    cursor: state.request?.originalUrl === url ? state.request : undefined,
    onRedirect: async (cursor, retryAfterAt) => {
      state.request = { originalUrl: url, ...cursor };
      if (retryAfterAt) state.websiteRetryAfterAt = retryAfterAt.toISOString();
      const [saved] = await db.update(websiteScans).set({ state }).where(and(eq(websiteScans.id, scan.id), eq(websiteScans.leaseToken, token), sql`${websiteScans.status} in ('running','processing')`)).returning({ id: websiteScans.id });
      if (!saved) throw new WebsiteFetchError("request_budget_or_lease");
    },
  });
  delete state.request;
  const retryAfterAt = retryAfterDeadline(response.headers["retry-after"]);
  if (retryAfterAt) state.websiteRetryAfterAt = retryAfterAt.toISOString();
  return response;
}
function warn(state: ScanState, value: string) { if (!state.warnings.includes(value)) state.warnings.push(value); state.warnings = state.warnings.slice(0, 100); }
function sourceRows(scanId: string, state: ScanState, existing: (typeof websiteScanSources.$inferSelect)[] = []) {
  const rules = robotsRules(state.robots, state.robotsRoot!);
  const candidates = state.candidates.filter(item => rules.allowed(item.url));
  const selected = state.crawlPhase === "discovery" ? discoveryPages(candidates, existing)
    : state.crawlPhase === "deep" ? representativeProducts(candidates, existing, SCAN_LIMITS.pages - existing.length)
    : coveragePages(candidates, existing.map(item => ({ url: item.url, type: item.pageType, depth: item.depth })));
  const current = new Set(existing.map(item => productIdentity(item.url)));
  return selected.filter(item => !current.has(productIdentity(item.url))).map(item => {
    const identity = item.type === "product" ? productIdentity(item.url) : canonicalUrl(item.url, state.robotsRoot!)!;
    return { scanId, url: item.url, canonicalUrl: identity, urlHash: checksum(identity), pageType: item.type, depth: item.depth };
  });
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
  const state = structuredClone(existing.state);
  const policy = robotsRules(state.robots, state.robotsRoot || existing.websiteUrl);
  state.crawlDelay = policy.delay;
  state.crawlDelayOriginal = policy.originalDelay;
  if (policy.delayWarning) warn(state, policy.delayWarning);
  const pendingSource = state.stage === "fetch" ? (await db.select({ id: websiteScanSources.id }).from(websiteScanSources)
    .where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "pending"))).limit(1)).length > 0 : false;
  const needsRequest = websiteRequestsPending(state, pendingSource);
  // Use the locked row's clocks: a concurrent checkpoint cannot be overwritten
  // with an earlier deadline observed before the lease claim.
  const crawlerAt = sql`${websiteScans.nextRequestAt} - greatest(0, coalesce((${websiteScans.state}->>'crawlDelay')::double precision, 1) - 5) * interval '1 second'`;
  const serverAt = sql`nullif(${websiteScans.state}->>'websiteRetryAfterAt', '')::timestamptz`;
  const token = crypto.randomUUID();
  const [scan] = await db.update(websiteScans).set({ leaseToken: token, leaseUntil: new Date(Date.now() + SCAN_LIMITS.leaseMs), nextRequestAt: needsRequest ? crawlerAt : null, updatedAt: new Date() })
    .where(and(eq(websiteScans.id, scanId), eq(websiteScans.clientId, clientId), sql`${websiteScans.state}=${JSON.stringify(existing.state)}::jsonb`, sql`${websiteScans.status} in ('pending','running','processing')`,
      sql`(${websiteScans.leaseUntil} is null or ${websiteScans.leaseUntil}<=now())`, sql`(${websiteScans.nextRetryAt} is null or ${websiteScans.nextRetryAt}<=now())`,
      sql`(not ${needsRequest} or ((${crawlerAt} is null or ${crawlerAt}<=now())
        and (${serverAt} is null or ${serverAt}<=now())))`)).returning();
  if (!scan) return { advanced: false };
  // Read the claimed checkpoint, not a potentially stale pre-claim copy.
  Object.assign(state, structuredClone(scan.state), { crawlDelay: policy.delay, crawlDelayOriginal: policy.originalDelay });
  if (policy.delayWarning) warn(state, policy.delayWarning);
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
      const robots = await request(scan, token, state, new URL("/robots.txt", scan.websiteUrl).href);
      if (transientWebsiteStatus(robots.status)) throw new WebsiteFetchError("page_temporarily_unavailable");
      if (robots.status !== 404 && robots.status !== 410 && robots.status !== 200) throw new WebsiteFetchError("robots_unavailable");
      if (robots.status === 200 && robots.headers["content-type"]?.includes("html")) throw new WebsiteFetchError("robots_challenge");
      state.robots = robots.status === 200 ? robots.body : "";
      state.robotsRoot = robots.url;
      const rules = robotsRules(state.robots, scan.websiteUrl);
      state.crawlDelay = rules.delay;
      state.crawlDelayOriginal = rules.originalDelay;
      if (rules.delayWarning) warn(state, rules.delayWarning);
      state.sitemapQueue = [...new Set([...rules.sitemaps, new URL("/sitemap.xml", scan.websiteUrl).href])];
      state.candidates = [{ url: scan.websiteUrl, type: "home", depth: 0 }];
      state.stage = "sitemaps";
      await checkpoint(scan, token, state);
    } else if (state.stage === "sitemaps") {
      const target = state.sitemapQueue[0];
      if (target && state.sitemapVisited.length < SCAN_LIMITS.sitemaps) {
        const rules = robotsRules(state.robots, state.robotsRoot!);
        if (!rules.allowed(target)) warn(state, "sitemap_robots_disallowed");
        else {
          try {
            const response = await request(scan, token, state, target);
            if (transientWebsiteStatus(response.status)) throw new WebsiteFetchError("page_temporarily_unavailable");
            if (response.status !== 200) warn(state, "sitemap_unavailable");
            else {
              const parsed = sitemapLinks(response.body, scan.websiteUrl);
              if (parsed.index) state.sitemapQueue.push(...parsed.urls.filter(url => !state.sitemapVisited.includes(url)).slice(0, SCAN_LIMITS.sitemaps));
              else state.candidates.push(...parsed.urls.map(url => ({ url, type: pageType(url), depth: 1 })));
            }
          } catch (error) { if (["chunk_budget", "page_temporarily_unavailable", "request_timeout", "connection_failed", "dns_timeout"].includes(errorCode(error))) throw error; delete state.request; warn(state, "sitemap_" + errorCode(error)); }
        }
        state.sitemapQueue.shift();
        state.sitemapVisited.push(target);
      }
      state.candidates = [...new Map(state.candidates.map(item => [canonicalUrl(item.url, scan.websiteUrl), item])).values()].slice(0, SCAN_LIMITS.candidates);
      if (!state.sitemapQueue.length || state.sitemapVisited.length >= SCAN_LIMITS.sitemaps) state.stage = "fetch";
      const rows = state.stage === "fetch" ? sourceRows(scanId, state) : [];
      await checkpoint(scan, token, state, rows.length ? [db.insert(websiteScanSources).values(rows).onConflictDoNothing()] : []);
    } else if (state.stage === "fetch") {
      const sources = await db.select().from(websiteScanSources).where(eq(websiteScanSources.scanId, scanId));
      const source = sources.find(item => item.status === "pending");
      if (!source) {
        if (state.crawlPhase === "discovery") {
          state.crawlPhase = "deep";
          const rows = sourceRows(scanId, state, sources);
          await checkpoint(scan, token, state, rows.length ? [db.insert(websiteScanSources).values(rows).onConflictDoNothing()] : []);
          return { advanced: true };
        }
        state.evidence = evidenceThreshold(sources.map(item => ({ text: item.text || "", type: item.pageType, contentHash: item.contentHash || item.id })));
        if (!state.evidence.sufficient) { warn(state, "insufficient_evidence_ai_skipped"); state.stage = "finalize"; }
        else state.stage = "ai";
        await checkpoint(scan, token, state, [], { status: "processing", nextRequestAt: null });
      } else {
        const rules = robotsRules(state.robots, state.robotsRoot!);
        const response = await request(scan, token, state, source.url, source.attempts);
        if (!rules.allowed(response.url)) throw new WebsiteFetchError("redirect_robots_disallowed");
        if (transientWebsiteStatus(response.status)) throw new WebsiteFetchError("page_temporarily_unavailable");
        const page = extractWebsitePage(response.body, response.url, response.headers);
        const blocked = response.status !== 200 ? "http_" + response.status : page.blocked;
        if (blocked) warn(state, blocked);
        if (page.truncated) warn(state, "text_truncated");
        for (const warning of page.warnings) warn(state, warning);
        const duplicate = sources.some(item => item.id !== source.id && item.status === "completed" && item.canonicalUrl === page.canonicalUrl);
        const writes: unknown[] = [db.update(websiteScanSources).set({ status: blocked || duplicate ? "skipped" : "completed", attempts: source.attempts + 1, canonicalUrl: page.canonicalUrl, pageType: page.pageType, title: page.title, language: page.language,
          text: blocked || duplicate ? null : page.text, contentHash: page.contentHash, extracted: blocked ? {} : { structured: page.structured, catalog: page.catalog, declaredCanonicalUrl: page.declaredCanonicalUrl, redirects: response.redirects, platform: page.platform, htmlProduct: page.htmlProduct, inventory: page.inventory, warnings: page.warnings, textTruncated: page.truncated }, httpStatus: response.status, bytes: response.bytes, errorCode: blocked || (duplicate ? "duplicate_canonical" : null), fetchedAt: new Date() }).where(eq(websiteScanSources.id, source.id))];
        if (!blocked) {
          const findings = duplicate ? [] : deterministicFindings(source.id, response.url, page.pageType, page);
          if (findings.length) writes.push(findingsInsert(scanId, findings));
          const current = new Set(sources.map(item => canonicalUrl(item.url, scan.websiteUrl)));
          state.candidates.push(...page.links.map(item => ({ ...item, depth: source.depth + 1 })), ...page.catalog.map(item => ({ url: item.url, type: "product", depth: source.depth + 1 })));
          const merged = new Map<string | null, typeof state.candidates[number]>();
          for (const item of state.candidates) {
            const key = canonicalUrl(item.url, scan.websiteUrl), prior = merged.get(key);
            if (!prior || item.depth < prior.depth || prior.type === "other" && item.type !== "other") merged.set(key, { ...item, depth: Math.min(item.depth, prior?.depth ?? item.depth) });
          }
          state.candidates = [...merged.values()].slice(0, SCAN_LIMITS.candidates);
          const updatedSources = sources.map(item => item.id === source.id ? { ...item, pageType: page.pageType, status: blocked || duplicate ? "skipped" : "completed", extracted: { catalog: page.catalog } } : item);
          const rows = state.crawlPhase === "deep" ? [] : sourceRows(scanId, state, updatedSources).filter(item => !current.has(item.canonicalUrl)).slice(0, Math.max(0, SCAN_LIMITS.pages - sources.length));
          if (rows.length) writes.push(db.insert(websiteScanSources).values(rows).onConflictDoNothing());
        }
        await checkpoint(scan, token, state, writes, source.pageType === "home" ? { finalUrl: response.url } : {});
      }
    } else if (state.stage === "ai") {
      const researchSources = await db.select().from(websiteScanSources).where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "completed")));
      let research: Awaited<ReturnType<typeof createResearchMap>> | null = null;
      if (!state.researchSkipped) {
        const stored = await db.select().from(aiRuns).where(and(eq(aiRuns.scanId, scanId), sql`${aiRuns.task} like 'research_%'`));
        let startedRun: { id: string; attempts: number; started: number } | null = null;
        let requested = false;
        try {
          research = await createResearchMap(researchSources.map(source => ({ id: source.id, url: source.canonicalUrl, pageType: source.pageType,
            status: source.status, text: source.text, extracted: source.extracted as Record<string, unknown> })), {
            apiKey: process.env.OPENAI_API_KEY || "", model: String((scan.configuration as { model?: string }).model || "gpt-5-mini"),
            requestBudget: 1, timeoutMs: 35000,
            priorRuns: stored.filter(run => run.status === "completed").map(run => run.output as ResearchRun),
            onStart: async step => {
              const task = step.task + "_" + step.batch;
              const attempts = stored.filter(run => run.task === task).length;
              if (attempts >= 2) throw Object.assign(new Error("research_attempts_exhausted"), { code: "research_attempts_exhausted" });
              const id = crypto.randomUUID();
              await db.batch([
                db.execute(sql`select 1/(case when (select lease_token from website_scans where id=${scanId}::uuid and status='processing' for update)=${token}::uuid then 1 else 0 end)`),
                db.update(aiRuns).set({ status: "failed", errorCode: "interrupted" }).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, task), eq(aiRuns.status, "running"))),
                db.insert(aiRuns).values({ id, clientId, scanId, task, attempt: attempts + 1, model: String((scan.configuration as { model?: string }).model || "gpt-5-mini"),
                  skillName: RESEARCH_MAP_VERSION.skill, skillVersion: RESEARCH_MAP_VERSION.skillVersion, promptVersion: RESEARCH_MAP_VERSION.promptVersion,
                  schemaVersion: RESEARCH_MAP_VERSION.schemaVersion, sourceIds: researchSources.map(source => source.id), inputHash: step.inputHash, status: "running" }),
              ]);
              startedRun = { id, attempts: attempts + 1, started: Date.now() }; requested = true;
            },
            onRun: async run => {
              await checkpoint(scan, token, state, [db.update(aiRuns).set({ status: "completed", output: run, durationMs: run.durationMs,
                inputTokens: run.usage.inputTokens, outputTokens: run.usage.outputTokens, providerRequestId: run.providerRequestId }).where(eq(aiRuns.id, startedRun!.id))]);
            },
          });
          // One provider call per existing lease/chunk; the next advance rebuilds
          // reviewed context from persisted runs without replaying completed work.
          if (requested) return { advanced: true };
        } catch (error) {
          const code = errorCode(error);
          warn(state, "research_" + code);
          const failed = startedRun as { id: string; attempts: number; started: number } | null;
          if (!failed || failed.attempts >= 2) state.researchSkipped = true;
          await checkpoint(scan, token, state, failed ? [db.update(aiRuns).set({ status: "failed", errorCode: code, durationMs: Date.now() - failed.started }).where(eq(aiRuns.id, failed.id))] : [],
            { nextRetryAt: state.researchSkipped ? null : retryAt(failed!.attempts) });
          return { advanced: true };
        }
      }
      if (state.researchSkipped) {
        // Never fall back to AI rewriting operational rules when research fails.
        state.stage = "finalize"; await checkpoint(scan, token, state);
        return { advanced: true };
      }
      const task = AI_TASKS[state.taskIndex];
      if (!task || state.aiAttempts >= SCAN_LIMITS.aiAttempts) { if (task) warn(state, "ai_attempt_budget_exhausted"); state.stage = "finalize"; await checkpoint(scan, token, state); }
      else {
        const sources = await db.select().from(websiteScanSources).where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "completed")));
        const measured = evidenceThreshold(sources.map(item => ({ text: item.text || "", type: item.pageType, contentHash: item.contentHash || item.id })));
        const products = await db.select({ value: websiteFindings.value }).from(websiteFindings).where(and(eq(websiteFindings.scanId, scanId), eq(websiteFindings.key, "product")));
        const productNames = products.flatMap(item => typeof (item.value as { name?: unknown }).name === "string" ? [(item.value as { name: string }).name] : []);
        const prepared = research?.complete ? prepareResearchCandidates(task, research.corpus.chunks, research.items, productNames)
          : prepareAiTask(task, sources.map(item => ({ id: item.id, url: item.canonicalUrl, pageType: item.pageType, text: item.text || "", contentHash: item.contentHash || item.id, productNames })));
        const researchContext = "context" in prepared ? prepared.context : undefined;
        if (!measured.sufficient || !prepared.sufficient) { warn(state, task + "_insufficient_evidence"); state.taskIndex++; await checkpoint(scan, token, state); }
        else {
          const runs = await db.select().from(aiRuns).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, task)));
          const pendingReview = runs.find(run => run.status === "completed" && (run.output as { awaitingEvidenceReview?: boolean } | null)?.awaitingEvidenceReview);
          if (pendingReview && researchContext) {
            const candidates = ((pendingReview.output as { findings: unknown[] }).findings || []).flatMap(row => {
              try { return validateAiFindings({ findings: [row] }, prepared.sources, task, researchContext); } catch { return []; }
            });
            const reviewTask = task + "_evidence_review";
            const reviews = await db.select().from(aiRuns).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, reviewTask)));
            if (reviews.length >= 2) {
              warn(state, task + "_review_attempts_exhausted"); state.taskIndex++;
              await checkpoint(scan, token, state); return { advanced: true };
            }
            const id = crypto.randomUUID(), started = Date.now();
            const model = String((scan.configuration as { model?: string }).model || "gpt-5-mini");
            await db.batch([
              db.execute(sql`select 1/(case when (select lease_token from website_scans where id=${scanId}::uuid and status='processing' for update)=${token}::uuid then 1 else 0 end)`),
              db.update(aiRuns).set({ status: "failed", errorCode: "interrupted" }).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, reviewTask), eq(aiRuns.status, "running"))),
              db.insert(aiRuns).values({ id, clientId, scanId, task: reviewTask, attempt: reviews.length + 1, model, ...FINDING_REVIEW_VERSION,
                sourceIds: candidates.map(f => f.sourceId), inputHash: checksum(findingReviewInput(candidates)), status: "running" }),
            ]);
            try {
              const result = await reviewWebsiteFindings(candidates, model);
              if (result.rejected.length) warn(state, task + "_invalid_findings_rejected");
              state.taskIndex++;
              const writes: unknown[] = [db.update(aiRuns).set({ status: "completed", output: result.output, durationMs: Date.now() - started,
                inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, providerRequestId: result.providerRequestId }).where(eq(aiRuns.id, id))];
              if (result.findings.length) writes.push(findingsInsert(scanId, result.findings, id));
              await checkpoint(scan, token, state, writes);
            } catch (error) {
              warn(state, task + "_" + errorCode(error));
              await checkpoint(scan, token, state, [db.update(aiRuns).set({ status: "failed", errorCode: errorCode(error), durationMs: Date.now() - started,
                ...(error instanceof WebsiteAiError ? { inputTokens: error.usage?.input_tokens, outputTokens: error.usage?.output_tokens, providerRequestId: error.providerRequestId } : {}),
              }).where(eq(aiRuns.id, id))], { nextRetryAt: retryAt(reviews.length + 1) });
            }
            return { advanced: true };
          }
          if (runs.some(run => run.status === "completed") || runs.length >= 2) { if (runs.length >= 2) warn(state, task + "_attempts_exhausted"); state.taskIndex++; await checkpoint(scan, token, state); }
          else {
            const id = crypto.randomUUID();
            const model = String((scan.configuration as { model?: string }).model || "gpt-5-mini");
            state.aiAttempts++;
            await db.batch([
              db.execute(sql`select 1/(case when (select lease_token from website_scans where id=${scanId}::uuid for update)=${token}::uuid then 1 else 0 end)`),
              db.update(aiRuns).set({ status: "failed", errorCode: "interrupted" }).where(and(eq(aiRuns.scanId, scanId), eq(aiRuns.task, task), eq(aiRuns.status, "running"))),
              db.insert(aiRuns).values({ id, clientId, scanId, task, attempt: runs.length + 1, model, ...WEBSITE_AI_VERSION, sourceIds: prepared.sources.map(item => item.id), inputHash: checksum(aiInput(task, prepared.sources, researchContext)), status: "running" }),
              db.update(websiteScans).set({ state }).where(eq(websiteScans.id, scanId)),
            ]);
            const started = Date.now();
            try {
              const result = await interpretWebsite(task, prepared.sources, model, researchContext);
              if (result.rejected) warn(state, task + "_invalid_findings_rejected");
              if (!researchContext) state.taskIndex++;
              const writes: unknown[] = [db.update(aiRuns).set({ status: "completed", output: researchContext ? { ...result.output, awaitingEvidenceReview: true } : result.output, durationMs: Date.now() - started, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, providerRequestId: result.providerRequestId }).where(eq(aiRuns.id, id))];
              if (!researchContext && result.findings.length) writes.push(findingsInsert(scanId, result.findings, id));
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
      if (code === "chunk_budget") {
        // A robots delay is a checkpoint boundary, not a failed source/retry.
        await checkpoint(scan, token, state);
        return { advanced: true };
      }
      delete state.request;
      if (state.stage === "fetch") {
        const [source] = await db.select().from(websiteScanSources).where(and(eq(websiteScanSources.scanId, scanId), eq(websiteScanSources.status, "pending"))).limit(1);
        if (source) {
          const attempts = source.attempts + 1;
          if (attempts >= 2 || code === "request_budget_or_lease") warn(state, code);
          await checkpoint(scan, token, state, [db.update(websiteScanSources).set({ attempts, status: attempts >= 2 || code === "request_budget_or_lease" ? "failed" : "pending", errorCode: code }).where(eq(websiteScanSources.id, source.id))], { nextRetryAt: attempts < 2 ? retryAt(attempts) : null });
        } else await finish(scan, token, state, code);
      } else if (state.stage === "sitemaps") {
        const attempts = scan.stepAttempts + 1;
        if (attempts >= 2) {
          warn(state, "sitemap_" + code);
          const target = state.sitemapQueue.shift();
          if (target) state.sitemapVisited.push(target);
        }
        await checkpoint(scan, token, state, [], { stepAttempts: attempts < 2 ? attempts : 0, nextRetryAt: retryAt(attempts) });
      } else if (scan.stepAttempts < 1 && state.stage === "bootstrap") await checkpoint(scan, token, state, [], { stepAttempts: scan.stepAttempts + 1, nextRetryAt: retryAt(scan.stepAttempts + 1) });
      else await finish(scan, token, state, code);
    } catch { /* Lost leases/cancellation cannot overwrite newer state; interrupted work is resumable. */ }
  }
  return { advanced: true };
}
