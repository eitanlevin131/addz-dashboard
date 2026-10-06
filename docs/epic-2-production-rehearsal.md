# Epic 2: Production-State Isolated Rehearsal

Date: 2026-10-05. This record covers isolated rehearsal and read-only Production
inspection. It is not a Production migration/deployment authorization.

## 1. Source, deployment and isolation

- Canonical Vercel project: `addz-dashboard`, repository
  `eitanlevin131/addz-dashboard`, Production branch `main`.
- Live Production deployment: `dpl_2PknjjSeRxTZdZsWwTcUt92nwJW5`.
- Live clean Epic 1 commit: `63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c`.
- Source Neon project: `icy-dawn-73041521`.
- Source branch: `br-tiny-pond-apeto61v`, database `neondb`.
- Source endpoint: `ep-bold-union-api79m0y.c-7.us-east-1.aws.neon.tech`.
- Prior authenticated runtime diagnostic established this binding. Fresh Vercel
  metadata checks found the same deployment and the same Production-scoped
  sensitive DATABASE_URL environment record, including its unchanged update
  timestamp. Source queries additionally required the exact verified endpoint.
  No new diagnostic was deployed and no secret value was retrieved or printed.
- Tested application source: `186e8196f8e50c302a6f19e19bc855e110ebeaed`, the
  application commit approved in Preview. Repository HEAD `0de7bbb` only adds
  the previous validation report; application sources are unchanged.

The existing Preview database was NOT used as a rehearsal source or write
destination. No Production/Preview Vercel environment variables, deployments,
Git integration or `main` were changed.

## 2. Fresh preserved branches

| Purpose | Branch name / ID | Parent | Created UTC |
| --- | --- | --- | --- |
| Preserved recovery | `addz-epic2-recovery-20261005` / `br-super-base-apa7oi4g` | verified Production | 2026-10-05 04:49:13 |
| Migrated rehearsal | `addz-epic2-rehearsal-20261005` / `br-long-star-apv42mqb` | fresh preserved recovery | 2026-10-05 04:50:05 |

Both branches contain schema AND realistic current Production data and have no
automatic expiry. The recovery endpoint is `ep-bitter-base-ap8wc4a0`; the
rehearsal endpoint is `ep-floral-morning-apttpdqw`. Both use `neondb`.
Creation used the current source head, not a historical Preview checkpoint.
Full schema and full-row fingerprint comparisons confirmed identical source
state before migration. The recovery branch was never migrated or used by the
application tests.

## 3. Pre-migration findings

Initial inspection: `2026-10-05T04:48:14.389Z`, read-only repeatable-read snapshot.

- 26 existing tables, including the complete Epic 1 clients/contact foundation.
- Schema SHA-256:
  `ee5816d1eef6ade754c66b9c704302b5d6eb181887f472b4f0ed5b17cbaa2b69`.
- Schema matched the recorded final Epic 1 Production schema.
- No `website_scans`, `website_scan_sources`, `website_findings` or `ai_runs`.
- Zero orphan client-user links, Flashy accounts, contacts or owner assignments.
- Zero duplicate primary-contact groups or duplicate active Flashy account IDs.

Key source counts:

| Table | Rows |
| --- | ---: |
| clients | 11 |
| users / client_users / client_contacts | 17 / 13 / 2 |
| flashy_accounts | 10 (9 active) |
| email_campaign_reports / sms_campaign_reports | 671 / 559 |
| automation_reports | 16,966 |
| newsletter_plans / newsletter_plan_assets | 49 / 28 |
| monthly_summaries / monthly_summary_deliveries | 11 / 9 |
| ai_account_memory / ai_chat_messages | 7 / 98 |
| account_metric_snapshots / sync_runs / audit_logs | 132 / 34 / 266 |

The private local manifests contain counts and content fingerprints for ALL
26 tables, not only these selected tables.

## 4. Fresh portable backup and verified restore

- Created at `2026-10-05T04:50:46.891Z` with PostgreSQL 17 client tools.
- `pg_dump` custom format, no owner/ACL dependencies, exported snapshot from a
  read-only repeatable-read source transaction.
- File: `.tmp/epic2-rehearsal-20261005/production-state.dump`.
- Size: 2,461,583 bytes.
- SHA-256:
  `ff7321c9a621004bc2791690d00a47f383f385aae34dbc1167d3de6179e6ee39`.
- Restore target: fresh disposable database `addz_epic2_restore_20261005` on the
  isolated rehearsal endpoint. It is separate from migrated `neondb`.
- Restore used one transaction, exit-on-error, no overwriting/cleaning of any
  existing database. Source Production and preserved recovery were untouched.
- Restore completed at `2026-10-05T04:52:01Z`.
- Verified identical schema, all 26 table counts, full-record fingerprints,
  extensions, constraints and key relationships. This compares every record,
  not just samples.

Backup/manifests/logs are private, ignored local artifacts; backup permissions
are 0600 and the containing directory is 0700. Never commit or publish them.
A new backup and recovery branch are still required immediately before a real
rollout. Secure off-device/encrypted retention is recommended for that backup.

## 5. Migration rehearsal

Applied ONLY `db/migrations/0019_website_intelligence.sql` to isolated rehearsal
`neondb`, with no replay of historical migrations, no `db:push` and no invented
migration-history records.

Execution used `psql -X -v ON_ERROR_STOP=1`, one explicit BEGIN/COMMIT,
`lock_timeout = 5s`, `statement_timeout = 60s`, and fail-fast assertions for:

- the intended database and Epic 1 contacts baseline;
- absence of all four Epic 2 tables before creation;
- exactly 76 expected Epic 2 columns afterward;
- both deferred restrictive history/AI-evidence foreign keys afterward.

Migration committed at `2026-10-05T04:52:03.176Z`.

- Reviewed migration file SHA-256:
  `0b0c72d1a28c0600fa8aab96c6021a74b355c99f7f6a006f6065b14af1ec806d`.
- Transaction wrapper + assertions + exact migration SQL SHA-256:
  `1cd71eea8267466cc6ef32493ccc387340226ed5a68f0e6122c0e7002b212f26`.
- After-migration schema SHA-256:
  `1ccde985ebaf646f547ea134bd7f8834ce7b314f351a2eb5e26aaa0e8c311bd1`.

## 6. Schema and data-integrity verification

- 30 tables after migration; all four new tables initially empty.
- All 76 columns, types, nullability and defaults matched the reviewed Preview
  schema. All expected indexes and validated foreign keys matched as well.
- Verified partial unique active-scan index, unique source/finding/task-attempt
  indexes, client ownership composite FKs, and deferred history/evidence FKs.
- All 26 original tables had identical counts AND full-row content fingerprints
  immediately before/after migration. No legacy data backfill or mutation.
- Eleven deliberate constraint-violation probes were rejected with the expected
  PostgreSQL codes. Probes ran on synthetic data in an always-rolled-back
  rehearsal transaction: duplicate active scan/source/finding, invalid lifecycle/
  classification/confidence/review, cross-client history/run and cross-scan
  evidence/run references.

Application tests create only synthetic fixture records. A subsequent integrity
comparison checks every ORIGINAL record by primary-key plus full-row hash, or
hash multiset for a legacy table without a primary key; new test records must not
mask deletion or modification of originals.

Final original-record comparison passed across all 26 tables: zero missing or
changed original records, including all original users, assignments, contacts,
Flashy connections, reports, plans, summaries and AI messages. Two synthetic
public-pilot clients remain in the isolated database for evidence inspection.
Additional audit/login records belong only to synthetic rehearsal activity.
Nine additional Epic 2 relationship/duplicate checks all returned zero violations.

## 7. Node 22 application and test harness

Runtime: Node `v22.23.3`. Sources were exported directly from the approved
application commit, without local environment files or Production credentials.

All customer-impacting provider configurations were explicitly replaced in the
local test environment:

- Flashy, Resend and OpenAI: local mocks only.
- Blob tokens: empty. No uploads/writes to Production stores.
- Cron: disabled synthetic secret; no schedules installed or invoked.
- Auth: separate synthetic secret and `@example.test` users with ordinary OTP
  login, not an authentication bypass.
- Flashy encryption secret: synthetic; copied Production keys cannot be used.
- No copied Production client content was sent to OpenAI.

The local-only website fixture adapter originally allowed just the OLD synthetic
database host. Its allowlist and the E2E DB guard were redirected exclusively to
this fresh clone in the exported test copy. The adapter remains hard-disabled
whenever VERCEL is present; the real crawler/security path is unchanged.
These harness changes are NOT changes to the application branch or a deployable
patch. All other `src/` and migration files were compared byte-for-byte against
the approved application commit.

| Validation | Result |
| --- | --- |
| Unit tests, Node 22 | 140 passed, 0 failed |
| Lint | Passed |
| Production build | Passed; final run 11.140 seconds |
| Complete existing isolated E2E suite | All 7 existing cases passed together |
| Additional Production-derived regression | 1 passed |
| Focused real-site and in-flight recovery tests | 2 passed, 0 failed |
| Retained pilot UI, evidence expansion and mobile/RTL screenshot check | 1 passed, 0 failed |

These are final passing results across runs, NOT a claim of one clean expanded
10-case run. The expanded 9-case run finished 8 passed / 1 failed: the added
pilot test incorrectly compared JSON-LD JSON serialization order after JSONB
storage. After replacing that harness assertion with structured locator/value
validation, the pilot and additional recovery test both passed (183.927 seconds
combined). No application fix was required. Earlier harness failures and the
intermittent existing Gantt assertion are disclosed in section 13.

## 8. Production-derived regressions

Passed internal read/access checks for all 11 existing client profiles, stored
packages/scope, negotiated pricing, owner assignments and contacts.

- All 9 active account identities appeared in the dashboard response.
- Returned report counts: 510 email, 405 SMS and 14,969 automation rows. These
  are the existing active-account/latest-report filtering results, NOT loss of
  the larger historical tables.
- All 49 planned items and 11 existing summaries remained readable.
- Existing AI history returned 93 messages; originals remain 98, with the
  existing conversation pairing/limit filter applied.
- A synthetic client user assigned to one existing client saw ONLY that client's
  dashboard data. Internal commercial fields were absent from that response.
- Client foundation and Website Intelligence endpoints returned 403 to clients.
- The full existing E2E suite exercised packages/negotiated prices, multiple
  contacts/primary switching, owner/admin access, Flashy attaching without
  duplicate clients, reports, Gantt, summaries and grounded AI/history.

## 9. Real-site synthetic pilot

Real public ecommerce site: `https://pipandnut.com/`.
Client created through the normal local application's authenticated API, without
Flashy; scan creation and the initial `after()` chunk were automatic.

Crawl/robots/sitemaps/redirects/extraction use the real approved safe-fetch path.
AI responses and terminal notification delivery are mocked locally. This checks
structured AI processing, evidence validation and persistence, NOT new model
quality or provider billing. Prior real-AI Vercel validation remains documented
in `epic-2-preview-validation.md`.

| Pilot measure | Result |
| --- | --- |
| Synthetic client | `4b560f54-81a1-43e6-b3ea-38f621c36320` |
| Scan | `9fb233ed-008c-4b66-8c04-a7e3d4e3a51d` |
| Status | `completed_with_warnings` |
| Candidates / selected / completed / skipped | 92 / 19 / 17 / 2 |
| Network attempts / visited sitemaps | 29 / 6 |
| Robots and redirects | Robots fetched; real redirects processed |
| Useful evidence | 17 pages; 108,469 extracted characters |
| Deterministic / mock AI findings | 31 / 4 |
| Observed / inferred | 34 / 1, including mock AI classifications |
| Invalid evidence / rejected findings / duplicate findings | 0 / 0 / 0 |
| Coverage warnings | `javascript_required`, `text_truncated` |
| Duration | 139,536 ms, including follow-up review/history checks |
| AI runs | 4 completed mock runs |
| AI usage / cost | Mock reports 4,000 input / 400 output tokens; actual AI cost zero |

Evidence checks validated HTML title/main-text snippets, retained JSON-LD
locators and typed product values, and AI quotes against their own scan sources.
Review tagging worked without changing finding value/provenance/classification.
A re-scan linked to the previous scan; cancellation preserved all 35 prior
findings. The terminal notification was delivered once to the synthetic
requesting team member through the mock only, with the scan link. No client
email or real provider delivery occurred.

## 10. Recovery, concurrency and failure behavior

The existing E2E scan suite passes resume/history/review/cancellation, minimum
evidence, challenge/full failure, partial completion, source retry/backoff,
duplicate advance requests and expired leases against this Production-derived
clone.

An additional focused test holds an actual in-flight MOCK AI response, expires
the worker lease in the isolated DB, lets the new worker recover, then releases
the old response. It verifies the stale worker cannot publish findings or
overwrite the new checkpoint. Lease expiry is deliberately simulated; no live
customer work or third-party infrastructure is interrupted.

Focused recovery result: passed in 36.7 seconds. The stale run ended with
`failed` / `interrupted` and published zero findings. Recovery produced four
completed AI runs (five total including the abandoned attempt), zero duplicate
findings and exactly one `website_scan.started` event. The new checkpoint
remained intact after releasing the old worker's held response.

## 11. Production drift

Final read-only Production re-inspection after validation found identical
schema, all 26 table counts AND full-row content fingerprints, integrity checks,
live deployment and Production binding environment metadata. No material drift
was found. Final inspection time: `2026-10-05T05:33:48.504Z`.
A fresh deployment-time preflight remains mandatory regardless of this result.

## 12. Exact proposed Production sequence (NOT executed)

1. Obtain separate rollout approval. Confirm canonical project, `main`, clean
   previous deployment and the verified Neon Production endpoint. Re-check
   deployed environment metadata without printing secrets. If binding changed,
   stop and re-establish runtime identity before any write.
2. Fresh read-only schema/row/integrity preflight. Require complete Epic 1,
   no unexpected Epic 2 objects, no changed constraints or broken relationships.
   Compare against the rehearsal baseline. Any material drift requires review
   and a refreshed rehearsal/preflight; do not continue on assumptions.
3. Create a NEW preserved Production-head recovery branch and snapshot-consistent
   portable backup. Check backup SHA-256, branch identity and recoverability.
   Never use this older rehearsal recovery point as the only release backup.
4. Review the recorded SQL checksum; use the same transaction wrapper and exact
   `0019` statements as the successful rehearsal. BEGIN; SET LOCAL lock_timeout
   to 5s; SET LOCAL statement_timeout to 60s; pre-assertions; `0019` only;
   post-assertions; COMMIT. Use ON_ERROR_STOP. No generic schema synchronization,
   historical migration replay or fabricated migration journal.
   The documented script is `docs/epic-2-production-rehearsal.sql`; it contains
   exactly the rehearsed statements. Its checksum differs from the private
   executed file only because of the final newline (statement equality verified).
5. Before deployment, verify the 76 columns/defaults, all indexes/FKs, partial
   active-scan uniqueness and unchanged legacy row/content markers. Stop on any
   unexpected mutation or verification failure.
6. Deploy only approved application commit
   `186e8196f8e50c302a6f19e19bc855e110ebeaed` (or an explicitly approved
   release-point descendant with identical application sources). Use a clean
   export: no local harness allowlist changes, mocks, synthetic credentials,
   backup files or temporary diagnostics. Preserve existing Production DB and
   provider bindings; never copy Preview secrets/configuration into Production.
7. Controlled internal smoke tests: Clients list/workspace and historical
   data; synthetic `[TEST]` client without Flashy; scan creation, evidence,
   observed/inferred, review/history/cancel/resume; client user 403/no scan tab;
   existing packages/contacts/reports/Gantt/summaries/AI history and login.
   No real Flashy sync, marketing actions or customer messaging for smoke tests.
8. Check runtime DB/auth/scan errors, lease/retry states and normal scheduled-job
   health. No manual forcing of customer-impacting jobs. Keep rollback ready.

Terminal scan email delivery is explicit opt-in (`WEBSITE_SCAN_EMAIL_ENABLED`);
Preview hard-disables it. Verify/approve the Production opt-in separately if
needed. Rehearsal mail was mock/test delivery only. Do not silently introduce
live delivery or change Production variables as part of this rehearsal.

## 13. Rollback and limitations

- Migration/assertion failure: transaction rolls back; old app stays live;
  DO NOT deploy the new app. Report the exact safe failure.
- App failure after additive migration: restore the previous clean app
  deployment, KEEP additive schema and all new records/evidence. No table/column
  deletion or destructive data restore without separate approval.
- Recovery branch and portable backup are incident recovery options, not an
  automatic destructive rollback script. Preserve any post-release new records.
- Resumable chunks are not a durable autonomous worker. An unattended scan may
  pause until an internal user resumes it. Notification retry similarly needs
  another advance; no queue/recurring scans were added.
- HTTP-only scanning cannot render JS-heavy/challenge-protected pages. Respect
  robots/noindex; show partial-coverage warnings rather than bypassing access.
- AI evidence/source matching is provenance validation, not verification of
  semantic truth. Public claims/inferences still require internal review.
- The scan lifecycle/classification/review/confidence checks are enforced in
  reviewed SQL; source and AI-run status vocabularies are currently enforced by
  application code, not additional new DB CHECK constraints.
- The first expanded test run exposed harness issues: fixed old DB allowlists,
  OTP resend cooldown from reusing a synthetic address, and comparing JSON-LD
  serialization order after JSONB storage. Harness adaptations did not change
  application behavior. One Gantt UI assertion was intermittent and passed an
  unmodified rerun; retain it as a test-reliability caveat rather than hide it.
- Nested source export produced a harmless Next.js tracing-root warning; build
  passed. No Next.js/Vercel configuration was changed to silence it.

## 14. Final results and recommendation

Subsequent representative-client product-quality validation:
[ADDZ client website validation](./epic-2-addz-client-validation.md).
It found crawl/discovery limitations and an unavailable local test AI credential.
The product-quality gate remains open; do not interpret the infrastructure GO
below as closing that newer gate or authorizing Production rollout.

GO for a separately approved, controlled Production rollout with fresh
preflight and recovery point. Migration, restore, integrity, existing E2E,
Production-derived access, pilot and recovery checks passed. No drift was found.
The AI/provider mocks and test-harness caveats above are explicit limits of this
rehearsal; prior Preview runtime validation remains the real Vercel/AI evidence.

No Production rollout is authorized or performed by this report. No Production
data/schema write, environment change, deployment, push or merge to `main`
occurred. Only local rehearsal documentation was added to the application repo;
test adaptations were confined to the ignored exported application harness.
Preserved Neon branches and the restore database remain available; they consume
branch/storage quota and should not be deleted until recovery retention is agreed.

## Evidence artifacts

Private reproducible manifests, SQL wrapper, backup and test logs are under
`.tmp/epic2-rehearsal-20261005/`. Screenshots are retained under
`output/playwright/epic2-rehearsal/`; only synthetic-client UI should be shared.
Do not publish private test traces or backup files containing copied data.

Updated captures of the retained public pilot were taken after all 35 findings
loaded, with the first source/evidence panel expanded. The separate UI check
confirmed RTL and no horizontal overflow at 390px:

- [Public pilot desktop](../output/playwright/epic2-rehearsal/public-site-desktop.png)
- [Public pilot mobile](../output/playwright/epic2-rehearsal/public-site-mobile.png)
- [Fixture completed desktop](../output/playwright/epic2-rehearsal/fixture-completed-desktop.png)
- [Fixture completed mobile](../output/playwright/epic2-rehearsal/fixture-completed-mobile.png)
- [Paused checkpoint](../output/playwright/epic2-rehearsal/fixture-paused.png)
- [Documented exact migration statements](./epic-2-production-rehearsal.sql)
