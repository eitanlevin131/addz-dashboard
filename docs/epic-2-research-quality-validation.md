# Epic 2 Research Intelligence: Saved-Source Quality Gate

Branch: `codex/addz-os-epic-2`. Local validation only, using the dedicated Preview
OpenAI credential and already stored source snapshots. No crawling, database
writes, schema changes, push, deployment, Production access or Epic 3 work.

## Product Contract

Website Intelligence is evidence-backed observations plus explicitly unverified
strategic hypotheses, not final brand truth. The documented future authority
order is website observed -> website inferred -> client questionnaire -> kickoff
confirmed -> approved Brand Brain. Later disagreement is onboarding information.
Neither questionnaire nor Brand Brain consumption is implemented here.

## Stage 1

| Measure | Ayelet | Spicehaus |
| --- | ---: | ---: |
| Stored source records | 20 | 20 |
| Completed source records in corpus | 20 | 15 |
| Original assembled chunks | 59 | 38 |
| Omitted assembled chunks | 0 | 0 |
| Non-legal strategic chunks | 35 | 23 |
| Accepted internal research items | 14 | 14 |
| Observed research items | 0 | 0 |
| Inferred research items | 14 | 14 |
| Rejected research items | 27 | 45 |
| Immutable source clauses/structured signals | 465 | 335 |
| Invalid clause/source traceability checks | 0 | 0 |
| Reviewed Stage 1 gate | PASS | PASS |

The 465/335 counts are raw source clauses and structured signals, NOT counts of
unique normalized business facts. Qualifier binding is explicitly unresolved;
each clause retains surrounding source chunk references. No single clause is
promoted into an unconditional shipping promise or current offer. Products and
prices retain stored structured values; conflicting inventory signals stay
separate. Entire source context remains accessible. Separate pickup/home methods,
thresholds, estimates, exception periods and historical dates are not merged.

All accepted research summaries and contributing references were inspected.
Operational rewrites, unsupported extractive paraphrases and inventions were
rejected. No definite contradiction/global missingness is generated. An empty
research category means no accepted item, not absence from the website.

### Known From the Website

Ayelet: family boutique spice business, its stated history, spice mixes/gift
groups, stored product/price data, preparation guidance and stated product
claims. Pickup/home shipping conditions, returns and service remain original
source evidence, not AI-authored summaries.

Spicehaus: bottled cocktail business and stated history, stored product/price
data, mixology-related brand claims, gift/hosting language and historical award
claims. Operational policy and inventory evidence are retained without choosing
a final truth between conflicting signals.

### Useful Hypotheses

Ayelet: home cooks seeking practical help, different experience levels, everyday
cooking uses, freshness/ingredient transparency needs, family/boutique positioning,
warm encouraging tone and recipe/community messaging.

Spicehaus: gifting and home-hosting audiences, convenient serving occasions,
mixology/premium positioning, educational cocktail content, personal service tone
and gifting themes in public reviews. Seasonal quotations retain source context;
they are not live-promotion claims.

### Future Client Confirmation

- Ayelet: priority audiences and dietary segments; actual experience distribution;
  whether convenience, freshness or ingredient transparency drives buying;
  intended tone; priority products versus website merchandising.
- Spicehaus: gifting versus personal consumption versus hosting; priority occasions;
  intended premium positioning; desired tone; which differentiators matter most;
  whether the public review themes reflect current priority customers.
- Both: current policy exceptions, validity of historical claims, commercial
  priorities and whether public website wording is still current.

### Important Unknowns

Actual customer demographics, willingness to pay, buying motivations, revenue
mix, profitability, strategic priorities and current business goals cannot be
established from this corpus. Some product variants are not exposed in fetched
data. Spicehaus retains five unsuccessful/skipped stored sources; no new fetch
was attempted. Missing accepted items are not claims of site-wide absence.

## Stage 2

Research guides candidate topics, never supplies proof. Candidates select an
immutable original evidence reference. Observed values are original quotations;
inferred values are short hypotheses. Existing quote, semantic, commercial,
observed/inferred and taxonomy gates remain active. Operational facts and variants
are excluded from AI-authored candidates.

A reject-only evidence/type review was added because manual review found errors
that exact textual overlap alone did not catch. Review cannot rewrite candidates.
Subsequent deterministic gates also reject navigation as business description and
unsubstantiated willingness-to-pay claims. This is not an infallible verifier:
manual review remains part of this quality gate.

| Measure | Ayelet | Spicehaus |
| --- | ---: | ---: |
| Generated candidates | 16 | 16 |
| Final publication-eligible findings | 7 | 5 |
| Observed | 5 | 3 |
| Inferred | 2 | 2 |
| Rejected overall | 9 | 11 |
| Known unsupported final findings after manual review | 0 | 0 |
| Reviewed Stage 2 gate | PASS | PASS |

These are local publication-eligibility results. This task did NOT insert the
findings into a database or publish them in a deployed application.

### Final Manual Review: Ayelet

1. `brand_name`, observed: exact family/boutique business statement.
2. `brand_story`, observed: exact origin statement retaining 2014.
3. `tone`, inferred: warm encouraging language grounded in the quoted invitation
   to home cooking without prior culinary expertise; client confirmation needed.
4. `categories`, observed: genuine gift product grouping with quoted bundle
   contents, not a product/SKU relabelled as a category.
5. `audience_likely`, inferred: mixed experience levels from community wording;
   this is not a measured customer segment or exclusive demographic claim.
6. `differentiators_claim`, observed: brand's own freshness/quality statement.
7. `differentiators_claim`, observed: brand's own ingredient-disclosure statement.

Rejections: deterministic-only facts (3), unsupported semantic type (2), generic
variant selector (1), incomplete commercial condition (1), unsupported explicit
audience (1), unsupported added claim (1).

### Final Manual Review: Spicehaus

1. `brand_story`, observed: exact history statement retaining March 2020.
2. `differentiators_claim`, observed: mixology/material/quality-control claim,
   attributed to the website, not externally verified superiority.
3. `social_proof_claim`, observed: site's historical awards claim retaining dates;
   no independent verification or claim that an award is current.
4. `positioning`, inferred: professional mixology/premium positioning grounded in
   the quoted quality-control and ingredient language; needs client confirmation.
5. `tone`, inferred: friendly service language from the support invitation and
   smiley. A narrow source sample, not proof of an invariant site-wide voice.

Rejections: deterministic-only facts (3), unsupported semantic type (3), unsupported
taxonomy (1), unsupported hypothesis (1), unsupported added claim (1), unsupported
explicit audience (1), unsupported customer willingness-to-pay behavior (1).

Useful multi-source research is deliberately not forced into single-source
findings. Compared with the approximate old baseline of three AI findings per
site, coverage improves without promoting hypotheses into verified truth.

## Usage

Logical final Research Map usage, including cached/reused completed batch runs:

| Site | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| Ayelet | 113704 | 32128 | 4704 |
| Spicehaus | 72142 | 25984 | 6139 |

Final candidate + evidence-review artifacts:

| Site | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| Ayelet | 80232 | 18432 | 1461 |
| Spicehaus | 79360 | 10752 | 1512 |

These are not the session's total billed usage: focused earlier attempts also
used AI, and Research Map summaries count reused runs. No billing total or cost
is asserted without an authoritative provider usage ledger.

## Implementation and Validation

- Authority principles: Master Spec, Roadmap and Epic 2 document.
- Immutable clauses: `research-facts.ts`; structured inventory companion retained.
- Research: `research-map.ts`, existing chunk assembly and versioned AI runs.
- Candidate assembly: `research-candidates.ts`, bounded original source references.
- Original evidence selection and immutable materialization: `ai.ts`.
- Reject-only entailment review: `finding-review.ts`.
- Existing resumable worker: one provider call per processing chunk, persisted
  generation/review steps, lease-fenced publication and bounded retries.
- No new migration, queue, schema, renderer or crawler infrastructure.

Node 22 targeted validation: 95 tests passed, zero failures. Targeted TypeScript
validation: zero diagnostics. `git diff --check` passed. Full unit suite, lint,
build, E2E and deployed runtime validation were intentionally NOT run here.

## Remaining Limitations

- AI review is fallible; manual review caught errors missed by it. Do not describe
  either layer as proof of final brand truth or remove internal review metadata.
- The candidate evidence menu is bounded (up to eight sources, 32000 source
  characters, 120 selectable spans); sampling covers late content but can still
  omit a useful passage. Full bounded research corpus remains stored/reconstructible.
- Some content is HTML-flattened and may include navigation near useful evidence.
- Operational clauses retain context but are not a complete normalized policy API.
- Existing source snapshots do not establish current live website state.
- More provider calls and resume cycles are needed for research/evidence review.
- The modified worker has not yet passed full isolated E2E or Vercel runtime gates.

## Final Release Gate Recommendation

Ready to START the final release gate, not approved for Production deployment:

1. Freeze/review the exact Epic 2 diff, versions and model configuration.
2. Run full unit/lint/build and isolated E2E on Node 22, including updated AI mocks.
3. Exercise persisted research generation -> research review -> candidate generation
   -> evidence review -> publication against an isolated database, checking one
   provider call per chunk and no premature or duplicate findings.
4. Cover interruption, expired lease, duplicate advances, cancellation, failed or
   malformed/refused reviews, retry exhaustion and deterministic-only fallback.
5. Re-check team/client permissions, source detail/review UI, mobile/RTL, existing
   reports, Gantt, summaries, AI history and notification isolation.
6. Revalidate the revised pipeline in isolated Vercel Preview, with original SSRF
   protections, bounded durations and customer-impacting providers disabled.
7. Complete fresh Production-style isolated migration/recovery/drift validation
   and obtain separate explicit approval before any Production rollout.

Stop here. No release gate or deployment is started automatically.
