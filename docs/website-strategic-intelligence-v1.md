# Website Strategic Intelligence V1

## Goal And Delivery Boundary

Improve business understanding from public website evidence, not merely return a
catalogue or raw policy excerpts. This is a local application refinement on
`codex/addz-os-epic-4`, based on `cce5073`. No Production access, migration,
environment-variable change, deployment or website recrawl is part of this work.
The existing crawler, SSRF/DNS pinning, robots behavior and database schema remain
unchanged. No new Epic 4 feature or Approved Brand Brain is created.

## Implemented Plan

1. Assemble original persisted chunks into seven bounded business-domain bundles:
   positioning, audience/use cases, needs, outcomes, differentiation, voice and
   purchase objections. Prefer diverse relevant sources over one page prefix.
2. Use GPT-5.6 Terra with medium reasoning for strategic synthesis and independent
   evidence/type review. Snapshot model and contract versions on new scans.
3. Preserve explicit observation, grounded interpretation and client-confirmation
   hypothesis as different classifications, with scope, attribution, concrete
   premises, original references, hashes and offsets.
4. Feed a bounded selection to the existing questionnaire and expose all supporting
   sources internally. Do not approve, share, answer or message automatically.
5. Validate against saved Studio365, Ayelet and Spicehaus evidence using real Preview
   AI, then exercise the integrated application in an isolated mock-provider DB.

## Actual Architecture

`persisted original sources -> deterministic domain bundles -> candidate synthesis
-> deterministic publication checks -> independent reviewer -> atomic findings
checkpoint -> bounded questionnaire`

New scans snapshot `STRATEGIC_VERSION` and `WEBSITE_STRATEGIC_MODEL` /
`WEBSITE_STRATEGIC_REVIEW_MODEL` (both default to `gpt-5.6-terra`). No environment
setting was changed. Contract: skill 1, prompt 2, schema 2. Existing scans without
this snapshot retain their original Research Map pipeline/history. Original chunks
remain evidence; a Research Map never substitutes for a source. New scans do not
depend on a successful extra Research Map to access original evidence.

Per domain: at most 24 complete chunks, four primary chunks per source, 36,000
serialized chunk characters and three candidates. Selection sorts URLs/IDs before
assembly so database row order cannot change evidence aliases between resume steps.
Structured ecommerce content and later policy sections use the existing assembler.
This is bounded research, not a whole-site completeness claim.

One provider call per persisted worker lease: generation or review, never both in
one chunk. Each step has at most two attempts and a 35-second provider timeout.
Generation is reviewed before advancing to another domain. Failed/interrupted calls
are recorded in existing `ai_runs`; existing fencing, retries, notifications,
cancel/resume and partial-success handling remain in use. Completed generation
must retain the same input fingerprint before review. Contract drift requires a
fresh scan, rather than silently reinterpreting old evidence.

## Interpretation Contract

- `OBSERVED`: the wording and semantic relationship are directly supported. Brand
  and product claims are explicitly attributed, not independently verified truth.
- `INFERRED`: narrow interpretation grounded in original references; confidence
  cannot exceed medium. A copied/promotional quote is not an interpretation.
- `HYPOTHESIS`: useful uncertain client question with actual evidence premises;
  confidence is low and client confirmation is required. It is stored under the
  existing inferred status plus explicit JSON classification, not a new DB enum.
  Derived problems cannot be labeled as directly stated customer problems.

Every reference is resolved by application code, never AI-authored evidence text.
Multiple references preserve all original source locations. Independent review
checks exact claim, category, scope and qualifiers; inconsistent verdicts fail
closed. Mission is not customer pain, storage instructions are not benefits,
bundle contents are not taxonomy, product aesthetics are not proven differentiation,
and product identity uses saved product names/titles, not URL slugs.

Strategic AI does not rewrite numeric commercial rules. Products, prices and
policies retain deterministic extraction. Unsupported premiums/lifestyle descriptors
and invented direct quotations are rejected even if a model reviewer accepts them.
Website text is untrusted input; calls have no tools and cannot execute site prompts.

V1 deliberately rejects rather than auto-revises/downgrades unsupported candidates.
An automatic rewrite would create another claim requiring independent verification;
that extra orchestration is deferred. More accepted findings is not itself a gate.

## UI And Questionnaire

Workspace distinguishes observed/inferred/hypothesis totals and labels. Expanded
findings show all original sources and the short inspectable evidence bridge, not
private model reasoning. Progress counts the seven domains for new scans.
Questionnaire generation balances at most eight website confirmations across known
facts, audience, customer reality and brand; existing package questions remain.
Hypotheses are explicitly unverified questions, including in downstream meeting
preparation. Old questionnaire snapshots and source histories are not rewritten.

## Saved-Source Real AI Validation

The final candidate was revalidated using real Preview AI with the existing protected
local credential. No database reads/writes or crawler calls occur in this harness.
These are **publication-eligible offline results**, not findings published into a
live client account. Reused cached calls are not represented as newly billed calls.

| Website | Saved source records | Eligible AI items | Observed | Inferred | Hypothesis | Rejected |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Studio365 | 46 (43 completed) | 16 | 8 | 3 | 5 | 5 |
| Ayelet | 20 | 14 | 6 | 3 | 5 | 7 |
| Spicehaus | 20 | 15 | 7 | 4 | 4 | 6 |

All 21 candidates per website were checked; eligible items were manually inspected
against their saved source evidence. Quality issues caught during review included
unsupported luxury/lifestyle wording and quoted CTA paraphrases. Both gained
deterministic regression checks. No known unsupported wording/type remains in the
eligible set. This is a bounded manual assessment, not a guarantee against all future
model mistakes.

Useful coverage: Studio365's online-only purchasing, room/style assistance, sampled
product use/comfort claims and possible fit/delivery concerns; Ayelet's explicit
audience, approachable cooking proposition, guided product choice and allergen
questions; Spicehaus's bottled mixology, hosting/gift use cases, language and delivery
uncertainty. Ayelet's voice candidates all failed validation; no replacement tone was
invented. Some use-case/benefit and need/objection overlap remains possible.

Final generation/review usage, including cached reviewer requests in the eligibility
replay: Studio365 200,065 input / 5,867 output tokens; Ayelet 203,886 / 5,252;
Spicehaus 211,384 / 6,104. No cached input reported for those final calls. Summed
provider durations: 111.9s / 101.1s / 110.5s; these are **not complete scan times**.
Earlier exploratory calls are additional usage. Monetary figures are not invoices
and are intentionally not asserted here without a current billing-price check.

## Validation And Release Boundary

Tests cover literal/reference integrity, multisource provenance, stable replay,
semantic type, dietary/time-saving expansion, copied inference, premium descriptors,
direct quotations, product identity, non-food benefits, hypotheses, model routing,
provider refusal/sanitized errors and bounded questionnaire consumption.

Build/E2E use a separate source snapshot with no repository Production `.env.local`,
Node 22, a guarded isolated database (`addz_epic2_validation`), synthetic identities
and mock Flashy/email/AI providers. Blob credentials and cron are disabled. Real AI
validation is separate from browser fixture testing; fixture success does not prove
the real model's output quality. No mock is added to the strategic production path.

Final Node 22 validation: 391/391 unit tests passed, no skips; lint passed with
0 errors and 3 pre-existing unused-variable warnings; TypeScript/Next build passed;
the full isolated E2E suite passed 12/12 in 8.3 minutes. Browser coverage includes
clients/packages/contacts, reports/Gantt/summaries/AI, questionnaire and kickoff,
scan consent/progress, strategic evidence, resume/history/cancel, client denial,
leases/concurrency, retries, sparse evidence, blocked pages and partial success.
`git diff --check` passed. Preview runtime validation and explicit Production
approval are still required before release.

## Known Limits

- Public HTML/structured data only; blocked/JS-heavy/private websites can yield partial
  results. No credible promise of identical quality for every arbitrary URL.
- Domain selection and candidate budgets deliberately omit some useful information.
- No automatic claim revision, renderer, queue, recurring crawl or full Brand Brain.
- Processing remains resumable while the Workspace drives chunks, not guaranteed
  completion after closing the UI.
- No old scan/questionnaire is silently upgraded. A new scan exercises the new path.
- Eight confirmations are a length budget, not a complete questionnaire UX redesign.
- Runtime/model quota availability still needs deployed isolated validation.
