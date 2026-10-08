# Epic 4: Kickoff / Characterization

Status: isolated Preview validated; NOT LIVE in Production. Baseline: live Epic 3 application
`ad4947f635a19657261bfe75c65ea81a43a1611d`; documentation-only `f45bc90` carried forward.

## Locked V1 Decisions

- The Product Owner's Epic 4 instruction supersedes the original roadmap's
  Epic 4/5 ordering: Kickoff / Characterization precedes Approved Brand Brain.
- Existing team-only Client Workspace, auth, Hebrew/RTL shell, questionnaire,
  Pre-Kickoff and audit infrastructure; no new application, AI or providers.
- One characterization per client. Preparation starts after a questionnaire is
  submitted/reviewed. Snapshot preserves its revision, selected source questions,
  answers, source evidence and package/scope at the meeting's start. Later source
  changes do not rewrite preparation. Regeneration/version UI is deferred.
- Confirmed/answered client statements flow into known information. Corrections,
  rejected/partial answers, needs-review sources, unconfirmed hypotheses and gaps
  require discussion. High-priority client statements may also enter the agenda.
  An inference remains an inference in its original website provenance even when
  the client confirms it; the confirmation is a separate client statement.
- Six outcomes: confirmed, corrected, new information, decision, unresolved,
  follow-up. Each has a bounded structured value/note, actor and timestamp.
  Staff can add kickoff-only topics in centralized characterization domains.
- Summary is deterministic. Meeting decisions override the current interpretation
  of that topic only; original questionnaire and website inputs remain visible.
  Unresolved/follow-up decisions exclude prior values from resolved output.
  Unfilled domains stay empty. No semantic inference from generic free text.
- Completing a meeting may leave unresolved items, prominently separated in the
  summary. Completed meetings are read-only until explicitly reopened by staff.
  This is an INTERNAL characterization, never Approved Brand Brain or client approval.
- CAS revision fence + update + audit event are one atomic Neon batch. History
  of changed decisions is stored in existing audit metadata, not a second event system.
- Migration 0021 is additive only: one client_characterizations table. No existing
  business data rewritten; no Production migration/deployment authorized.

## Acceptance

Submitted Pre-Kickoff -> prepare -> known information / focused agenda -> resolve
conflict -> add kickoff-only information -> unresolved/follow-up -> complete ->
structured summary / provenance -> explicit reopen. Team-only API, origin/body
validation, inert text, CAS conflict handling. Isolated migration integrity checks,
unit/type/lint/build, desktop/mobile RTL E2E and Epic 1-3 regressions.

## Deferred

Approved Brand Brain, AI synthesis, client editor/approval, regeneration/version
UI, recording/transcription, meeting bots, calendar/tasks/CRM integrations,
collaborative editing and automated sending.

## Implementation

- `src/lib/kickoff/core.ts`: centralized domains/outcomes, reused Pre-Kickoff
  conflict classification, immutable preparation, deterministic agenda/summary.
  Broad/mixed inputs stay broad; benefits do not become differentiators, and
  cross-domain preparation questions do not become positioning facts.
- `src/lib/kickoff/repository.ts`: one characterization per client, source revision
  lock at creation, optimistic revision fence and atomic update/audit. Audit
  includes previous/new decisions, actor and timestamp; source records never change.
- Team-only `GET/POST/PATCH /api/clients/:id/kickoff`: bounded 64 KiB JSON body,
  same-origin mutations, no-store/private responses, safe error handling.
- Existing Workspace gains a meeting tab and the questionnaire preparation gains
  a direct link. Agenda prioritizes conflicts; confirmed information is separate.
  Known information may be selected for discussion when relevant. Per-topic outcome,
  value and note; new topics; structured summary; explicit complete/reopen.
- `0021_kickoff_characterization.sql`: only `client_characterizations`, 12 columns,
  primary key, 3 FKs, 4 checks and 3 indexes including one-client uniqueness.
  Immutable JSON snapshot, added topics, current decisions, CAS revision and
  completion timestamps. No new Brand Brain or separate audit system.

## Isolated Validation - 2026-10-06

- Node **22.23.3**. Full unit suite **336/336**, including **13** kickoff tests.
- Lint **0 errors**; 3 pre-existing Epic 2 unused-variable warnings remain.
- TypeScript and final production-style webpack build passed. Initial build hit
  the same stale generated-cache hash error seen in Epic 3; preserved the old
  cache and clean rebuild passed, without dependency/framework changes.
- Full isolated E2E run: **10/11**; one new test selector matched both a visible
  value and its hidden provenance copy. Fixed selector; focused rerun passed the
  meeting loop and both questionnaire scenarios, but revealed test-only OTP
  cooldown from reusing a synthetic staff identity. Separated identities (same
  existing questionnaire-test convention); final kickoff rerun **2/2 passed**.
  All **11 distinct scenarios** passed across full/focused runs. No auth changes.
- Existing five dashboard/Epic 1 scenarios and two Website Intelligence scenarios
  passed: reports/Gantt/summaries/grounded AI, packages/pricing/scope, contacts,
  Flashy mock linking, owner/client restrictions and scan resume/history/leases.
- Kickoff flow covered preparation, automatic known information, corrections,
  rejected hypotheses, new kickoff-only info, follow-up/unresolved separation,
  summary, completion lock and reopen. Original questionnaire/website evidence
  unchanged. Atomic race returns **200/409**, with exactly one decision audit.
- Anonymous API GET/POST/PATCH **401**; actual synthetic client session **403**,
  internal UI hidden. Cross-origin **403**, oversized body **413**, invalid shapes
  **400**, frozen meeting write **409**; inert HTML cannot execute.
- Desktop **1280x720**, mobile **390x844**, Hebrew/RTL: screenshot inspection passed;
  no horizontal page overflow. Screenshots are ignored validation artifacts under
  `output/playwright/epic4/`, not release source.
- Applied **0021 only** to existing synthetic databases `addz_epic2_validation`
  and `addz_epic3_migration_validation`, on endpoint `ep-summer-waterfall-aprx73rb`.
  Explicit Neon transaction; lock timeout **5s**, statement timeout **60s**,
  fail-fast schema/target assertions. Existing table counts/full-record hashes
  and column metadata unchanged. All 12 columns, 8 constraints and 3 indexes verified.
- Email/Flashy/OpenAI use local mocks; Blob disabled. No new AI or website requests
  for Kickoff. No Production DB query, migration, deployment, environment change,
  main merge or customer message performed.

## Local Review and Preview Readiness

Local development preview uses an env-free source copy and the exact synthetic
database, at `http://localhost:3090/`, with mock providers on 3091. Reused the
existing local-preview launcher, adding an optional port argument because 3080
was occupied; existing server was left untouched. A clearly marked synthetic
demo is retained only in the isolated DB. Development bypass is existing and
disabled by the production NODE_ENV gate, not a new production auth path.

**GO FOR ISOLATED PREVIEW**, not Production approval. Next: inspect a genuinely
isolated Preview's Epic 3 schema, apply only 0021 with recovery/transaction checks,
deploy this exact candidate without changing main, then validate real Preview
team/public-questionnaire/client permissions and the meeting loop. Production
needs separate preflight/rehearsal/approval; never replay historical migrations
or use db:push. Roll back application only if needed, retaining additive data.

## Isolated Vercel Preview - 2026-10-06

- Application candidate: `4d61e538c7a875cb78b7dcd692a0678a5b4adbd1`, branch
  `codex/addz-os-epic-4`, extends approved local candidate `be15279332f1444e6f1b6ba9f314cafe634471a5`.
  Scoped UI refinements in `0786572c092df3eb4b46e97287b4ff6d4c62d56a` and the final
  candidate; no new API/auth/model changes. Documentation updates are separate
  from the exact deployed application artifact.
- Canonical project Preview: `dpl_4kY4MrHoq9SwEoMsm4DsNMogUcQC`, READY,
  `https://addz-dashboard-2wo4gz9pn-eitans-projects-5ee0b2bf.vercel.app`, Node 22.x.
- Fresh Production-state clone: Neon project `icy-dawn-73041521`, source
  `br-tiny-pond-apeto61v`, isolated branch `addz-epic4-preview-20261006`
  (`br-floral-truth-apgxit0n`), endpoint `ep-summer-shape-apwj44zq`, database `neondb`.
  Created 2026-10-06 14:51:05 Asia/Jerusalem. Pre-migration schema fingerprint
  `81ca7822c4c6946a878f70681677965455c63b5ab3717f6dbd5723c2ee3bcaca`.
- Epic 3 schema already present; 0021 absent before execution. Applied **0021 only**
  after a readable custom-format portable backup of the clone. Explicit transaction,
  ON_ERROR_STOP, lock timeout 5s, statement timeout 60s, fail-fast assertions.
  Verified 12 columns, 8 constraints, 3 indexes; original legacy schema and complete
  row hashes unchanged. No historical replay or fabricated migration history.
- Deployment-only overrides: isolated DB role and independent auth/encryption
  secrets; Flashy, Resend, OpenAI, Blob and Cron disabled. No project environment
  variables changed. Clone-only RLS prevents real copied users from authenticating
  and copied Production questionnaire tokens from working. These isolation policies
  are NOT application migrations or Production changes.
- UI: compact meeting status/counts, prioritized working agenda, focused decision
  form with clear labels, secondary known information, folded source/history and
  preparation details, distinct handled/follow-up states, domain-grouped summary.
  Save decision is the primary meeting action; completion/reopen stays explicit.
- Node 22 final typecheck/build passed; targeted component/test lint passed.
  Full lint has 0 errors and the same 3 pre-existing Epic 2 warnings.
- **One clean complete local isolated E2E pass: 11/11, 6.9 minutes.** Covers all
  existing dashboard/Epic 1, Website Intelligence, questionnaire and kickoff paths.
  Website fixture fetching intentionally refuses Vercel; this guard was preserved,
  rather than enabling local-only mock behavior in deployed application paths.
- Deployed Preview questionnaire/kickoff scenarios: **4/4 in one clean run**.
  Real isolated NextAuth password sessions, not forged tokens. Website findings
  are synthetic persisted inputs; no new website crawl or AI calls. Full public
  questionnaire -> reviewed Pre-Kickoff -> meeting exercised through the UI.
  Original website/questionnaire evidence unchanged; correction, added information,
  follow-up/unresolved, completion freeze and explicit reopen verified.
- Deployed security: anonymous 401, client 403/internal UI hidden, cross-origin
  403, invalid payload 400, body limit 413, frozen write 409; CAS race permits one
  write/audit only. Public token isolation/expiry/rotation and inert HTML passed.
- Fixed one existing test-only rate-limit assertion at minute rollover: initialize
  the current request bucket before forcing its limit. Preview harness fixes were
  untracked isolation artifacts: set synthetic passwords before tests and wait for
  async preparation before inspecting its result. No auth/rate-limit product change.
- Manually reviewed deployed desktop meeting/summary and mobile summary/meeting,
  Hebrew/RTL, usable controls, folded supporting context and no horizontal overflow.
  Screenshots: ignored `output/playwright/epic4-preview/` validation artifacts.
- Final protected-row and schema checks passed; transient login-code/rate-limit
  records are explicitly excluded from post-smoke business-row comparison.
  Production deployment/environment metadata remained unchanged. No Production DB
  writes/migrations/deployments, main merge, real messages or provider work performed.

**GO FOR PRODUCTION PREFLIGHT**, not release authorization. Next: fresh read-only
Production binding/schema/data/config checks and a Production-state 0021 rehearsal
with recovery protection, then explicit Production rollout approval. No further Epic.

V1 limitations: one preparation per client; fixed source snapshot, no regeneration
UI; explicit save per decision, no collaborative autosave; no dedicated decision
diff UI (history remains in audit metadata); broad multi-domain statements are not
automatically split/reclassified; no AI, sending, client approval or Brand Brain.

## Local Product Review - Document-First Characterization

The Product Owner clarified that the primary meeting surface must be an editable
characterization document, not an agenda/decision manager. The existing Spicehaus
characterization Google Doc was read as a structural reference only; none of its
client content is copied to another client. This local update is NOT deployed.

- Default view: one continuous Hebrew/RTL document with numbered chapters,
  chapter navigation, concise field headings and editable sections in place.
  Chapters follow the reference's brand/background, pains/needs/desires, audiences,
  positioning/differentiation, buying motivations/objections, products/categories,
  voice/claims, commercial decisions, operations/assets and remaining priorities.
- Confirmed questionnaire content is prefilled. Corrections, rejected statements,
  hypotheses and partial meeting notes remain visibly unresolved until staff
  explicitly records a meeting outcome. Empty chapters remain empty, with an
  add-section action; no AI-generated filler or invented strategic conclusions.
- Text editing is primary; section status is secondary. Existing decision/topic
  APIs, revision fence, audit history, completion freeze and explicit reopen remain
  authoritative. Saving an edit records meeting information, not a source rewrite.
- Long text is available under a complete-text disclosure, split into readable
  paragraphs without removing policy conditions. Original evidence and answers
  stay accessible separately. Older catalog/voice snapshot assignments receive
  presentation-only chapter mapping, without mutating their stored snapshot.
- The focused open-topic view and original questionnaire answers remain secondary.
  No new table, migration, provider, crawl or AI call. This is an in-app document,
  not a Google Docs integration, collaborative editor or Word/PDF export.

Validation: Node 22; **20/20** focused kickoff/document unit tests; scoped lint
**0 errors/warnings**; isolated production-style TypeScript/build passed. Final
kickoff E2E **2/2** passed (47.4s), including document editing/reload, inline section
creation, completion/reopen, unchanged source records, client 403, anonymous 401,
CAS/body/origin boundaries and mobile RTL without overflow. Questionnaire regression
**2/2** passed during the preceding run; it was not rerun after editor-only changes.
One test-only completion wait was updated because the document is already selected
before completion, so selected-tab state no longer proves the mutation finished.
Manually reviewed the local Studio365 document and opened its editor without saving
or changing the user's submitted answers. Production was not queried or modified.

## Local Product Review - Explicit Characterization Questions

The document review exposed gaps in questionnaire generation, not evidence that
missing strategic answers can be invented. Newly generated `questionnaire-v2`
snapshots add eleven required client questions: business/brand story, positioning,
promise, differentiators, pains, needs, desires, buying motivations, objections,
four leading categories ordered by business importance, and eight best-selling
products ordered by sales. These questions remain explicit ASK items even when
the website provides observations about the same topic.

- Questions include practical Hebrew guidance and distinguish customer feedback
  from hypotheses. A deliberate unknown/meeting answer is allowed and stays
  unresolved in the document; silent omission is not a complete required answer.
- Category/product rankings use numbered inputs and the existing plain-text answer
  field. The UI and API validate ordering, duplicates and bounded entry lengths.
  Smaller assortments may provide fewer real entries rather than fabricated ones.
  Promotion priorities remain separate from best-selling products.
- Client answers flow verbatim into their matching document chapters with
  `client_statement` authority. Rankings retain their order. Existing questionnaire,
  website evidence and kickoff snapshots are not rewritten; submitted Studio365
  remains unchanged. Existing snapshots without ranking metadata remain supported.
- No DB/schema changes, AI calls, crawls, deployments or Production data access.
  The isolated local preview source was refreshed, without changing provider/env
  bindings. Existing questionnaires need real supplemental answers, not auto-fill.

Validation on Node 22: **62/62** focused questionnaire/presentation/strategy/kickoff
unit tests (including **9** new strategy/ranking tests), scoped lint with no errors,
isolated TypeScript/build passed. All **4** focused questionnaire/kickoff E2E cases
passed across the initial run and the affected-case rerun. One new test selector
was corrected from raw label text to the textbox's accessible name; no application
fix was needed. The full questionnaire flow exercised mobile RTL, gap prevention,
4/8 ranking autosave, strategic answers, submission freeze, unchanged website
evidence and kickoff domain/value/authority mapping. Existing security cases
verified anonymous/client denial, token isolation and optimistic concurrency.
