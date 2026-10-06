# Epic 3 - Smart Questionnaire and Pre-Kickoff Intelligence

## Authority and scope

Website Intelligence -> Smart Questionnaire -> Pre-Kickoff Intelligence ->
Kickoff/characterization -> Approved Brand Brain. The last two steps are deferred.
Questionnaire answers are client statements, not approved brand truth. Website
observations, inferred hypotheses, source quotes and client corrections coexist.
Research Intelligence is never presented as evidence or copied into client facts.
Epic 2 release closure and its retained Production test client are not part of this epic.

## V1 implementation decisions

- Extend the existing staff-only Client Workspace with Questionnaire and Pre-Kickoff views.
- Deterministic, versioned generation from the latest successful scan for the current
  website, the client name and the stored included-services/scope snapshot. No new AI
  requests, questionnaire chat, form builder or Brand Brain generator.
- Preserve immutable question/source snapshots and structured answers separately in
  one `client_questionnaires` table. An additive `0020` also supplies a small durable
  public-request rate-limit table. Existing data/tables are never backfilled.
- `not_created` is a virtual empty state. Persisted states: draft, ready, sent,
  in_progress, submitted, reviewed. Team approval precedes issuing a client link.
- Generation never replaces an existing questionnaire. V1 has one questionnaire per
  client; explicit new versions/regeneration after sending are deferred. Scan IDs,
  generator version and evidence snapshots make that later extension possible.
- Normal findings are available; ignored findings are excluded; needs-review findings
  are visible internally as unresolved and must be explicitly included by the team.
  Default selection is bounded and balanced by domain. No automatic endorsement.
- ASK client-only gaps, CONFIRM website suggestions, SKIP page metadata/redundant facts,
  reserve KICKOFF nuanced strategic topics, SYNTHESIZE preparation groups internally.
- Package-specific questions use service codes and stored scope, not retainer amounts,
  package labels or guesses. Missing legacy scope is reported internally; unrelated
  service questions are not invented.
- Public questionnaire is `/questionnaire#<256-bit-token>`. Fragment keeps the bearer
  token out of request paths, server access logs and referrer URLs. API receives it in
  Authorization only; only SHA-256 is persisted. No account/session impersonation.
- Shared links expire after 90 days, can be revoked/rotated, and are shown only once
  when issued. Reissuing invalidates the previous link without erasing answers.
  No automatic client email or provider configuration changes.
- Durable hashed-IP limits apply before token lookup; no raw IP/token stored or logged.
  Origin/JSON/body/field limits, explicit public projections, no-store/no-referrer and
  revision compare-and-swap protect this externally exposed surface.
  Vercel supplies/overwrites the trusted forwarded IP header; outside Vercel the
  implementation deliberately uses one local bucket. A future custom proxy needs
  an explicitly reviewed trusted-IP adapter, not arbitrary forwarded headers.
  Reference: https://vercel.com/docs/headers/request-headers
- Autosave is debounced and serialized; revision conflicts do not silently overwrite
  edits from another tab. Submission is atomic/idempotent, freezes edits and records
  `questionnaire.completed` once in the existing audit log.
- Public projection excludes prices paid to ADDZ, package internals, owner, notes,
  contacts, AI runs, review comments and internal kickoff/synthesis decisions.
- Pre-Kickoff is a deterministic preparation view: confirmed, corrected, new,
  unresolved source/answer differences, still unknown and discussion topics. It does
  not resolve conflicts, edit the original scan or mark anything approved/verified.
- Assets are HTTPS/HTTP links/status only, never passwords/tokens or file uploads.

## Validation and release boundaries

Node 22 unit/lint/type/build, full isolated E2E, additive migration rehearsal with
fail-fast identity/schema assertions and 5s/60s lock/statement timeouts. Public-link
tests cover invalid/revoked/expired links, cross-client isolation, submission,
optimistic concurrency, safe plain text, payload limits and team/client boundaries.
External providers remain mocked; no Production query/write/migration/deploy/merge.
Production rollout requires separate approval, fresh backup/preflight, reviewed
0020 only, schema verification, then exact code deployment. Application rollback
retains additive schema and any new questionnaire answers; never drop them.

## Isolated schema rehearsal

- Existing synthetic Neon endpoint: `ep-summer-waterfall-aprx73rb`, not the
  Production endpoint. Fresh database: `addz_epic3_migration_validation`.
- Restored the Epic 2 baseline schema from `5c048db`, including its deferred
  relationships, then seeded a synthetic legacy client/user/primary contact.
  This is a schema-compatible synthetic rehearsal, NOT a fresh Production clone.
- Applied only `0020` in one fail-fast transaction with lock timeout 5s and
  statement timeout 60s. Verified 20 columns, 8 validated constraints and 5
  indexes (including primary indexes). Complete count/hash markers for all 30
  existing tables were identical before/after.
- Applied the same additive delta to `addz_epic2_validation` for browser tests.
  No historical migration replay, ledger reconstruction or generic db:push.

## Security and operational limitations

- Capability links authorize whoever holds the link, not a named contact.
  Share privately; revoke/reissue if forwarded unexpectedly. Expiry does not erase
  answers. No sensitive access credentials should be entered into answer fields.
- No new AI requests: questionnaire generation/preparation are deterministic and
  bounded. Research context is not consumed as client evidence.
- An offline save or concurrent-tab conflict is explicit; pending edits stay only
  in the current browser memory. Refresh/reopen loads durable server answers.
  V1 does not merge conflicting tab drafts or provide an offline draft store.
- New website scans do not rewrite sent questionnaires. Questionnaire regeneration
  and multiple versions, reminders/mail delivery, uploads, advanced editing and
  kickoff/Brand Brain creation remain deferred.
- Public request-body budget: 64 KiB; answer text: 4,000 characters; assets: at most
  5 http/https references. Runtime schema checks reject coerced state/priority
  arrays/objects. Rate budget: 120 requests per hashed client-IP/minute.

## Recommended release sequence (Not Executed)

1. Approve isolated Vercel Preview preparation first: inspect its actual schema,
   recovery point, external-provider isolation and apply only missing `0020`.
   Do not push a branch into an automatic Preview deploy before schema preparation.
2. Validate normal Preview runtime, public link/autosave/submission and staff/client
   boundaries without real customer messages. Keep Production secrets untouched.
3. Before any approved Production rollout, re-confirm project/DB binding, health,
   live schema and integrity, then use a fresh Production-state isolated rehearsal
   and verified recovery branch/portable backup. This local synthetic rehearsal
   does not replace that fresh preflight.
4. Apply reviewed `0020` only, with explicit transaction, fail-fast identity/schema
   assertions, ON_ERROR_STOP, 5s lock/60s statement timeout. Abort on drift/failure.
5. Verify columns/defaults/FKs/checks/indexes and unchanged legacy integrity markers;
   then deploy the exact approved application commit and run controlled smoke tests.
6. If application fails, restore the previous application deployment while keeping
   additive schema/answers. Destructive rollback requires separate approval.

## Local candidate validation - 2026-10-06

- Node 22.23.3: full unit suite **323/323**, including 19 new questionnaire tests.
- Full lint: **0 errors**, 3 unchanged Epic 2 unused-variable warnings.
- TypeScript `--noEmit` and production-style Next webpack build: **passed**.
  One intermediate build hit a transient generated-cache error; a preserved-cache
  clean rebuild passed. No framework/dependency change was needed.
- Full isolated Playwright suite: **9/9 passed**, 6.3 minutes on the final build.
  Five existing dashboard/Epic 1 scenarios, two questionnaire scenarios and two
  Website Intelligence scenarios ran together with all external providers mocked.
- Validated safe synthetic spice client, team selection/approval/share/clipboard,
  account-free mobile client flow, autosave/reopen/correction/rejection/submission,
  read-only submitted view, immutable source evidence and Pre-Kickoff preparation.
- Security integration checks: client-role 403, anonymous team-route 401, invalid
  tokens, cross-client isolation, expired/revoked/rotated links, JSON tampering,
  coercion rejection, byte budget, inert HTML, request limits, parallel saves and
  idempotent submission/audit count.
- Existing packages/pricing/contacts/Flashy linking, reports/Gantt/summaries/AI
  history and scan resume/leases/cancel/retry/partial-success tests passed.
- Reviewed desktop/mobile screenshots; no horizontal overflow or overlapping
  controls. Generated screenshots stay outside Git in `output/playwright/epic3`:
  `team-draft-desktop.png`, `public-intro-mobile.png`,
  `public-submitted-mobile.png`, `pre-kickoff-desktop.png`, `pre-kickoff-mobile.png`.
- Fixes from browser/security validation: omit server timestamps from editable
  autosave drafts, lock navigation while saving, require literal string validation
  states/priorities. Test infrastructure uses localhost to match Next's loopback
  normalization and separate synthetic identities to respect OTP resend cooldown.
- Current development branch: `codex/addz-os-epic-3`, based on `5c048db`.
  Local-only candidate; no push, Preview/Production deploy, Production query or
  migration. Production's retained Epic 2 test client was not touched.
- Decision: **GO for isolated Preview validation**, not Production rollout.
