# Studio365 Model / Prompt Investigation

Date: 2026-10-06. Source state: `cce5073`, branch `codex/addz-os-epic-4`.

## Decision

**GO for a bounded implementation of domain-specific strategic synthesis with GPT-5.6 Terra / medium and a revised interpretation contract. NO-GO for switching the environment model alone or deploying these experimental outputs.**

The issue is a combination of model capability, context/prompt construction, semantic validation, contract incompatibility and worker scheduling. More crawling is not the immediate remedy. A stronger model improves interpretation, but does not repair these other problems.

No application code, schema, database, environment variables or deployment changed during this investigation. No recrawl and no Epic 4 continuation. All new API calls used the protected Preview credential from an offline experiment harness; no tools or website requests were available to the models. No experimental finding or questionnaire was published, saved to the application, approved or shared.

## Scope And Controls

Saved Studio365 synthetic scan: `1cad2580-08f7-46df-bc36-8fe08e33f416`.

- 43 completed sources; 79 catalogued products; 27 deep product pages; 128 deterministic findings.
- 46 saved source records include the failed/skipped records; only 43 eligible completed sources enter research assembly.
- Assembly: 185 candidate chunks, 61 duplicates removed, 124 retained chunks, zero budget-omitted chunks; 241,488 serialized payload characters.
- Source evidence SHA-256: `7abdfd868ec30386429344508397ab22d442025c34c5d7bdaad834d7d8c1c317`.
- The existing Research Map was frozen for A/B/C. Research Map model quality was not independently varied.
- A/B use identical source selections, task input and schema. The model **and reasoning effort** change together: Mini/minimal vs Terra/medium; this is not a pure model-only causal experiment.
- C changes instructions and adds classification/reasoning-bridge fields in the experiment schema; its compatibility adapter still passes candidates through the unchanged application validator/reviewer.
- C2 is an additional staged domain-contract probe, not another controlled A/B cell: it changes evidence bundle size, allows multiple references and uses a distinct working schema.
- One sampled generation per task/variant on one website: exploratory paired evaluation, not a statistically significant A/B test. Cached responses make inspection reproducible, not model sampling deterministic.
- Experiment calls have a 90-second timeout; application timeouts remain unchanged. No transport retry was silently added. Request-body hashes prevent repeated billed calls while inspecting saved outputs.

## Exact Current Configuration

The following files preserve exact implementation and effective requests, not paraphrased prompts:

- [Source snapshot and effective task payloads](../.tmp/ai-quality-investigation/current-implementation.json): full current AI/review/research source, four effective candidate-generation instructions, full generated task input and provider JSON schemas.
- [Exact Research Map requests](../.tmp/ai-quality-investigation/exact-research-request-payloads.json): six batch and six review request bodies reconstructed through unchanged current functions using offline transports. Includes full instructions, generated inputs, alias enums and strict schemas. No HTTP/auth headers or credentials.
- [Actual A/B/C request/output records](../.tmp/ai-quality-investigation/results.json): every generation/current-review/advisory request, response, tokens, timing and unchanged-validator outcome.
- [Actual C2 request/output records](../.tmp/ai-quality-investigation/domain-results.json): seven domain synthesis requests and the advisory verifier.

Application model selection is snapshotted in `website_scans.configuration.model` from `OPENAI_MODEL || "gpt-5-mini"`. There is no per-stage routing. The saved Studio365 scan used `gpt-5-mini` throughout.

| Current stage | Reasoning | Max output tokens | Request timeout | Exact input / output |
| --- | --- | ---: | --- | --- |
| Research batch extraction | minimal for `gpt-5*` | 10,000 | worker 35s; standalone default 90s | original chunk batches + clause aliases; strict Research Map item schema |
| Research evidence review | low for `gpt-5*` | 10,000 | worker 35s; standalone default 90s | same original chunks + indexed untrusted candidates; accept/reject decisions |
| Candidate generation, four domains | minimal for `gpt-5*` | 3,000 | 40s | selected evidence choices + fallible research guidance; strict observation schema |
| Final finding evidence/type review | minimal for `gpt-5*` | 1,500 | 35s | materialized values + one exact original evidence span; indexed decisions |
| Deterministic validation / materialization | none | none | synchronous | schema, known source IDs, literal evidence, type and wording rules |
| Questionnaire generation | none | none | synchronous | deterministic generator from eligible findings, client and package |

Provider: Responses API, `${OPENAI_API_BASE_URL || "https://api.openai.com"}/v1/responses`; `store: false`, strict JSON output. No `temperature` or tools are sent. Configurable base URL is a transport setting, not permission to crawl or invoke tools.

There are no separate conversational system/developer messages: effective behavioral instructions are supplied in the Responses `instructions` field. The generated task/context is the `input` JSON string. Both are preserved verbatim in the linked request artifacts.

The research-enabled path **overwrites** an earlier `instructions` object property. The earlier `qualityInstructions`/generic branch is not the effective prompt for this scan. Auditing only that earlier string gives the wrong answer. The linked generated request captures the final effective property.

There is a `research_synthesis` type name, but no separate AI synthesis request is executed by the present Research Map implementation: merging is deterministic.

### Research Inputs And Actual Saved Usage

Research limits: 60 sources, 20,000 text characters per source, normal 2,000-character chunks, 32 chunks / 48,000-character batch budget, at most 24 batches. Structured data/traceable oversized-section handling uses the existing assembler. The saved run used six actual research batches.

| Batch | Generation input / output tokens | Review input / output tokens |
| --- | --- | --- |
| 0 | 21,172 / 1,834 | 21,699 / 636 |
| 1 | 25,048 / 2,241 | 25,202 / 595 |
| 2 | 10,914 / 2,073 | 11,571 / 352 |
| 3 | 4,324 / 1,975 | 4,733 / 315 |
| 4 | 5,392 / 1,120 | 5,666 / 180 |
| 5 | 2,059 / 370 | 2,323 / 381 |

These are historical saved usage, not additional calls in this experiment. `ai_runs.sourceIds` lists all 43 eligible scan sources on research runs; it must not be mistaken for the exact per-request source count. Actual chunk aliases/locations in the request artifact identify the contributing subset.

### A/B Candidate Contexts

| Task | Sources | Used chunks | Text characters | Evidence choices | Serialized task characters | Actual input tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| brand_voice | 8 | 11 | 17,299 | 107 | 36,012 | 20,917 |
| products_commercial | 8 | 9 | 16,238 | 44 | 15,974 | 9,665 |
| audience_problems | 8 | 10 | 17,178 | 109 | 35,364 | 20,779 |
| differentiation_operations | 8 | 12 | 18,136 | 107 | 34,573 | 20,443 |

Research-referenced chunks receive priority. Each strategic task is bounded to eight sources / 32,000 chunk-text characters. Policies/legal-only chunks are excluded from strategic text selection, although operational fragments can remain inside product text. Evidence choices are short continuous one/two-sentence spans, up to 15/source and 120/task. The 2,400-character prefix fallback exists only when Research context is absent; it is not the active cause in this run.

### Retries And Validation

- Direct `fetch`; no hidden SDK automatic retry.
- Persisted worker: at most two attempts per research generation/review task and two per candidate generation/review task; one research provider request per chunk.
- Global candidate-generation budget: six attempts. Retry time is `max(Retry-After, min(60s, 2s * 2^attempt))`; normal first/second delays are 4s/8s.
- Exact evidence references are resolved by the application, never copied from AI-generated evidence prose.
- Observed summaries are materialized as selected extractive quotes. Inferred summaries allow interpretation, with copy-overlap/wording/type checks.
- Keys including positioning, likely audience, likely pains, desired outcomes, tone, values and use cases are hard-forced inferred by current materialization.
- Final reviewer reasons: `supported`, `unsupported_claim`, `unsupported_semantic_type`, `lost_qualifier`, `unsupported_hypothesis`. It cannot revise or separately retain hypotheses.
- Worker defect: `aiAttempts >= 6` is checked before draining a pending evidence review. Saved pending candidates can be abandoned at the budget boundary. This investigation did not fix it.

## Problems Found

1. **Inference permitted by the prompt but blocked by semantic heuristics.** The generation prompt allows practical benefits to ground possible needs/pains; pain validation still requires explicit customer/problem language. That is stricter than the stated inferred contract.
2. **Domain-biased practical-benefit detection.** Comfort, ergonomic support and long-sitting benefits quoted directly from furniture descriptions were rejected. Current expressions favor food/cooking/flavor concepts.
3. **Literal-token false positives.** A Hebrew descriptor meaning an everyday/colloquial word was treated as a claim of daily frequency. Good vocabulary interpretation was rejected.
4. **Taxonomy and scope confusion.** Models still label SKU descriptions as categories and single-product messages as whole-brand positioning. These should remain rejected, narrowed or classified as hypotheses; not bypassed by switching models.
5. **No HYPOTHESIS contract.** Potential client-confirmation questions get forced into observed/inferred published fields or rejected. They need an explicit non-factual downstream state.
6. **Explicit use cases versus forced inference.** C correctly identified directly stated meal/hosting uses, but the adapter's empty observed interpretation collided with a key forced inferred and failed schema validation.
7. **Extractive observed output loses attribution/readability.** Direct quote materialization can replace a carefully scoped AI summary with a raw product paragraph. Attribution in a discarded bridge does not protect the published wording.
8. **Conflicting prompt/schema scope.** Instructions exclude operations, variants and promotions, while schema choices still permit them. Models spent candidate slots on facts the publisher intentionally excludes.
9. **Context noise and compression.** Product controls and overlapping excerpts consume tokens. The same broad research-guided subset feeds different strategic tasks, not a tightly relevant bundle per domain.
10. **Commercial validation needs contextual scope, not just a short quote.** A short nationwide-delivery excerpt looks literally supported yet omits adjacent geographic exclusions. Conversely, unrelated conditions from concatenated source text can overconstrain an unrelated strategic claim.
11. **Verifier is not a truth oracle.** Experimental Terra reviews still missed category/type problems and supplied inconsistent verdict/classification pairs. A downgrade cannot rescue invented premises; a revision is a new claim that must be reverified.
12. **Questionnaire is still append-oriented.** More eligible AI findings lengthen the generated form without automatically replacing obvious facts or duplicate policy cards.

## A/B/C Results

All eligibility counts below are offline results through the unchanged current validator **and** current final AI reviewer. Nothing was actually published.

| Variant | Candidate outputs | Current eligible | Eligible observed / inferred | Manual conclusion |
| --- | ---: | ---: | --- | --- |
| A: Mini, current prompts | 16 | 2 | 2 / 0 | Two low-value lexical/product statements; broad audience/positioning errors remain. No useful inferred strategic coverage. |
| B: Terra medium, current prompts | 13 | 6 | 1 / 5 | Better narrow tone/message/room-fit interpretations; one brand-scope claim needs narrowing, meal/hosting audience remains a hypothesis. |
| C: Terra medium, improved prompt/working schema | 16 | 4 | 1 / 3 | Better explicit reasoning and uncertainty; legacy schema/type constraints still discard useful candidates. Some inferred wording needs source-scope correction. |

The previous complete scan had zero published strategic AI findings. A now yields two **offline eligibility** results, not a repaired production baseline. Different sampled outputs and draining all reviews in the harness, unlike the worker budget behavior, explain why this is not the same end-to-end publication measurement.

Every output, including nonstrategic and incorrect candidates, has been reviewed: [59-item manual assessment](../.tmp/ai-quality-investigation/manual-review.md) and [full claim/evidence/confidence/bridge/verdict records](../.tmp/ai-quality-investigation/manual-review.json).

### C2: Domain Bundle -> Synthesis -> Advisory Verifier

Seven deterministic bundles assembled only from saved original chunks, each capped at 24 short evidence choices / four choices per source. No new Research Map, no full-site indiscriminate prompt, no AI-extracted quotations.

| Domain | Source count | Evidence choices | Input characters |
| --- | ---: | ---: | ---: |
| Positioning | 7 | 24 | 9,874 |
| Audiences | 6 | 19 | 7,055 |
| Pains/needs | 6 | 16 | 6,250 |
| Outcomes | 5 | 13 | 5,287 |
| Differentiation | 4 | 12 | 4,980 |
| Voice | 8 | 24 | 9,468 |
| Objections/motivations | 2 | 8 | 2,785 |

Working schema: `summary`, `classification: OBSERVED|INFERRED|HYPOTHESIS`, `confidence`, `evidenceRefs`, `reasoningBridge`, `requiresClientConfirmation`. Short bridge means inspectable premises/uncertainty, not private chain-of-thought. Original sources remain authority; brand claims are attributed claims.

C2 produced 14 candidate ideas: four OBSERVED, five INFERRED, five HYPOTHESIS. These are raw proposed classifications, **not 14 accepted findings**. Current-contract compatibility is zero; its single-span contract, lack of hypothesis/objection types and per-domain semantic mappings cannot safely represent this output. A compatibility marker called `multi_source_research_only` also covers multiple refs from the same source; multiple overlapping spans must not be counted as independent sources.

Materially useful ideas include:

- A sampled product-message balance between design presence and visual lightness.
- Room-size/style fit as a client-confirmation topic grounded in FAQ assistance.
- Hidden storage/order as a directly attributed product benefit, separately from uncertain customer desire.
- Visual plus functional emphasis as a possible intentional brand principle to confirm.
- Online-only sales plus optional photos/video as a plausible purchase uncertainty, not proven conversion behavior.
- Repeated design vocabulary in sampled product descriptions.

Remaining failures found manually:

- Walnut-colored/stone-effect finishes were broadened to material wording requiring correction.
- Useful need/motivation questions appeared under audience identity; product benefits under desired customer outcomes; a cushion compatibility claim under voice.
- A page titled **Karo**, whose historical URL contains `monsoon-oak-copy`, was named **Monsoon**. Source identity must come from the saved product record/title, not a URL slug.
- Sculptural messaging needed source/sample qualifiers; a common product style is not proven competitive differentiation.
- Two room/style questions were redundant; three Felix attributes became one weak, compound question.
- Some advisory PASS verdicts carried HYPOTHESIS classification or missed the domain mismatch. The proposed verifier needs a coherent, fail-closed verdict contract.

Therefore C2 is the best **architecture/prompt direction**, not a production-ready output batch. B is the best **currently compatible** tested variant. Fewer current-eligible C candidates do not prove worse reasoning: compatibility/type gates confound that count.

## Questionnaire Impact

The actual existing pure questionnaire generator ran offline using the real synthetic client's newsletter service codes. No application questionnaire changed.

| Input | CONFIRM | ASK | Total |
| --- | ---: | ---: | ---: |
| Existing deterministic-only baseline | 8 | 12 | 20 |
| A without selection | 10 | 12 | 22 |
| B without selection | 14 | 12 | 26 |
| C without selection | 12 | 12 | 24 |
| B with explicit team-like input selection | 8 | 12 | 20 |

The selected B preview replaces four low-value/redundant baseline confirmations with four grounded strategic confirmations: scoped informal language, design-without-overload messaging, a possible dining/hosting segment and room/style purchase considerations. The last two remain client-confirmation assumptions, not proven customer profiles. Four core factual cards and all twelve existing questions remain. This manual selection demonstrates a same-length form using the existing generator; it does **not** prove automatic selection is implemented.

See [generated questionnaire preview](../.tmp/ai-quality-investigation/questionnaire-preview.md) and [complete comparison snapshots](../.tmp/ai-quality-investigation/questionnaire-comparison.json).

C2 cannot be passed honestly into the present generator without a hypothesis/type/provenance adapter. No claim is made that its best new knowledge already drives a working form. Raw long policy paragraphs and generic ASK duplication also remain; model substitution alone cannot produce the desired client UX.

## Cost And Latency

Official model availability was checked with the Preview credential: Mini, Terra and Sol are available. All generation/review responses completed; no refusal/timeout retries were needed.

Costs are estimates from returned usage and current official prices, not invoices. Includes cached input, output/reasoning tokens, and Terra cache-write surcharge. Rates and available effort: [Mini](https://developers.openai.com/api/docs/models/gpt-5-mini), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

| Variant | Calls incl. advisory | Input tokens | Output tokens | Measured time | Estimated total USD | Generation + unchanged current review USD |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| A | 8 | 77,927 | 4,402 | 66.456s wall | 0.0512 | 0.0051 |
| B | 9 | 77,600 | 3,847 | 68.394s wall | 0.2276 | 0.1970 |
| C | 8 | 79,407 | 4,793 | 88.285s wall | 0.2440 | 0.2060 |
| C2 | 8 | 32,403 | 5,483 | 121.481s summed sequential API time | 0.1468 | 0.0891 synthesis only |

C2's total includes a 43.891-second advisory verifier. Seven synthesis calls together took 77.590 seconds. A/B/C pipeline-only API times were 18.441 / 39.400 / 53.327 seconds; the advisory verifier accounts for much of the displayed wall time. A/B/C have one additional Terra advisory call **even A**: it is not part of the current Mini production pipeline.

Mini's measured cost benefits heavily from warm caching: 71,552 input tokens cached, versus 4,824/4,956 for B/C. Do not use these totals as a cold-cache model-price ratio. C2 spends less on input by selecting smaller relevant bundles despite using more domain generation calls. No claim about full-scan cost is made because the Research Map was not regenerated in this experiment.

Total additional experimental estimate: approximately **$0.67** across 33 calls. Model listing and offline request captures do not generate AI output. Full usage is in [metrics](../.tmp/ai-quality-investigation/metrics.json) and individual call records.

## Recommended Production Architecture

This is a recommendation to implement and validate, not configuration applied today.

`Stored source/chunks -> deterministic domain evidence bundle -> strategic synthesis -> independent verifier -> revise/reverify or retained hypothesis or publish -> bounded questionnaire selection`

| Stage | Recommended model / effort | Status / boundary |
| --- | --- | --- |
| Products/prices/policies/source identity | No AI | Keep deterministic extraction and strict operational context/qualifiers. |
| Evidence bundling / chunk dedupe | No AI | Domain-relevance selection from original chunks; Research Map can guide, never be evidence or sole selector. |
| Existing atomic Research Map working context | Keep Mini minimal + low review initially | Not independently re-evaluated here. Do not automatically escalate every call. Its failure must not block access to original evidence. |
| Strategic synthesis by domain | Terra medium | Best direction tested in C2. Atomic type/scope/classification/bridge/provenance fields required. |
| Independent interpretation/evidence verifier | Terra medium, small domain batches | Tested advisory capability, but output-contract/type checks still required. No automatic trust in reviewer. |
| Questionnaire generation and selection | No new AI initially | Consume safely typed observations/inferences/hypotheses; replace redundant cards under a fixed length budget. |
| Sol / high effort | Not enabled by default | Not tested; no evidence yet that extra reasoning would fix the demonstrated contract/context/type defects. Escalate only on persistent reasoning failures after those fixes. |

Do **not** simply set `OPENAI_MODEL=gpt-5.6-terra`: current `startsWith("gpt-5")` logic sends `minimal`, which Terra does not support. Introduce explicit stage/model capability routing and snapshot versions with each run. No Production settings were changed.

### Contract And Verifier

- OBSERVED: direct support for wording **and semantic relationship**, including product identity, attribution, conditions and scope.
- INFERRED: exact concrete premises plus an inspectable reasoning bridge, narrow scope and calibrated uncertainty. Do not require inference to be a source quotation.
- HYPOTHESIS: useful grounded possibility reserved for client confirmation. Never pass it through a field that suggests observed truth; never invent missing premises.
- Verdicts: `PASS_OBSERVED`, `PASS_INFERRED`, `DOWNGRADE_TO_HYPOTHESIS`, `REVISE`, `REJECT`, each with compatible classification and explicit reason code. A retained hypothesis is not a published fact.
- `REVISE` creates a new candidate that must pass deterministic provenance checks and independent review again. Downgrade changes certainty only; it cannot cure false product identities, semantic types or invented attributes.
- Genuine taxonomy requires taxonomy/collection signals. Product type, variants and bundle contents remain separate.
- Commercial/legal/medical/demographic boundaries remain strict; include adjacent/full relevant rule context when needed. No broad shipment rules derived from a convenient isolated sentence.
- Tone still needs interpretation grounded in wording; raw quotations are not tone. Product-vocabulary patterns are not automatically tone and common aesthetics are not comparative differentiation.
- Validate all refs and actual source count; overlapping spans from one page do not establish independent support.
- At most a small bounded number of revisions. Drain pending reviews before a generation-attempt budget exit.
- Keep one provider request per persisted worker chunk and small verifier batches. The experimental 44-48 second advisory batches do not fit the current 35-second reviewer timeout; whole-site advisory batching must not be copied into production.

## Smallest Next Implementation

1. Define the three-way interpretation contract with semantic type, product/brand scope, attribution, bridge and original references; add fixture tests from this study.
2. Add explicit Terra/medium strategic routing; retain deterministic facts and the existing bounded worker architecture.
3. Assemble relevant domain bundles from original chunks, preserve policy context for sensitive conditions and use trusted source identity rather than URL guesses.
4. Update semantic validation narrowly: allow sound inferred bridges and genuine non-food benefits; keep strict observed/type/taxonomy/claim-expansion boundaries. Add coherent verifier/revision states.
5. Fix pending-review draining and ensure hypotheses/revisions do not silently become published facts.
6. Add a fixed-length questionnaire selection/confirmation adapter, then revalidate saved Studio365 and prior Ayelet/Spicehaus fixtures before another release gate.

No new crawl, database migration, stronger model everywhere, giant site prompt, Brand Brain generation or Epic 4 work is justified by this experiment.

## Validation And Limitations

- 33 real API calls completed across A/B/C/C2. 59 candidate outputs manually assessed.
- Offline artifact assertions pass on Node 22: all 59 outputs have evidence/manual review, all six Research Map generation/review bodies are captured, selected questionnaire is 20 items / 8 CONFIRM / 12 ASK.
- No application unit/lint/build/E2E rerun: there were no application-code changes. This is an investigation, not a release gate.
- Single-site/single-sample comparison; frozen Research Map; different reasoning settings; C schema and C2 context changes are explicit confounders.
- C2 still has semantic/identity/qualifier errors and redundant hypotheses. It is not approved for automatic publication.
- Final recommendation: **GO to implement the bounded architecture/contract changes; NO-GO to deploy or treat a model-only switch as sufficient.**
