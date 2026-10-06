# Epic 2 AI Publication Boundary Validation

Date: 2026-10-06. Node 22.23.3. Branch `codex/addz-os-epic-2`.
Decision: **FAIL for the combined AI publication gate**. Stop before any further
release-gate run or deployment.

Follow-up: the partial-quotation fix and deterministic revalidation below now
give Spicehaus **PASS for the saved-response publication gate**. The original
FAIL above is retained as historical evidence, not the current decision. This
is not a complete release-gate rerun or Production deployment approval.

## Scope

Only candidate generation, evidence review and publication eligibility were
rerun using immutable saved website source rows and existing Research
Intelligence. Ayelet used the 20-source final release-gate snapshot; Spicehaus
used its existing 20-source snapshot and saved research corpus. No research AI
step, website request, database write, migration, deployment or Production
operation was performed. Network access in the validation harness was restricted
to the OpenAI Responses endpoint using the protected dedicated Preview key.

## Implementation

- `ai-quality.ts`: material-premise checks for dietary groups, novice status,
  time-saving/frequency promises and behavioral implications; excerpt-scoped
  tone/positioning checks; reject contents/selectors/variants as taxonomy;
  distinguish explicit practical benefits from storage/composition instructions.
- `ai.ts`: candidate generation requires both wording and semantic support;
  validation applies the additional checks. Candidate skill/prompt versions are
  9/8, with unchanged output schema. Unsupported trailing sentences can be
  removed only from an inferred, non-commercial summary when the complete first
  sentence remains independently supported. Citations are never edited.
- `finding-review.ts`: independent, reject-only wording/type review, version 2/2;
  an approving model decision cannot bypass material-wording checks.
- `website-publication-boundary.test.mjs`: 24 focused regression/positive-control
  tests, including all five immutable release-gate failures.
- `website-ai-quality.test.mjs`: existing tests now reject an unsupported celiac
  audience while preserving a narrowly grounded gluten-avoidance inference.

No crawler, Research Intelligence architecture, database or schema changes.

## Targeted Tests

Six relevant test files: **103 passed, 0 failed, 0 skipped** on Node 22.23.3.
The initial run exposed a category-selector regression; rejecting generic
choose-options text resolved it without changing the existing assertion.
No full unit suite, lint, build or E2E rerun. Diff whitespace check passed.

## Real Preview AI Results

These are publication-eligible dry-run results, not database publications.

| Site | Candidates | Eligible | Rejected | Observed | Inferred | Manual gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Ayelet | 16 | 5 | 11 | 4 | 1 | PASS |
| Spicehaus | 16 | 4 | 12 | 3 | 1 | FAIL |

Actual usage: Ayelet 93,322 input / 1,026 output tokens; Spicehaus 80,474 input /
1,357 output tokens. Research Map AI was not rerun. Candidate/review requests
were performed once. A harness-only strict-schema error was corrected by
removing internal `sourceType`/`locator` properties before final revalidation;
the original responses/reviews were reused without another AI call.

### Ayelet: Every Eligible Finding Reviewed

All five use the existing `/about` source:

| Key | Classification | Manual assessment |
| --- | --- | --- |
| brand_name | observed | Quote explicitly names the family business; verbose but supported |
| brand_description | observed | Same quote directly describes the family/boutique business |
| tone | inferred | Personal, warm, approachable language supported by first-person introduction, family framing and eye-level wording |
| claims_language | observed | Exact stated freshness/quality commitment; a brand claim, not independent verification |
| differentiators_claim | observed | Same exact freshness/quality commitment, preserved as a claim |

Rejections: 4 unsupported semantic types, 1 bundle-content taxonomy, 1 unsupported
explicit audience, 1 unsupported dietary expansion, 3 deterministic-only topics,
1 unsupported claim. No known unsupported published wording or semantic
misclassification remains in Ayelet's five eligible results. Coverage is narrower
and some accepted claims overlap; this is not a completeness gate.

### Spicehaus: Every Eligible Finding Reviewed

| Key | Classification | Source | Manual assessment |
| --- | --- | --- | --- |
| brand_story | observed | `/pages/about-us` | PASS: original March 2020 origin story retained |
| vocabulary | observed | `/blogs/behind-the-drinks` | PASS: directly quoted headings/terms, no added interpretation |
| benefits | observed | `/products/tasting-gift-box` | PASS: explicitly stated presentation experience, no invented outcome |
| tone | inferred | `/pages/winter-collection` | FAIL: raw promotional quote is not a tone interpretation |

The failed `tone` summary starts `WINTER COLLECTION החורף כבר כאן` and continues
with the site's promotional wording about winter drinks. It is a shorter raw
substring of the attached evidence. The existing `missing_strategic_interpretation`
guard rejects an inferred summary only when it equals the entire evidence, so a
partial quotation bypasses it. The independent AI reviewer also approved it.
No extra factual claim is invented, but the **semantic relationship remains
unsupported**: product/promotional prose is published as tone instead of a
grounded interpretation of that prose. This is a concrete remaining publication
boundary failure, not grounds for declaring PASS.

Spicehaus rejections: 4 unsupported claims, 1 product-as-category, 4
deterministic-only topics, 1 unsupported explicit audience, 1 unsupported
semantic type, 1 weak hypothesis. The earlier overbroad tone wording was blocked
by the saved-fixture regression test; the fresh run revealed the partial-quote
loophole above.

## Next Action

Do not rerun the full release gate yet. The next bounded fix should reject a raw
partial quotation masquerading as inferred tone/positioning, add a regression
test with the saved winter quote, and recheck publication eligibility on saved
responses/sources. A supported narrow interpretation may be generated afterward
with explicit approval. Do not change crawler/taxonomy/research infrastructure.
Only after both manual site gates pass should the minimal release confirmation
be selected. Production remains unchanged.

## Partial-Quotation Follow-Up

Date: 2026-10-06. No AI requests, Research Map processing, website requests,
database writes or deployments. Original saved responses/review decisions and
source chunks were preserved; new revalidation output is stored separately.

### Exact Guard

`copiedInferenceSummary` normalizes Unicode, case, punctuation, whitespace and
combining marks, then compares word sequences. A cosmetic type-label prefix
such as `Tone:` is not counted as interpretation. For an inferred summary:

1. Reject when its entire normalized word sequence occurs anywhere in the
   evidence, including a heading or short partial quotation.
2. Otherwise mark summary positions belonging to copied contiguous phrases of
   at least three words. Reject when at least three positions are copied and
   those positions cover 70% or more of the summary. Disjoint copied spans count
   once per position, catching light trimming/rejoining with a generic wrapper.
3. Shared individual words or short terms do not count as copied phrases. A
   brief brand/product phrase inside an independent interpretation is allowed
   when it does not dominate the summary.

The guard runs after observed/explicit-audience classification, applies to all
inferred findings with or without Research context, and is repeated in the
reject-only review boundary. Reason: `missing_strategic_interpretation`.
Observed extractive facts and original evidence remain unchanged. The guard
detects substantial copying; it does not replace evidence/type entailment review
or claim to understand all paraphrases. Skill versions: candidates 10, review 3;
prompt/output schema versions unchanged.

### Validation

- Targeted Node 22.23.3 suite: **123 passed, 0 failed, 0 skipped**.
- 20 new quotation tests cover full/partial/trimmed quotes, heading labels,
  multiple copied spans, Hebrew marks, inferred semantic keys, valid tone and
  positioning controls, explicit observed audiences, favorable-review bypass,
  and the unchanged saved Spicehaus winter finding.
- Valid saved Ayelet tone and previously reviewed Spicehaus positioning are
  not rejected by the new quotation guard. No previously eligible supported
  inferred finding was removed; the only newly removed eligible finding was
  the invalid winter quotation.
- Revalidation network requests / AI usage: **0 / 0**.
- Diff whitespace check passed. Full release suite was not run.

### Spicehaus Revalidation and Manual Review

16 original candidates: **3 eligible, 13 rejected**. Eligible classification:
**3 observed / 0 inferred**.

| Eligible key | Source | Manual result |
| --- | --- | --- |
| brand_story | `/pages/about-us` | PASS: original March 2020 origin narrative, no added factual wording |
| vocabulary | `/blogs/behind-the-drinks` | PASS: directly cited headings and vocabulary, no added voice interpretation |
| benefits | `/products/tasting-gift-box` | PASS: explicitly claimed presentation experience retained, not storage guidance or invented time savings |

Winter `tone` is rejected with `missing_strategic_interpretation`. Remaining
rejections: 3 unsupported claims, 1 product-as-category, 4 deterministic-only
topics, 1 unsupported explicit audience, 1 weak hypothesis and 2 unsupported
semantic types. Every remaining eligible result was manually checked; no known
unsupported wording or semantic misclassification remains.

**Spicehaus publication gate: PASS on the saved responses.** Coverage remains
limited; zero inferred findings in this particular saved candidate set is not
proof that legitimate inference is disabled. Positive controls and the two
saved supported interpretations remain accepted by the guard.

### Smallest Recommended Release Confirmation

After approval, run lint + TypeScript/production build and only the two existing
Website Intelligence E2E scenarios in an isolated environment, with provider
mocks, to confirm the new guard works through worker publication and preserves
valid inferred findings/history/resume/permissions. The targeted unit suite and
both saved-source publication checks are already complete. No fresh crawl or
real AI call is required solely for this deterministic fix; no full release-gate
rerun was started. Production still requires its separate approved preflight,
recovery point, migration/deployment procedure.
