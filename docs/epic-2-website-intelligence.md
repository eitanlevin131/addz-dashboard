# Epic 2 - Website Intelligence

## Approved scope and boundaries

Extend the existing ADDZ dashboard, clients, auth, workspace and audit infrastructure.
Website findings are public-site observations, not verified client truth or Brand Brain.
No questionnaire, strategy/copy generation, client-facing scan UI, recurring scans,
browser rendering service, queue infrastructure or Production migration/deployment.

## Initial onboarding scan

New client + explicitly supplied valid website -> persisted initial scan -> first
processing chunk after commit. Client/scan/requested events must be atomic. Cover
both client-creation entry points; attaching Flashy to an existing client does not
trigger an initial scan. Never silently copy a Flashy website into client data.
No Flashy/package prerequisite. Site failures do not undo a committed client.
Existing clients and subsequent scans are manually requested.

## Persisted execution

Use short, bounded Node 22 chunks started through Next.js after(), with DB leases,
fencing tokens, checkpoints and retry timestamps. Progress is never browser-only.
An open workspace can advance work; after interruption it shows Continue Scan.
Completion with the UI closed is not guaranteed. Future durable workers can invoke
the same step executor without changing the scan/state model.

## Evidence and review contract

Preserve typed value, category/key, source metadata/evidence, observed/inferred,
confidence, scan identity and scanner/model/prompt/skill/schema versions.
Review metadata is independent: normal, needs_review, ignored. It cannot edit the
value, evidence, confidence or observed/inferred classification.
Future-consumer contract: ignored is excluded by default; needs_review remains
available with an explicit unresolved flag; normal is available normally.
No downstream questionnaire or Brand Brain consumption is implemented here.

## Minimum evidence threshold (required before AI)

Run AI only when at least two distinct useful content pages contribute at least
2,000 non-boilerplate characters in total, including at least one brand/product/
category page. Each AI task additionally requires at least two relevant evidence
blocks and 500 relevant characters. Challenge/login/JS shells and repeated footer
content never count. Insufficient categories are skipped, not fabricated.
Keep useful deterministic findings and finish completed_with_warnings if possible;
otherwise fail with insufficient_evidence. Record measured coverage and the reason.

## Mandatory SSRF / DNS-rebinding gate

Validate all HTTP(S) destinations, redirects and IPv4/IPv6 addresses; reject private,
loopback, link-local, metadata, multicast, reserved and unsupported destinations.
Resolve and pin the approved destination to the actual TCP/TLS connection, preserve
original Host/SNI/certificate verification, and prevent implicit re-resolution or
unsafe socket reuse. Hostname-only checks are not sufficient.
Before declaring safe-fetch complete, test connect-time enforcement on Node 22 and
validate runtime compatibility with Vercel Node. If protection cannot reliably be
enforced, STOP and report limitation, remaining attack path and smallest alternative.

## Crawl, storage and AI budgets

20 HTML pages, depth 2, 6 sitemap documents, 2,000 discovered candidates, 60 network
attempts including redirects/retries. Respect robots/noindex; no access bypass.
10-second request deadline, five redirects, bounded compressed/decompressed bytes.
Persist useful capped text, structured extraction, evidence and hashes, not full
HTML archives, scripts/cookies/images or Blob uploads. Retain scan history.
Four bounded AI categories; strict structured outputs, source validation, timeouts,
versioned registry, attempt/usage observability and no mutation of existing AI memory.
Partial failures preserve completed sources/tasks; re-scans create new versions.

## UI, events and validation

Staff-only Hebrew/RTL Website Intelligence workspace tab, sources/evidence,
warnings, history, resume/cancel/re-scan and independent review dispositions.
Reuse audit_logs for requested/started/completed/completed_with_warnings/failed,
cancelled and review_tagged events with atomic lifecycle transitions.
Validate Node 22 unit/lint/build and isolated E2E, security, resumability/concurrency,
all platform fixtures and existing dashboard regressions. External providers are
mocked for E2E and production resources must never be mutated.
Final pilot: synthetic Client and isolated DB, scanning a REAL public ecommerce
site. Report discovery/processed counts, robots/sitemap/redirect behavior, warnings,
deterministic/AI findings, observed/inferred, evidence quality, duration and usage.
Do not use a Production client for the pilot.

## Implementation record

Implemented on `codex/addz-os-epic-2`, extending Epic 1 baseline
`63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c`. No Production changes or Git push.
Detailed validation, pilot, limitations and proposed release sequence are recorded
in [Epic 2 validation](epic-2-validation.md).

### Additive persistence

Migration `0019_website_intelligence.sql` adds `website_scans`,
`website_scan_sources`, `website_findings` and reusable `ai_runs`.
No existing business table, auth model, reporting calculation or package field
changes. Scans belong to clients; composite foreign keys prevent cross-client
history and cross-scan source/AI evidence references. A partial unique index
prevents concurrent active scans for one client.

The previous-scan and finding-to-AI-run references are DEFERRABLE INITIALLY
DEFERRED in SQL. This preserves restrictive evidence references while allowing
the existing complete-client cascade to finish atomically. Drizzle cannot express
these clauses in its snapshot; retain and review them in future migrations.

### Implemented processing

Persisted stages: bootstrap -> sitemaps -> fetch -> ai -> finalize. CAS leases
last 90 seconds. Every checkpoint fences the current token with a row lock,
and writes progress/findings/events atomically. Network/provider calls never
hold database transactions. Cancellation revokes the token; stale workers cannot
publish. Requests, crawl delay, retry deadlines and source/task attempts persist.
One failed source or AI category preserves other successful results.

### Implemented evidence boundary

HTML/JSON-LD extraction is deterministic. Four versioned AI tasks use strict
JSON schemas and source IDs, with exact supporting-quote validation and task/key
allowlists. Invalid rows are rejected; a wholly invalid task fails/retries.
Inferred confidence is capped at medium. Refusal/incomplete output is never
published as a finding. Source URL, page type, quote/locator, scan, model and
prompt/skill/schema versions remain traceable.

Scraped text is a JSON user-data payload explicitly labelled untrusted, not
system/developer instructions. The model cannot browse, execute tools, send
messages, create campaigns or mutate clients. Exact quote presence proves source
presence, not semantic entailment: internal human review remains necessary.

### Implemented security gate

The Node agent resolves once, rejects every non-public DNS answer, then dials
the approved numeric IP directly. Host/SNI and TLS certificate validation retain
the original hostname. HTTP receives the socket only after its actual peer is
validated. Connections are not reused. Redirects are explicit, same-site only,
re-resolved and revalidated; root/www aliases are allowed.
DNS/request limits, compressed/decompressed byte limits and MIME limits apply.
No custom XML entities/DOCTYPE, cookies, authenticated pages or access bypass.
Standard sitemap XML escapes are decoded after declaration rejection.
Connect-time tests and real HTTPS/redirect requests passed on Node 22. Vercel
Node API compatibility was reviewed during local implementation. The subsequent
isolated Vercel Preview canary is documented in
`docs/epic-2-preview-validation.md`, including the limits of runtime security
testing. This is not approval for a Production deployment.

### Targeted ecommerce quality refinement (isolated validation)

URL identities normalize UTF-8 escape case, unreserved encodings, trailing slashes
and tracking parameters while preserving path case, encoded separators and variant
queries. Same-site canonical declarations participate in duplicate detection.
Page roles combine URL/title/headings, JSON-LD, OpenGraph and product form/price
signals. A shop child is a product candidate, not automatically a category; fetched
semantics correct provisional roles. Questionnaire pages do not become reviews.
Coverage reserves slots for undiscovered brand/product/policy/support pages within
the original 20-page/60-request budgets.
General terms/conditions pages are provisional policy candidates. They count as
returns sources only if fetched main content explicitly supports refund/cancellation
policy; otherwise they remain other, not an invented refund policy.

Validated redirect continuation persists in scan state before the next network
hop. Long robots delays release the lease at a checkpoint rather than consuming a
source retry or discarding a sitemap. Every resumed hop revalidates URL scope,
robots, DNS answers and the pinned TCP/TLS peer. No security bypass was introduced.

Scanner version website-v3 identifies the new extraction/crawl behavior. Historical
results remain readable; an unfinished older-version scan must be re-run rather
than silently mixing extraction versions in one history record.
AI schema/prompt/registry version 3 binds category/key pairs. Published observed
AI summaries and details must be extractive substrings of their own evidence.
Partial citations with extra claims are rejected, not relabelled as facts. Audience
motives, desires, pains, positioning, values, tone and use-case interpretations are
inferred with confidence capped at medium. Factual details attached to an inference
must also be extractive substrings of its own evidence; interpretations belong only
in its summary. The prompt requests at most four short atomic findings, raw copied
text without added quote wrappers, and empty detail arrays unless fully supported.
Inference relevance still requires human
review; these guards do not claim to solve arbitrary semantic entailment. No new
Skill, questionnaire, external verifier, schema migration or infrastructure is added.

The first refined public-site run exposed custom product-price markup without
Product JSON-LD or standard WooCommerce price selectors. A conservative fallback
reads only a currency-labelled price directly adjacent to the primary product
heading in extracted main text, retaining ranges/starting-price qualifiers and
never searching later recommendations, per-unit prices or shipping thresholds.
Article/BlogPosting and WordPress blog taxonomy signals prevent culinary content
archives from being mistaken for ecommerce product collections.
HTML variants require a form structurally owned by the primary product. Related
product forms and ambiguous dropdowns are excluded, rather than attached to the
current SKU. JSON-LD offer variants remain associated with their declared Product.

### Internal workspace

The existing Client Workspace gains a Hebrew/RTL scan tab with status, history,
resume/cancel/re-scan, category/review filters, immutable finding classification,
confidence, collapsible source/evidence and source/run diagnostics. Long policy
text is collapsed. Owner/admin/agency access reuses existing team authorization;
client users are denied by the API, not just hidden navigation.

### Storage and intentional deferrals

Store capped useful text (20,000 characters/page), bounded structured extraction,
hashes, evidence and versioned AI results/usage. No HTML/image/Blob archives.
History is retained; no automatic purge/diff UI or recurring scan was added.
Reliable visual rendering/color analysis is deferred, rather than turning CSS
tokens into asserted brand colors. JavaScript-only/login/challenge pages yield
explicit limitations; no browser rendering fallback or queue was introduced.

### Requester terminal notifications

Completed/completed-with-warnings/failed checkpoints atomically enqueue an internal
notification in the existing scan state JSON; no additional migration is needed.
Only the requesting active owner/admin/agency user is eligible, never client
contacts, client users or a fallback owner address. The email contains the client
name, terminal status, a safe fixed failure/coverage summary and an authenticated
workspace deep link to the original scan. No source text or raw exception is sent.

Delivery uses an independent CAS lease and stable Resend idempotency key. Retries
are bounded to three attempts within 23 hours, on subsequent advance requests;
there is no new background queue or guarantee of recovery while the UI is closed.
Delivery failures do not alter scan results. Real delivery requires explicit
`WEBSITE_SCAN_EMAIL_ENABLED=true`, Resend/from and a configured application URL.
Vercel Preview is always email-disabled; isolated E2E uses the mock email provider.

### Research Map V1 contract

#### Authority and revised quality gate

Website Intelligence -> Smart Client Questionnaire -> kickoff/characterization
meeting -> approved characterization/Brand Brain is the future onboarding flow.
Authority levels are `website_observed`, `website_inferred`,
`client_questionnaire`, `kickoff_confirmed`, `approved_brand_brain`. Later
confirmation may refine or contradict website observations. Disagreement is
useful onboarding information, not automatically a website scan failure.
This contract requires no new schema and implements none of the later stages.

Deterministic research preserves original product/price structures, complete
policy evidence, dates, contact and inventory signals without AI rewriting.
Unresolved qualifier binding stays unresolved: a raw clause is not a normalized
shipping guarantee or a current offer. Different source signals are retained,
not automatically resolved. Source/chunk context remains available in full.

AI research uses non-legal business content for descriptions and useful strategic
hypotheses. Positioning, audience generalizations, pains, desires, tone and
messaging interpretations default to inferred and require client confirmation.
A practical product benefit may motivate a useful inferred need, but cannot
prove an observed customer problem. Legal boilerplate is not brand evidence.
No advice, strategy, questionnaire or final truth is generated.

Stage 1 passes with exact deterministic evidence/provenance, correctly labelled
useful hypotheses, no material invention and no legal contamination. It does not
require hypotheses to replace client confirmation. Only after both saved-site
pilots pass may research guide finding candidates, never serve as their evidence.
Original chunks remain authoritative; observed factual/type entailment and
commercial-condition gates remain unchanged. Unknowns are evaluated only against
the complete processed corpus and do not assert absence from the entire website.

Research is internal, non-publishable working context, not verified client truth.
Batch extraction collects atomic observations and supported, labelled hypotheses.
Commercial/operational rules retain verbatim, chunk-linked qualifier clauses:
method, threshold, price, timeframe, condition, scope and historical context.
Different methods, scopes, periods and eligibility are separate observations;
deterministic consolidation includes qualifiers in its identity and unions every
contributing source reference without rewriting claims.

Contradiction resolution and global absence analysis are deferred. Batches have
no contradiction, unknown or missing category, and empty category coverage means
only that no accepted research item was produced, not that the website lacks it.
Tone interpretations default to inferred hypotheses; observed tone requires a
direct cited self-description of the brand's voice. Research never substitutes
for original evidence or weakens the strict published-finding validation gates.
There is no schema or crawler change. Research items never publish automatically.

#### Candidate and evidence validation execution

Only a completed, reviewed Research Map guides candidate generation. The bounded
candidate menu uses immutable original sentence spans and samples early, middle
and late content. The model selects a reference; the application attaches the
original source and quote without allowing model-written evidence. Observed
values are extractive; strategic inferred values retain explicit uncertainty.
Operational rules and variants stay in deterministic extraction, not this AI path.

Candidate generation and reject-only factual/semantic entailment review are
separate persisted steps in the existing `ai_runs`/lease/checkpoint architecture.
Each processing chunk performs at most one provider request. Research requests
and finding review use 35-second timeouts; candidate generation retains the
40-second limit. Generation does not publish before a complete, valid review.
The reviewer may only retain or reject immutable candidates; it cannot author,
edit or promote them. Missing, duplicate or inconsistent decisions fail closed.
Both steps keep original source evidence, model/version, input hash, output,
usage and retry history. Checkpoint fencing protects publication against expired
leases and cancellation. Research failure finishes with deterministic findings
and warnings rather than falling back to AI-authored operational facts.

This quality improvement requires a fresh final regression/runtime release gate;
the earlier Preview validation is not validation of this modified pipeline.
