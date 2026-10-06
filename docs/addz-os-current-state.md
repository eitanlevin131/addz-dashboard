# ADDZ OS Current State

Operational handoff: 2026-10-06, after the 10:07 UTC integrity/runtime checks.
Production status: **HEALTHY**. Epic 3 V1 is **LIVE**. The Product Owner explicitly
waived the post-Epic-2 Cron observation as a release blocker; it remains an
unverified operational follow-up, not a claim of successful scheduled delivery.
This records a bounded release validation, not continuous health monitoring.

## Live Release

- Canonical project: `addz-dashboard`; Production branch: `main`.
- Canonical URL: `https://addz-dashboard.vercel.app/`.
- Application release: `ad4947f635a19657261bfe75c65ea81a43a1611d`.
- Deployment: `dpl_CbzVsHfJ2D7xyMhcBd5JcfMh73bB`, READY at 09:57:59.985 UTC.
- Deployment URL: `addz-dashboard-bljacn45g-eitans-projects-5ee0b2bf.vercel.app`.
- Release source: `codex/addz-os-epic-3`; `main` was fast-forwarded to the exact
  approved candidate after migration verification. Handoff documentation is a
  separate subsequent change, not another Production application deployment.
- Previous application: `e2fc5058c8220ad47944aa7ffdf9db2acd53110d`,
  deployment `dpl_919qqKKXPmVuADXHqHX7Efff2BCp` (application rollback target).
- No temporary diagnostics, backups, Preview overrides or unrelated code included.

## Architecture and Product Boundaries

- ADDZ OS extends the existing dashboard, not a separate application or database.
- Next.js 16.3.6 App Router, React 19, Node 22, Tailwind 4, existing Hebrew/RTL
  shell; NextAuth 4 email OTP, existing team/client permissions; Neon/Postgres
  with Drizzle. Existing Flashy reporting, Gantt, summaries and AI history remain.
- Epic 1: client profiles, negotiated package/pricing/scope snapshots, contacts,
  one primary contact, internal owner, onboarding and activity records.
- Epic 2: bounded website discovery/extraction, evidence-preserving chunks,
  internal Research Intelligence, candidate generation and strict publication
  validation, sources/findings/AI-run history, review dispositions and Workspace.
- Epic 3: deterministic Smart Questionnaire, private capability links, serialized
  autosave, immutable source snapshots and structured Pre-Kickoff preparation.
  Questionnaire answers are client statements, not Approved Brand Brain truth.
- New clients with a valid website create an initial scan independently of
  Flashy/package; existing clients and re-scans are manually triggered.
- Work is persisted and resumable: bounded `after()` chunks, leases/checkpoints,
  retries/backoff and partial-success warnings; no queue or recurring scans.
- Website content is untrusted. Safe fetch validates/pins destinations, including
  redirects; robots/Disallow remain authoritative. Crawl-delay caps at 5 seconds
  with an original/effective warning; 429/Retry-After is not subject to that cap.
- Research Intelligence is working context, never evidence or verified truth.
  Published findings retain original source/evidence, observed/inferred status,
  confidence and run versions. Entailment/type/commercial/quotation gates remain.
- Review metadata never rewrites facts: `ignored` is excluded from default future
  consumption; `needs_review` remains available but unresolved; `normal` is normal.
- Product sequence stays Website Intelligence -> Smart Questionnaire ->
  Pre-Kickoff Intelligence -> Kickoff -> Approved Brand Brain. Epic 2 does not
  create those later product artifacts.

## Database and Recovery

- Verified Production: Neon `icy-dawn-73041521`, branch `br-tiny-pond-apeto61v`,
  database `neondb`, endpoint `ep-bold-union-api79m0y`.
- Neon was operational on Launch; free limits removed, transfer capacity
  available. Read and rolled-back temporary-write probes passed. No billing change.
- Epic 2: only `0019` applied, through `docs/epic-2-production-rehearsal.sql`, atomically
  with assertions, lock timeout 5s, statement timeout 60s and ON_ERROR_STOP.
- Four additive tables: `website_scans`, `website_scan_sources`,
  `website_findings`, `ai_runs`; 76 columns, expected defaults/FKs/indexes/checks,
  active-scan partial uniqueness and deferred relationships verified.
- Epic 3: only `0020` applied at 09:56 UTC in the exact rehearsed explicit
  transaction, with fail-fast assertions, ON_ERROR_STOP and 5s/60s timeouts.
  Added `client_questionnaires` and `questionnaire_rate_limits`: 20 columns,
  8 constraints, 5 indexes. Complete schema matched the fresh Production-derived
  rehearsal. No historical migrations or fabricated migration history.
- Current recovery branch: `addz-epic3-approved-recovery-20261006`,
  `br-solitary-river-apfj405m`, created 09:40:09 UTC from Production, no expiration.
- Current consistent portable backup: private/ignored
  `.tmp/epic3-approved-rollout-20261006/production-state.dump`, 2,643,824 bytes,
  SHA-256 `e5b284ebfcafddb038242f0871f4b471613f9981f9fcf025a9f775150d0f81e8`.
  Created/verified at 09:55 UTC using an exported read-only consistent snapshot;
  archive contains all 30 pre-migration tables. Earlier recovery branches/backups
  are retained. Never commit or distribute backups as product handoff documents.
- Normal Gantt creates/edits during rollout were explicitly approved and correlated
  with successful Production API requests. Deletion, planner identity/relationship
  changes, schema changes and unrelated table changes remained blocking.
- No migration ledger reconstruction or historical replay. Inspect live schema
  before future migrations; never use generic `db:push` on Production.
- Earlier Epic 2 recovery branch: `addz-epic2-preprod-recovery-20261006`,
  `br-morning-surf-apm948o8`, created 05:52:34 UTC, preserved without expiration.
- Fresh consistent portable backup is private/ignored:
  `.tmp/epic2-rollout-20261006/production-state.dump` (2,491,772 bytes).
  SHA-256: `6a4fac34673e8ebb7071ffd581f142c8b334f923bfe97499a687fce7defc13ef`.
  Archive contents/checksum verified; clone schema and all 26 table record hashes
  matched source. This fresh dump was not restored again; prior rehearsal restore
  validation passed. Protect the dump as customer data; it is not in Git.
- Migration left every legacy table record unchanged. Final checks confirmed
  existing clients/contacts and user security fields unchanged; 21 legacy tables
  still have identical complete record hashes after smoke testing.
- Application failure: restore the recorded previous deployment, keep additive
  schema and new data. No destructive schema rollback without separate approval.

## Epic 3 Production Validation

- Owner session and the existing real client-role session survived deployment.
  Client reports still load without management navigation. Canonical request logs
  confirm client HTTP 403 for both questionnaire and website-scans team routes;
  anonymous questionnaire team access is 401. Removed diagnostic remains 404.
- Existing clients, commercial scope/pricing, contacts, Flashy-linked reports,
  SMS/automation/campaign views, Gantt, summary archive and saved AI history loaded.
  No Flashy sync, marketing messages, new AI calls or website crawls were triggered.
- Used only the retained synthetic client below. Generated 25 snapshot items,
  selected 24, approved and issued a link. Public UI persisted 24 answers, including
  one confirmation, one correction, one rejection, two new answers and unresolved
  discussion/unknown states. Closing/reopening retained correction and new input.
- Submitted once: `dab4750f-6a65-44ad-8c4a-dc6053b0ca25`, revision 12,
  submitted 10:03:40 UTC. Submitted public UI has no editable controls.
  Preparation separates confirmations, corrections, new facts, conflicts, unknowns
  and kickoff topics, explicitly stating it is not Approved Brand Brain.
- Website Intelligence source/finding/run hashes stayed identical. All 27 protected
  legacy-table count/hash markers stayed identical after smoke; normal live planner
  changes and new questionnaire/audit/rate-limit records were separately expected.
- Audit recorded generation, approval, link issuance, saves and one completion.
  Link stored as a 64-character SHA-256 only; no plaintext bearer token printed.
- No error-level or 5xx records in the bounded 48-request runtime sample through
  10:07 UTC. No application rollback required; Production secrets unchanged.

## Earlier Epic 2 Production Validation

- Owner login/session and real client OTP login passed. Client reports loaded;
  internal navigation/data were unavailable. Internal website-scans GET returned
  HTTP 403 for the client, confirmed in canonical Vercel request logs.
- Clients list, synthetic profile create/edit, package/pricing/scope persistence,
  owner assignment, two contacts/primary switching, activity, reports, Flashy-linked
  views, Gantt, summary archive and saved AI history loaded successfully.
- Synthetic client only: `[TEST] Epic 2 rollout 2026-10-06`,
  `ebc64a69-53ed-441d-8e67-88f1a32e43ca`; no Flashy link or login user created.
  Negotiated monthly 3,210.50 / one-time 4,321.00 persisted after edit.
- Public Ayelet site scan: 20/20 sources, 6 product pages, FAQ/contact/returns/
  shipping coverage; 40 deterministic and 5 AI findings. All 5 AI findings were
  manually inspected against evidence. All published findings were observed in
  this run; unsupported audience output was rejected, not relabeled/published.
- Completed with warnings in 631.213s including deliberate navigation interruption.
  AI recorded 231,817 input / 10,068 output tokens; no billing estimate asserted.
  Review tag persisted; re-scan/cancel and previous history/evidence remained valid.
- No runtime error-level records or 5xx were observed in the bounded log sample.
  Final orphan/duplicate checks were zero. No customer marketing/sync was forced.
- Node 22 is confirmed by deployment build logs. Project metadata says 24.x, but
  `package.json` engines 22.x overrides it; no project setting was changed.

## Limitations and Follow-Up

- Internal scan completion email is opt-in and currently disabled in Production:
  `WEBSITE_SCAN_EMAIL_ENABLED` is absent; terminal outbox status was `disabled`.
  Enabling delivery needs separate configuration approval; no secret was changed.
- Normal cron definitions remain enabled on the new deployment: Flashy 03:00 UTC,
  planner digest 05:00 UTC and winter fallback 06:00 UTC. The next normal Flashy/
  summer digest cycle has not been observed after this deployment; no manual run.
  A winter outside-send-hour result is not evidence of actual digest delivery.
- Keep the marked synthetic client/scans until release closure is explicitly
  approved. It has no Flashy account and does not contribute reporting revenue.
- Closing the Workspace need not complete a scan; resume is intentional.
- No browser renderer: blocked/JS-only pages and unexposed variants remain
  limitations. Crawls/text are bounded; AI rejection can leave category gaps.
- Three pre-existing non-blocking lint warnings remain. Reference
  `docs/epic-2-minimal-release-confirmation.md` for the isolated release gate:
  lint/build/typecheck passed, Website Intelligence E2E 2/2 passed.
- Deferred: Brand Brain, kickoff, strategy/copy/task generation,
  recurring scans, browser rendering and queue infrastructure.
- Next operational work: observe the next normal Flashy/planner cycle, then decide
  test-client cleanup explicitly. Next product Epic is Epic 4 kickoff/characterization;
  do not start it without its scoped plan/approval. It was not started in this rollout.

## Epic 3 V1 (Live)

- Approved scope: Smart Questionnaire, unique client capability link and structured
  Pre-Kickoff preparation inside the existing Client Workspace.
- Deterministic generation uses published findings and negotiated service/scope
  snapshots; no new AI call, Research reinterpretation or crawler changes.
- Original scan facts, hypotheses and source evidence remain unchanged. Answers
  separately record confirmation, partial confirmation, correction, rejection,
  new client input, unknowns and kickoff discussion needs.
- Additive `0020`: `client_questionnaires` and `questionnaire_rate_limits`,
  20 columns total; rehearsed in isolation and now applied in Production as above.
- Fragment-based 256-bit token, hash-only persistence, 90-day expiry, revocation,
  durable request limits, strict public projection and atomic revision fencing.
- V1: one immutable questionnaire snapshot per client; team selects questions and
  approves before sharing. No regeneration, automatic mail or reminders yet.
  Submitted questionnaires remain read-only; concurrent edits return 409 rather
  than overwriting. Unsaved/offline edits are not durable browser storage.
- Full decisions and validation: `docs/epic-3-smart-questionnaire.md`.
- Local Node 22 candidate gate: 323/323 unit tests; lint 0 errors/3 old warnings;
  TypeScript/build passed; full isolated E2E 9/9 passed (6.3 minutes).
  Desktop/mobile questionnaire and preparation views were visually reviewed.
- Validated Preview `dpl_8oWD6jCYXRzoTd2GbMnUpc2QC3JZ` and a fresh Production-state
  rehearsal passed before rollout. No provider/environment change was required.

This handoff is a post-rollout documentation artifact, not part of the deployed
application release above. Consult Master Spec/Roadmap for product scope and the
live database for schema truth; do not infer state from historical filenames.
