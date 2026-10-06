# Epic 2 Final Release Gate

Date: 2026-10-05. Branch: `codex/addz-os-epic-2`.
Tested state: HEAD `0de7bbb` plus the existing uncommitted Epic 2 Research
Intelligence implementation and the narrowly scoped gate fixes below.
No application push, deployment, Production migration or Production write.

## Decision

**NO-GO for Production.** Functional tests passing is not sufficient when the
fresh real-AI scan publishes known unsupported or semantically misclassified
findings. The future questionnaire may resolve genuine hypotheses, but it must
not be used to excuse ungrounded published claims or incorrect taxonomy.

## Full Quality Suite

Node `22.23.3`, sanitized application export, Production-like build/start.

| Check | Result |
| --- | --- |
| Full unit suite | 260 passed, 0 failed, 0 skipped |
| ESLint | 0 errors; 3 unused-variable warnings |
| Next.js production build and TypeScript | Passed; 16.96 seconds |
| Full existing Playwright suite | 7 passed, 0 failed; 405.776 seconds |
| Production-derived integration regression | 1 passed, 0 failed; 60.625 seconds |
| Completed-scan desktop/mobile inspection | 1 passed, 0 failed; 16.117 seconds |
| Negative database constraint probes | 11/11 passed; transaction rolled back |

Initial unit failures identified stale test imports and incomplete mock evidence;
the harness/fixtures were updated and the complete suite rerun. Website E2E mocks
were extended to cover the Research Map and reject-only review stages, rather
than bypassing validation. An initial full-suite and pilot UI failure was an
artifact-directory collision, not a dashboard assertion failure. Dedicated
artifact directories resolved it; the complete seven-test suite then passed.

## Isolation and Migration

- Isolated host: `ep-floral-morning-apttpdqw.c-7.us-east-1.aws.neon.tech`.
- Existing rehearsal branch: `br-long-star-apv42mqb`.
- Gate-only database: `addz_epic2_release_gate_20261005`.
- Restored the previously verified portable Production-state backup into this
  new disposable database; original 26-table row hashes/schema matched.
- Applied only approved `0019_website_intelligence.sql`, in one transaction with
  fail-fast baseline/final assertions, `lock_timeout=5s`, `statement_timeout=60s`.
- Migration SHA-256:
  `0b0c72d1a28c0600fa8aab96c6021a74b355c99f7f6a006f6065b14af1ec806d`.
- Four additive tables, 76 columns; FKs/indexes/defaults/checks matched the
  previously approved rehearsal schema. Schema fingerprint:
  `1ccde985ebaf646f547ea134bd7f8834ce7b314f351a2eb5e26aaa0e8c311bd1`.
- No schema/migration delta relative to the approved Epic 2 schema. No new
  migration created; no historical migration replay or `db:push`.
- Migration immediately preserved all 26 legacy table hashes. Final original-row
  integrity and cleanup confirmation will be captured below.
- Real AI used the protected dedicated Preview credential, never the Production
  credential. Flashy and Resend were local mocks; Blob writes disabled. No Cron
  scheduler or live customer messaging was triggered.
- No Vercel Preview deployment or configuration change was needed for this
  Production-style isolated run.

## Fresh Ayelet End-to-End Run

Synthetic client only; public website `https://ayeletspices.co.il/`.
Scan ID: `bba98fdf-a113-4dfd-9084-862c764c10d4`.

| Measure | Result |
| --- | ---: |
| Wall-clock orchestration duration | 360,854 ms (6m 01s) |
| Discovered candidates / selected / completed sources | 544 / 20 / 20 |
| Website requests / duplicate selected canonical URLs | 29 / 0 |
| Deterministic findings / published AI findings | 40 / 8 |
| AI observed / inferred | 5 / 3 |
| Generated AI candidates / not published | 16 / 8 |
| Accepted internal Research Map items | 24 across 3 batches |
| AI calls / longest AI call | 14 / 20,727 ms |
| AI input / output tokens | 211,890 / 8,637 |
| Missing published provenance references | 0 |

Final lifecycle: `completed_with_warnings`. The entire crawl -> extraction ->
chunk assembly -> Research Map/review -> candidates -> evidence review -> final
publication path ran. Cap warning was `crawl_delay_capped:120:5`.
FAQ, shipping, returns and support sources were processed. Six products were
extracted: five individual spice mixes at ILS 20; the bundle's structured price
was unavailable and stayed null. Variants unavailable in public fetched data
stayed empty. No new unconditional shipping or discount AI claim was published.
Other warnings: stored-text truncation and rejected candidates in all four AI
tasks. Exact provider-billed cost was not obtained; actual token counts are
reported instead of an unverified price estimate.

### Manual Review of Every Published AI Finding

| Finding | Result | Evidence assessment |
| --- | --- | --- |
| Brand description | PASS | Direct quoted family/boutique business claim |
| Brand history | PASS | 2014 date and stated purpose retained |
| Quality/freshness differentiator claim | PASS | Original brand claim, not independent verification |
| Product taste/ingredient benefit | PASS | Direct product-page claim |
| Likely dietary audiences | FAIL | Cited mission does not support vegan, vegetarian or gluten-avoidance segments |
| Desired easier cooking outcome | FAIL | Easier-cooking hypothesis is plausible, but shorter duration/novice qualifiers are unsupported by its citation |
| Product categories | FAIL | Bundle contents/QR card description is not product-group taxonomy |
| Product benefit about visible storage | FAIL | Storage advice relabeled as product benefit and extended to daily frequency |

All eight have source references. The failure is semantic entailment, not missing
URLs. Automated review accepted the four failing entries; therefore it is not a
sufficient release-quality gate on its own. No findings were deleted or rewritten
to manufacture a passing result.

## Spicehaus Saved-Source Regression

No crawl and no new provider call. Current validators replayed the persisted
approved candidates/review outputs: 20 source records, 15 completed, 38 chunks,
29 deterministic findings, 5 AI findings (3 observed / 2 inferred).
Nine candidates failed deterministic validation and two were excluded by the
saved review: 11 total excluded. Full returns clauses remain in source evidence;
inventory conflicts remain non-definitive; unavailable variants remain a coverage
limitation. Both completed `/collections/` sources previously stored as FAQ
classify as `category` using the current structured Shopify signals.

Automated replay accepts all five previously accepted findings. Manual review
passes brand history, historical awards, differentiation claim and inferred
premium/mixology positioning. The tone hypothesis is partly reasonable, but
its statement about practical instructions across the site exceeds the cited
support invitation. This is an additional manual quality caveat, not a crawler
regression, and the earlier manual PASS should not override the new inspection.

## Security and Regression Boundaries

The passing unit/E2E tests cover SSRF private/loopback/link-local/metadata/IPv4/
IPv6 targets, DNS pinning and connect-time destination checks, redirect safety,
robots/Disallow, response limits, malformed content, original evidence validation,
leases/concurrency, retries/backoff, interruption/resume, history, review tags,
cancel, sparse/challenge/partial outcomes and team-only Website Intelligence.
Existing suite covers client create/edit, packages and negotiated prices/scope,
contacts, Flashy mock sync, reporting, planner, summaries, AI/history and client
report access without internal commercial-field exposure.

Website text is data, not instructions; AI requests expose no executable tools.
No scraped JavaScript is executed. A scan of 22 top-level JSON/log artifacts found
zero known credential leakage. Synthetic Playwright sessions are not evidence
of a new real Production login test. New Research changes were validated on
Node 22 Production-style runtime, not redeployed to Vercel during this gate.

## Narrow Gate Fixes

The one application fix makes Research Map provider calls respect
`OPENAI_API_BASE_URL`, matching the existing AI paths. Previously hard-coded
provider routing could bypass isolated mocks. A targeted test covers isolated
base URL and credential absence from the request body.

Test-only changes update worker import mocks, complete evidence fixtures and
Research/candidate/review mock outputs and assertions. No evidence rule, crawler
behavior, taxonomy, schema or architecture was loosened or redesigned.

## Final Integrity / Production / Cleanup

The Production-derived regression verified all 11 original client profiles,
packages/pricing/scope/owners/contacts, 9 active Flashy-linked accounts, 49 planner
items, 11 summaries and 93 client-scoped history messages. Reporting APIs loaded
510 email, 405 SMS and 14,969 automation records; inactive-account filtering means
these API counts are not the full raw-table counts. Synthetic client-role access
remained restricted to assigned reporting and excluded internal fields/routes.

Original-row hashes remained unchanged in 25 of 26 legacy tables. The only
exception was two original login-code rows removed by existing seven-day auth
retention during synthetic logins. A dedicated read-only investigation confirmed
both rows were older than seven days when the gate began; the exact existing
path is `src/lib/auth/email-code.ts:87`. The initial strict integrity checker
reported this exception; it was investigated, not hidden or attributed to a
migration. Client/reporting/commercial/contact data was not changed. The
migration itself preserved all 26 table hashes before any login tests.

Loaded desktop/mobile screenshots, with 48 findings and 20/20 sources visible,
are retained under `output/playwright/epic2-release-gate-20261005/`. The inspection
also opened source evidence and verified mobile document-width bounds.

Final read-only Production verification at 17:07 UTC confirmed canonical project
`addz-dashboard`, branch `main`, deployment
`dpl_2PknjjSeRxTZdZsWwTcUt92nwJW5`, commit
`63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c`, verified endpoint
`ep-bold-union-api79m0y`. Schema, all 26 table row/count markers and integrity
checks were identical at the beginning and end of this gate. Normal live activity
had changed a few counts before the gate relative to the older backup (chat,
login, audit and change notes), not during the gate; any future rollout still
requires a fresh preflight and recovery point.

The disposable `addz_epic2_release_gate_20261005` database was removed and its
absence verified. All intentional rehearsal/development/recovery infrastructure
was preserved. No Preview deployment or deployed diagnostic was created, so
there was none to remove. The generated application export, temporary gate
harnesses and synthetic session trace artifacts were removed; private evidence
logs/aggregate results and synthetic public-site screenshots are retained.
No code/configuration was pushed or deployed during the gate. A final comparison
of 135 application source files against the tested export found no unvalidated
code drift (excluding the explicitly documented isolated fixture-host mapping).

## Required Before Another GO Decision

Resolve only the reproduced publication-boundary failures: unsupported inference
qualifiers, category/type entailment (including bundle/storage semantics), and
overstated tone claims. Add regression examples using saved source evidence;
do not broaden crawling, invent questionnaire/Brand Brain features or add a
schema migration. Repeat targeted saved-source real-AI validation plus the final
release checks required by any resulting changes.

No Production rollout is authorized by this NO-GO report. After a passing gate,
the existing additive rollout order remains fresh identity/schema/data preflight,
fresh recovery branch and portable backup, atomic reviewed `0019`, schema/legacy
verification, exact approved application commit, controlled smoke tests, runtime
observation. Application rollback would retain the additive schema and records.
