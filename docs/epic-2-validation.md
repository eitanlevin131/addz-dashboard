# Epic 2 - Isolated implementation and validation

Date: 2026-10-04. Branch: `codex/addz-os-epic-2`.
Baseline: `63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c`.
Status: implemented locally; no Production migration, deployment, configuration
change or push. Epic 3 remains out of scope.

## Environment and migration

- Neon project: `icy-dawn-73041521`.
- Isolated preserved branch: `br-quiet-fire-aps0ikjd`
  (`addz-epic1-rehearsal-20261004`).
- Endpoint: `ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech`.
- New EMPTY database `addz_epic2_validation`: synthetic test/pilot clients only.
- Separate new EMPTY database `addz_epic2_migration_validation`: final migration
  verification with one synthetic baseline client.
- The verified Production endpoint `ep-bold-union-api79m0y` was never a test
  target. The existing local E2E URL pointed to that Production branch and was
  deliberately NOT used.

The approved baseline schema was exported from the baseline commit into empty
databases. This is an isolated synthetic validation, NOT a rehearsal over a fresh
copy of Production business rows. No historical migrations were replayed.
The exact final `0019_website_intelligence.sql` was executed atomically with
`lock_timeout=5s`, `statement_timeout=60s` and fail-fast target/schema assertions.

Verified: 26 -> 30 public tables; 76 new columns; 21 validated constraints;
14 indexes including primary/unique constraint indexes; both custom deferrable
references initially deferred. The synthetic pre-existing client record hash
remained unchanged. Existing tables are untouched by 0019.
Active-client uniqueness, cross-scan evidence foreign keys, previous scan history
and full-client cascade behavior were exercised by isolated tests.

## Architecture and files

| Area | Files / behavior |
| --- | --- |
| Specification | `docs/epic-2-website-intelligence.md` |
| Schema | `src/lib/schema.ts`, `db/migrations/0019_website_intelligence.sql`, migration snapshot/journal |
| Network | `src/lib/website-intelligence/safe-fetch.ts`: pinned TCP/TLS, peer validation, safe redirects, size/time/MIME limits |
| Extraction | `extraction.ts`: robots, sitemap XML, canonical URLs, quotas, HTML/JSON-LD, evidence threshold |
| AI | `ai.ts`, `config.ts`: structured/versioned tasks, exact evidence validation, partial-row rejection, refusal and usage |
| Persistence | `repository.ts`, `state.ts`: ownership, immutable finding metadata, CAS state/leases, history |
| Execution | `worker.ts`: bounded persisted phases, fencing, backoff, cancellation, audit transitions |
| APIs | Client-scoped website-scans and website-findings routes; Node runtime; existing team access |
| Onboarding | `clients.ts`, client-create/live-client APIs, existing onboarding wizard: optional explicit website and atomic initial scan |
| Workspace | `client-workspace.tsx`, `website-intelligence.tsx`: internal Hebrew/RTL tab |
| Tests | website unit/security tests, `e2e/website-intelligence.spec.ts`, existing regression suite |
| Safety tools | `scripts/epic2-isolated-setup.mjs`, validation/pilot/local-preview scripts; hardcoded isolated target guards |

## API surface

- GET/POST `/api/clients/[id]/website-scans`.
- GET `/api/clients/[id]/website-scans/[scanId]`.
- POST scan `/advance` and `/cancel`.
- PATCH `/api/clients/[id]/website-findings/[findingId]`: review disposition only.

Mutations check same-origin requests. All IDs are checked against client/scan
ownership. The existing suspended/stale-session checks remain in force. Existing
auth, routing shell, commercial model and reporting behavior are not rewritten.

## Validation results

Runtime: Node **22.23.3**.

- `npm run test:unit`: **134/134 passed**.
- `npm run lint`: **passed**, zero errors/warnings.
- `npm run build`: **passed**, optimized build and TypeScript.
- Final full isolated Chrome E2E: **7/7 passed (4.4 minutes)** after the sitemap
  escape correction. The earlier full run also passed.
- Additional screenshot/automatic-onboarding journey: **1/1 passed**.
- `git diff --check`: passed.
- Production dependency audit: zero reported vulnerabilities. The full dependency
  audit reported development-tool vulnerabilities; no unrelated force-upgrade
  was performed.

Unit coverage includes private/internal IPv4/IPv6, mapped addresses, mixed DNS
answers, rebinding/peer mismatch, actual agent connection arguments, redirect
validation, robots/www aliases, sitemap entity/declaration handling, malformed
HTML/JSON-LD, Shopify/Wix/WooCommerce-style fixtures, challenge/JS/noindex,
deterministic extraction, evidence thresholds, AI refusal/structured/partial
validation, inference confidence, leases/backoff and disposition contracts.

E2E covers automatic initial scan creation, continuation after pause, evidence
links, review immutability, history/re-scan, cancellation, concurrent advances,
expired leases, retrying sources, sparse-content AI skip, partial completion,
blocked-site failure, team-only API access, mobile/RTL and no horizontal overflow.
Regression covers Epic 1 client/package/contact/Flashy-linking flows, login,
account/range changes, mock sync, reports, Gantt, summaries/delivery mocks,
grounded AI/history and assigned client-only access.

For E2E all Flashy, email and OpenAI calls use local mocks. Blob credentials are
empty, cron secret is synthetic, identities are synthetic. The real-site pilot
uses live public HTTP and OpenAI only; it performs no Flashy synchronization,
customer messaging or uploads. No Vercel settings were changed.

## Screenshots

Generated by isolated Chrome E2E, not edited mockups:

- `output/playwright/epic2/website-desktop.png` and `website-desktop-full.png`.
- `output/playwright/epic2/website-mobile.png` and `website-mobile-full.png`.
- `output/playwright/epic2/website-paused.png`: persisted pause / Continue Scan.

## Final real-site pilot

Completed 2026-10-04 15:17:34 UTC, after the final sitemap XML escape correction.
Public ecommerce site: `https://pipandnut.com/` (real root -> www redirect).
Synthetic client: `732aff2e-8ab6-4b3c-9f74-72ab6012b4c0`.
Scan: `059c3215-3ac8-48fb-8a7b-13c4dec11579`.
Database: isolated `addz_epic2_validation`; no Production client involved.

| Measurement | Result |
| --- | --- |
| Final status | completed_with_warnings |
| Discovered candidate URLs | 92 |
| Selected sources | 19 |
| Processed pages | 17 |
| Useful evidence | 17 distinct pages / 108,469 characters |
| Sitemap documents visited | 6, including index + Shopify-style product/page/collection maps |
| Robots | fetched; 1-second crawl delay respected |
| Network requests including redirects | 29 |
| Deterministic findings | 31 |
| Accepted AI findings | 17 |
| Observed / inferred | 43 / 5 |
| Duration | 194,335 ms (3 min 14 sec) |
| AI model | gpt-5-mini |
| AI attempts | 5; all four categories ultimately completed |
| Input / output tokens | 24,106 / 5,221 |
| Approximate final-run AI cost | USD 0.01647 |

Cost estimate uses the model's listed USD 0.25/million input and USD 2/million
output prices: [official GPT-5 mini model page](https://developers.openai.com/api/docs/models/gpt-5-mini).
Includes failed attempt usage for this final run; excludes prior exploratory
runs, storage/compute and any account-specific billing adjustments.

Warnings: `javascript_required`, `text_truncated`, `brand_voice_invalid_ai_evidence`,
`brand_voice_invalid_findings_rejected`, `products_commercial_invalid_findings_rejected`,
`differentiation_operations_invalid_findings_rejected`. Invalid evidence in the
first brand task attempt was rejected; the retry completed. Invalid individual
rows in otherwise useful outputs were rejected rather than published.
Two selected pages were unusable JavaScript shells; other sources/results survived.

Accepted AI findings have validated source references and supporting quotes;
deterministic findings have title/main/JSON-LD locators. The complete public-site
pilot report is retained locally in `.tmp/epic2/pilot-report.json` without database
credentials. Earlier exploratory runs are not substituted for these final counts.

## Security and limitations

The SSRF implementation gate passed local Node 22 connect-time tests and a real
HTTPS root/www redirect. It does not rely on hostname-only validation. Vercel's
[Node runtime API compatibility](https://vercel.com/docs/functions/runtimes/node-js)
was reviewed; empirical Vercel Preview execution is still pending, because this
task did not deploy anywhere.

Exact supporting quotes prove that evidence exists in a selected source, not
that every interpretation is semantically correct. Findings remain observations
or inferences, never verified client truth. Human review is still necessary.
Some valid-but-paraphrased AI quotes are rejected conservatively; no invalid quote
is silently accepted. No visual conclusions are fabricated from raw CSS.

Site blocks, robots/noindex, JavaScript-only shells, sitemap failures, missing
categories and text truncation are explicit warnings. Same-site redirects only;
cross-domain migrations require updating the client's website explicitly.
UTF-8 HTML/public structured data is supported; browser-rendered/localized cookie
flows and exhaustive product/variant catalogs are not promised.

Processing can pause when the Workspace closes. The durable state, retry
deadlines and leases survive; an internal user can continue. No worker/queue or
recurring scheduler was added. Historical scans are retained, but automated
retention/purge and a diff interface are deferred.

## Deviations / implementation choices

1. Used newly empty databases on a preserved isolated branch, not Production
   clients. Baseline schema export was used instead of replaying historical SQL
   or requiring unavailable PostgreSQL command-line tools.
2. Two evidence/history foreign keys require deferred SQL clauses not representable
   by Drizzle's schema snapshot; tested and documented for future migration review.
3. Existing chat history/AI insights cannot safely represent scanner run inputs,
   failures and versioned task attempts; the approved reusable `ai_runs` table was
   added without altering existing chat/memory behavior.
4. Reliable rendered visual/color observations remain unavailable without the
   deliberately deferred renderer. No speculative brand-color field is emitted.
5. No Preview deployment was performed; Vercel runtime canary is a release gate,
   not an unperformed test being labelled successful.

## Proposed Production sequence - NOT executed

1. Approve the exact implementation commit; review 0019 and custom deferred FKs.
2. Run a Vercel Node 22 isolated Preview canary with isolated DB/provider controls.
   Exercise real HTTPS/redirect scanning and continuation/lease behavior there.
3. Immediately before Production writes, verify canonical `addz-dashboard`, live
   application commit and authoritative Neon binding. Inspect actual schema and
   relationships, not migration numbering. Abort on drift or partially existing
   Epic 2 tables; propose targeted reconciliation instead of blind replay.
4. Create and verify a fresh preserved recovery branch and portable backup.
5. Confirm clients/users/audit dependencies and absence of the four new tables.
   Record baseline row counts/hashes. Apply ONLY reviewed 0019 inside an explicit
   transaction with lock timeout 5s, statement timeout 60s and fail-fast assertions.
6. Verify 76 columns, 21 constraints, 14 indexes, active-scan partial uniqueness,
   both deferred references, defaults and unchanged legacy integrity markers.
7. Deploy only the approved Epic 2 commit after schema verification. No diagnostics,
   test identities, environment credentials or generated pilot artifacts in release.
8. Smoke-test existing reports, auth/client isolation, Gantt, summaries and AI
   history. Internally trigger one controlled scan, inspect evidence/warnings,
   resume/cancel/re-scan and review tags. Do not send customer messages.
9. Observe runtime/DB errors and next normal scheduled jobs without forcing live
   marketing activity. If application regression occurs, restore previous app
   deployment and KEEP additive schema/new records. Never destructive DROP rollback.

This validation supports moving to a reviewed isolated Preview canary, NOT an
automatic Production rollout approval.

## Local inspection

`node scripts/epic2-local-preview.mjs` launches a Node 22 development instance
on `http://127.0.0.1:3070/` with local provider mocks on port 3071. The script
rejects Vercel execution and any database other than the exact isolated test
target. Local-only existing auth bypass is enabled; Production auth is untouched.
Both Blob credentials are blank and cron credentials/owner identities synthetic.
The preserved real-site synthetic pilot can be inspected through Clients.
PID metadata and logs remain under ignored `output/playwright/epic2/`.
The local app runs from a generated source snapshot, with no copied environment
files, so it does not contend with the existing development server on port 3020.
Both the homepage and isolated Clients API returned HTTP 200 after startup.
