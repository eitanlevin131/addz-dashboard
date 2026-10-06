# Epic 2 Minimal Release Confirmation

Date: 2026-10-06. Node 22.23.3. Branch `codex/addz-os-epic-2`.
Decision: **GO for a separately approved controlled Production rollout**, subject
to fresh Production preflight and recovery verification. No rollout performed.

## Results

| Check | Result |
| --- | --- |
| Lint | Passed: 0 errors, 3 existing unused-variable warnings; 6.221s |
| Next.js production build | Passed; includes TypeScript; 18.068s |
| Explicit `tsc --noEmit` | Passed; 4.242s |
| Existing Website Intelligence E2E scenarios | 2 passed, 0 failed; 200.541s |
| Source/export identity | All 136 source files match; no application edits during this confirmation |
| Partial-quotation guard in built server code | Present in `.next/server/chunks/909.js`, including normalized comparison, 70% phrase-overlap threshold and rejection code |
| Fixture safety in built code | Vercel block and exact isolated DB allowlist present in server chunk 5572 |
| Hardcoded mock credentials/provider addresses in built JS | None found |
| Client-role access | GET history/detail and POST scan creation return 403; internal Website Intelligence view unavailable |

The first E2E attempt failed both scenarios because an old mock relabeled
ingredient composition as a product benefit. This was correctly rejected by
the strengthened publication boundary. Only `e2e/mock-services.mjs` changed:
the products task now selects the existing explicit subscription sentence and
uses the `subscriptions` key. No production validation was weakened; no scan
status assertion was relaxed. Targeted lint of the changed mock passed. Both
affected E2E scenarios were rerun successfully; application source/build stayed
unchanged, so no second build was needed.

## Isolation and Security

- Exact current source exported without application `.env` files. Node 22 ran
  lint/build/typecheck and the production-style Next start used by Playwright.
- Database: the existing dedicated synthetic `addz_epic2_validation`, endpoint
  `ep-summer-waterfall-aprx73rb`. Identity and all eight required foundation/
  Website Intelligence tables were checked read-only. No schema changes.
- App/provider mocks: localhost ports 3460/3461, synthetic auth identities and
  keys; Flashy/Resend/OpenAI requests are mock-only and Blob tokens are empty.
- Public Ayelet/Spicehaus websites were not fetched. E2E scan data came only
  from the fixed local synthetic fixture adapter. Real AI calls: zero.
- Fixture access refuses Vercel runtimes even with E2E flags enabled. It also
  refuses unflagged environments and requires identical app/test DB bindings
  matching the dedicated isolated allowlist. Guard checks passed; provider mock
  server/configuration are not part of the production application bundle.
- All internal scan/finding routes use `clientApi` and its `requireAdmin`
  boundary. The first E2E scenario verified real synthetic client OTP login,
  API 403 responses, absence of internal data/view, RTL/mobile, provenance,
  review tagging, history and cancellation. The second verified persisted
  concurrency leases, expiry/resume, retry, sparse/challenge/partial outcomes.
- No Vercel CLI, Production connection, environment change, merge, push,
  deployment, Production migration or Production write occurred.

Application source fingerprint:
`f7a18cc3a00776700c9d6e9d4888e53a9f82cc3dbafd695c90edc3f1b7cf63ac`.
HEAD remains `0de7bbbccebfbac2a0dde12df81018fab8b87def`; the approved local
implementation includes uncommitted additions. HEAD alone is not the release
commit and must not be deployed as though it contains the final fixes.

## Remaining Limitations

- Three non-blocking lint warnings remain unchanged.
- Website Intelligence is evidence-backed observation/hypothesis context, not
  verified business truth, a completed questionnaire or an approved Brand Brain.
- No browser renderer: blocked/JS-only content and unavailable variants can
  remain coverage limitations. Findings may be deliberately conservative.
- Processing is checkpointed/resumable; closing the UI need not finish the full
  scan. The existing Workspace resume action remains necessary when paused.
- The copying guard detects substantial quotation, not every possible semantic
  error. Existing entailment/type/commercial checks remain authoritative.
- Scan notification email is explicit opt-in; this confirmation used only mock
  delivery and did not enable/change Production notification configuration.
- This minimal confirmation does not replace a fresh Production schema/data/
  binding preflight. It adds no migration beyond approved `0019`.

## Production Rollout Order: Approval Required

1. Freeze the exact tested Epic 2 source state in a reviewed release commit;
   exclude `.tmp`, outputs, backups, synthetic configuration and unrelated
   changes. Record its SHA and the currently live deployment/commit for rollback.
   Do not push/merge `main` before the schema preparation is complete.
2. Verify canonical `addz-dashboard`, repository/`main` and disconnected legacy
   projects. Reconfirm the unchanged verified Production binding: Neon project
   `icy-dawn-73041521`, branch `br-tiny-pond-apeto61v`, `neondb`, endpoint
   `ep-bold-union-api79m0y`. Do not change the binding or expose credentials.
3. Fresh read-only Production preflight: complete Epic 1 schema, expected absence
   of Epic 2 tables, legacy row/integrity markers, no material drift. Stop and
   review any unexpected delta; never replay migrations based on filenames.
4. Create a fresh preserved Production-head recovery branch and consistent
   portable backup; verify identity, checksum and recovery availability before
   any Production write. Do not rely only on the older rehearsal backup.
5. Execute only the previously rehearsed `0019` SQL using the reviewed wrapper
   in `docs/epic-2-production-rehearsal.sql`: explicit transaction, fail-fast
   assertions, `lock_timeout=5s`, `statement_timeout=60s`, `ON_ERROR_STOP`.
   No historical migrations, `db:push`, fabricated history or data cleanup.
6. Before application deploy, verify all four tables/76 columns, defaults/FKs/
   indexes/checks and partial active-scan uniqueness, plus unchanged legacy
   records. Stop on failure; transaction failure means no application deploy.
7. Release only the recorded approved commit through canonical Production,
   preserving existing Production secrets/provider bindings. Merge/push `main`
   or deploy/promote only after schema verification, with rollback ready. Never
   promote the localhost/synthetic build or reuse Preview DB/provider settings.
8. Controlled smoke tests: existing reports/packages/contacts/Gantt/summaries/
   AI history/login; internal Website Intelligence creation, evidence, review,
   history/resume/cancel; client role 403/no internal view. Use a marked synthetic
   client for new records. Do not trigger live marketing/customer messaging.
9. Observe runtime DB/auth/scan/lease/retry and normal scheduled jobs without
   manually forcing customer-impacting work. If the application fails, restore
   the recorded prior deployment while keeping additive schema/new records.
   No destructive schema rollback without separate approval.

Stopped after isolated confirmation. No full release-gate rerun or Production
action was started.
