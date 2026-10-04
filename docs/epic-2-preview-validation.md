# Epic 2: Isolated Vercel Preview Validation

Date: 2026-10-04. Scope: Preview runtime validation only.

## Recommendation

**GO for a controlled Production rehearsal, with the limitations below. This is
not approval to migrate or deploy Production.** No merge/push to `main`,
Production migration, Production secret change, live customer messaging or
Epic 3 implementation was performed.

## 1. Deployment and source

Canonical Vercel project: `addz-dashboard`.

Final Preview:
https://addz-dashboard-bv98nxzmk-eitans-projects-5ee0b2bf.vercel.app

- Deployment: `dpl_jAmDY5Ch2rK95AJNAvM9tczJmk4L`, READY, Preview target.
- Application commit: `186e8196f8e50c302a6f19e19bc855e110ebeaed`.
- Branch: `codex/addz-os-epic-2`.
- Vercel runtime metadata: Node `22.x`.
- Initial pilot deployment: `dpl_6riKuQCmFSNsnNVpR6YoQwHHnHoj`, commit
  `e6254b55adb496fa0839203cbd8fb73fe573b25d`.
- Deployments used a clean source export without local environment files,
  credentials, test artifacts or unrelated working-tree changes.
- The second deployment added Hebrew warning labels and fixed selected history
  status becoming stale after a scan completed. It did not change the schema.

## 2. Database identity and isolation

- Neon project: `icy-dawn-73041521`.
- Preview branch: `addz-dashboard-preview`, `br-withered-wildflower-apnmh95m`.
- Database: `neondb`.
- Endpoint: `ep-silent-breeze-apvvfkm2.c-7.us-east-1.aws.neon.tech`.
- Preview-only database role: `addz_preview_epic2`, non-superuser, without
  create-database/create-role/replication privileges; application DML only.

Identity was checked before schema work. Runtime binding was also checked by
matching synthetic client/scan IDs returned by the deployed authenticated APIs
against records in this isolated database. No database diagnostic was deployed.

Production endpoint `ep-bold-union-api79m0y` and its Production environment
binding were not changed or used for these writes.

## 3. Recovery and migration

Preserved recovery branch cloned **Preview**, not Production:

- Name: `addz-epic2-preview-recovery-20261004`.
- ID: `br-blue-bird-apenyggc`.
- Created: `2026-10-04T15:53:09Z`.
- Endpoint: `ep-quiet-union-apzz18fg.c-7.us-east-1.aws.neon.tech`.
- Schema/count comparison passed; original Preview had zero clients/users.

Preview was empty but lacked part of Epic 1. After separate user approval,
only the inspected missing foundation delta corresponding to `0017`/`0018`
was applied, then `0019` in a separate explicit transaction. Historical
migrations were not replayed and `db:push` was not used.

Both transactions used fail-fast identity/schema assertions,
`lock_timeout = 5s` and `statement_timeout = 60s`.

- Before: 25 tables, 295 columns, 48 indexes.
- After: 30 tables, 394 columns, 66 indexes.
- Verified all 76 Epic 2 columns, defaults, indexes, composite foreign keys,
  history relationships and active-scan partial unique constraint.
- `0019` creates `website_scans`, `website_scan_sources`, `website_findings`
  and `ai_runs`. No additional notification migration was required.
- Final synthetic data: 8 clients, 3 users, 1 deliberately unusable Flashy
  credential/account fixture, 5 scans. No Production clients were copied.
- Zero broken source/run relationships or orphan scan clients.

## 4. External-resource configuration

Only Preview configuration was changed:

- Preview `DATABASE_URL` points to the isolated endpoint and Preview-only role.
- Independent Preview `AUTH_SECRET`, synthetic `OWNER_EMAIL`,
  `AUTH_DEV_BYPASS=false`.
- User supplied a dedicated `OPENAI_API_KEY`; metadata confirmed Preview-only
  scope. It was not copied from Production or printed. Its provider-side budget
  enforcement was not independently observable in Vercel metadata.
- Flashy base URL remains `https://rehearsal-disabled.invalid`.
- No Preview Resend, Blob, Cron or live Flashy/encryption credentials.
- `WEBSITE_SCAN_EMAIL_ENABLED=false`; code additionally disables real delivery
  whenever `VERCEL_ENV=preview`.
- Shared model/from-address metadata is not a credential and was left unchanged.
- Authentication used synthetic allowlisted identities and ordinary single-use
  code login, not an authentication bypass. No real login email was sent.

Production variables and secrets were not changed. Preview must remain isolated
for future deployments; do not restore Production provider credentials to it.

## 5. Real public ecommerce pilot

Synthetic client: `[TEST Preview] Pip & Nut`.
Public website: https://www.pipandnut.com

The client was created through the actual Preview UI, without Flashy. Initial
scan creation and the first `after()` chunk happened automatically.

Scan: `1dc20d4e-bc06-4f10-8752-625327c272ae`.

| Metric | Result |
| --- | --- |
| Terminal status | `completed_with_warnings` |
| Discovered candidate URLs | 203 |
| Sitemaps visited | 6 |
| Sources selected | 19 |
| Sources completed / skipped | 17 / 2 |
| Budgeted network attempts | 26 |
| Deterministic findings | 31: 26 HTML, 5 JSON-LD |
| AI findings | 12 |
| Observed / inferred findings | 41 / 2 |
| Total published findings | 43 |
| Elapsed wall time | 357.511 seconds, including deliberate UI-away pause |
| Model | `gpt-5-mini` |
| AI attempts | 5: 3 completed, 2 rejected |
| Input / output tokens | 23,869 / 5,221 across all attempts |
| Longest recorded AI request | 12.639 seconds |

Provider-billed cost was not independently verified. Token totals include
rejected attempts and are supplied instead of an unverified billing estimate.

Warnings: JavaScript-dependent coverage, capped/truncated source text, rejected
invalid findings in brand-voice/products-commercial tasks, and the
audience/problems task failing evidence validation on both attempts. No weak
audience findings were published. Other valid category results were retained.

All 12 published AI quotes matched their referenced source text; source/run
relationships passed. Quote matching establishes provenance, **not semantic
truth**. Some subjective vocabulary/differentiator interpretations were marked
observed by the model. Human review remains necessary; stronger classification
guidance should be considered before using findings in future Epics.

## 6. Interruption, history and review

- Started processing, navigated away to Overview, and returned after the active
  chunk finished. Persisted state/scan ID remained intact.
- `המשך סריקה` resumed the saved sitemap/fetch checkpoint, not a new scan.
- A subsequent UI re-scan created a new ID/history entry. Cancellation retained
  its partial sources/findings and left the original 43 findings untouched.
- Updated a tone finding to `needs_review` and vocabulary to `ignored` through
  the UI; value, provenance and observed/inferred classification did not change.
- Client without a website showed the expected empty state and disabled scan
  action, without creating a scan.
- There is no guarantee of autonomous completion after the UI stops requesting
  further chunks; this is the explicitly approved resumable architecture.

## 7. Lease/concurrency test in deployed Preview

On a paused synthetic scan, a short test lease blocked an advance request.
After expiry, two concurrent advances produced one persisted checkpoint
progression. Cancellation revoked the lease. Queries found zero duplicate
source hashes, finding hashes or task/attempt records. The original findings
survived all re-scans and tests.

This was controlled Preview-only state manipulation, not Production work or a
temporary public testing route.

## 8. Vercel execution behavior

`after()` completed the active chunk while the user was away from Workspace.
Deployed route maximum duration is 60 seconds, with a 45-second worker chunk
budget and bounded network/provider timeouts. No runtime timeout was observed.

The sampled logs contained 200 entries per deployment: 400 total, zero HTTP 5xx
and zero error/fatal levels. This is a bounded sample, not a claim about all
future requests. Selected log metadata did not expose function duration, so a
measured maximum for every deployed function cannot be asserted.

## 9. SSRF runtime validation

- Real public HTTPS crawling exercised pinned numeric TCP/TLS connections in
  the actual Vercel Node 22 runtime.
- IPv4 loopback, metadata link-local, IPv6 loopback, IPv4-mapped IPv6 and
  unsupported file URLs were rejected before scan fetching.
- A public hostname resolving to loopback (`127.0.0.1.nip.io`) reached safe
  terminal `failed / unsafe_dns`, with zero sources/AI calls. Budget counters
  count attempts before DNS validation; they do not imply a private HTTP dial.
- Connect-time peer validation, malicious redirects and simulated DNS rebinding
  passed isolated Node 22 security tests.

No controlled live hostile DNS-flip server or malicious public redirect fixture
was deployed for an adversarial Vercel test. Runtime pinning and negative DNS
validation passed; do not describe that as a complete live rebinding attack test.
No hostname-only fallback, certificate bypass or private-network access was used.

## 10. Node 22 validation and regression

| Validation | Result |
| --- | --- |
| Unit tests | 140/140 passed |
| Lint | Passed, no errors/warnings |
| Build | Clean local source-export build and both Vercel builds passed |
| Isolated E2E | 7/7 passed |
| Final deployed lifecycle/API assertions | 20/20 passed |

Isolated E2E covers Epic 1 CRUD/contacts/primary switching/packages/pricing/scope,
Flashy attachment without duplicate clients, staff/client permissions, existing
reports, Gantt, summaries, AI flow/history, scan lifecycle/retries/challenges/
minimum evidence/partial success, review, history, mobile/RTL and notification
idempotency. Providers remain mocked where customer impact is possible.

Actual Preview UI/API checks additionally covered client creation and negotiated
retainer/scope persistence, Website Intelligence, report rendering (synthetic
1,400 ILS/14 purchases), Gantt, summaries and existing AI/history UI.

The synthetic client logged in through normal code authentication and saw its
reports without management/Website Intelligence navigation. On the final
deployment, client requests for clients/scans/activity returned 403; anonymous
requests returned 401; team access returned 200. Report responses did not expose
internal commercial or Website Intelligence fields. The separate client UI
login was captured on the initial Preview deployment; final API boundaries were
tested again after the UI-only refinement.

Live Flashy sync, real email delivery and Blob upload were intentionally not
performed. Initial working-directory build encountered a local webpack path
artifact; unchanged source built successfully from a clean export and on Vercel.

## 11. Requester notifications

Implemented terminal-only notification state in the existing scan JSONB state,
with a CAS delivery lease, stable provider idempotency key, safe Hebrew summary
and authenticated scan deep link. Eligible recipients are only the requesting
active owner/admin/agency user, never clients or fallback recipients.

Successful/partial/failed notifications, exclusions and idempotency passed mock
tests. Real Preview delivery stayed disabled and terminal state records this.
Production activation remains a separate approval/configuration step requiring
the enable flag, Resend/from and a valid application URL. Bounded retries occur
on subsequent advance requests; there is no autonomous notification retry queue.

## 12. Screenshots

Actual Vercel screenshots, synthetic records only:

- [Empty state](../output/playwright/epic2-vercel/empty.jpg)
- [Running scan](../output/playwright/epic2-vercel/running.jpg)
- [Completed with warnings/category filter](../output/playwright/epic2-vercel/completed-warnings.jpg)
- [Finding/source detail and review](../output/playwright/epic2-vercel/finding-source.jpg)
- [Re-scan/history/cancelled state](../output/playwright/epic2-vercel/history.jpg)
- [Mobile findings/evidence](../output/playwright/epic2-vercel/mobile.jpg)
- [Client report access](../output/playwright/epic2-vercel/client-access.jpg)

Hebrew/RTL and 390px mobile viewport were checked; no document horizontal
overflow was found. The real pilot was warning-completed; a separate clean
`completed` real-site screenshot was not fabricated. Clean completion is covered
by the isolated fixture suite.

## 13. Drift and release prerequisites

During validation, read-only Vercel metadata showed a Production redeployment
from `dpl_BozduWseGM28sFRwQtwKN91ZS7qp` to
`dpl_2PknjjSeRxTZdZsWwTcUt92nwJW5`, still the clean Epic 1 commit
`63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c`. This was not either Preview deployment
and did not deploy Epic 2. Fresh Production preflight is still mandatory; this
task did not re-audit or mutate Production database data.

Before a Production release: rehearse `0019` against a fresh isolated clone of
current Production, verify backup/recovery and exact schema delta, triage build
dependency-audit warnings, and separately approve Production execution. Do not
apply the Preview Epic 1 preparation blindly to Production, where Epic 1 is live.

Remaining limitations: server-rendered/public content only; truncated text and
bounded crawl; manual continuation after pause; possible AI evidence rejection
and semantic/classification review; no real email-delivery test; no hostile
live DNS-flip fixture; bounded log sample rather than complete duration telemetry.

No Production migration/deployment is authorized by this report. Stop here and
wait for approval for the next isolated rehearsal.
