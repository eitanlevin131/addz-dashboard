# Epic 2: Representative ADDZ Client Website Validation

Date: 2026-10-05. This is an isolated product-quality validation, not a
Production deployment or migration. The initial local crawl completed without
AI. A subsequently approved temporary Preview ran real AI on an immutable copy
of that public evidence; see [the AI follow-up](epic-2-ayelet-preview-ai-validation.md).
The local results below remain historical; the follow-up resolves credential
availability but does not close the coverage/semantic-quality gate.

## Environment and boundaries

- Public website: https://ayeletspices.co.il/ (The Spices of Ayelet).
- The existing ADDZ client was confirmed in the Production-derived rehearsal
  copy. Its website field is null; no backfill or edit was made. The public
  domain was independently checked against the storefront's identity.
- A NEW client was created: `[TEST] ADDZ representative website - התבלינים של איילת`.
- Synthetic client ID: `fb65b237-b2e4-4411-9a81-7494420fb846`.
- Scan ID: `5ca2b1e6-0106-48cb-8cfb-be017cc4363e`.
- Rehearsal branch: `br-long-star-apv42mqb`, database `neondb`, endpoint
  `ep-floral-morning-apttpdqw.c-7.us-east-1.aws.neon.tech`.
- Approved application source: `186e8196f8e50c302a6f19e19bc855e110ebeaed`.
- Runtime: Node 22.23.3, approved createClient/advanceScan/scanDetails functions
  bundled from the clean application export. This was not another Vercel/UI test.
- Real public HTTP collection, robots, redirects and deterministic extraction;
  no site fixture responses. No browser-rendering or protection bypass.
- Flashy, email, Blob and cron were disabled. Terminal notification is recorded
  as `disabled`. No customer messaging or real marketing activity was triggered.
- No deploy, push, merge, schema change, Production client access/write or
  Production environment-variable change was performed during this task.

The driver was restarted once to use crawl-delay-aware waiting, reusing the
same persisted client/scan checkpoint rather than creating a new scan.
Only isolated harness/documentation files changed, not application code.

## AI isolation blocker

Read-only Vercel metadata confirmed the existing OpenAI credential has ONLY
Preview scope and type `sensitive`. Its retrieval response contains no value
(`decrypted=false`). No Production credential was read, copied or used, and no
variable was changed to make the Preview secret readable.

The crawl proceeded with AI explicitly unconfigured, not mocked. A separate
local test-only credential was requested from the user. It has not been supplied.
The six recorded AI-run attempts failed locally with `ai_not_configured`, before
any OpenAI request. Token counts are absent; actual OpenAI API usage/cost is zero.
No conclusion about real model quality on this website can be drawn from them.

## Final results

Completed: `2026-10-05T07:20:56.367Z`.

| Measure | Result |
| --- | --- |
| Scan status | `completed_with_warnings` |
| Discovered candidate URLs | 317; includes duplicate/noisy candidates, not 317 useful pages |
| Selected source records | 14 |
| Successfully processed source records | 12 |
| Unique useful source bodies | 11 |
| Failed / skipped sources | 1 / 1 |
| HTTP attempts | 17 |
| Sitemap URLs attempted | 1; `/sitemap.xml` failed with `sitemap_chunk_budget` |
| Deterministic findings | 13: 12 page titles and 1 shipping policy text |
| Structured product/price findings | 0 |
| Published AI findings | 0; real AI execution blocked by missing test credential |
| Observed / inferred | 13 / 0; this split covers deterministic metadata only |
| Rejected AI findings | 0 outputs available; AI evidence rejection was NOT exercised |
| Invalid published evidence | 0 |
| Minimum evidence threshold | Passed: 11 distinct pages, 29,051 useful characters |
| Wall duration | 2,125,211 ms, about 35 minutes 25 seconds |

Most elapsed time reflects the site's `Crawl-delay: 120`, which was respected.
That delay was NOT reduced for the validation. It is a real runtime constraint,
not a reason to bypass robots rules.

The retained sources cover home, brand story, shipping, best sellers,
categories, bundles/offers and two blog/content pages. The page classified
`product` is actually a garlic category; `reviews` is actually an introduction
questionnaire. These incorrect classifications must not be counted as successful
SKU or testimonial coverage.

## Warnings and failure causes

- `sitemap_chunk_budget`: sitemap discovery did not finish through the default
  sitemap route. The worker marks the sitemap visited and does not preserve a
  retryable discovery checkpoint for this budget condition. Discovery therefore
  relied on HTML links instead of successfully reading a sitemap.
- `chunk_budget`: `/faq` redirects to `/faq/`. The fetcher's next-hop request
  must respect the 120-second delay, but cannot fit into its chunk budget. Two
  attempts failed, and the FAQ was not collected. This is a scanner limitation,
  not evidence that the site has no FAQ.
- `http_404`: one selected gifts-category URL returned 404 and was skipped.
  This is an unavailable source, not an invented finding.
- `brand_voice_ai_not_configured`, `products_commercial_ai_not_configured`,
  `audience_problems_ai_not_configured`, their exhausted-attempt warnings and
  `ai_attempt_budget_exhausted`: local configuration failure, NOT provider refusal
  or failed semantic interpretation. Differentiation/operations AI did not run.

## Notable misses and quality findings

1. **WooCommerce product coverage is wrong.** Real SKU URLs under `/shop/...`
   are classified as categories. The three-category quota is already consumed
   by category URLs, so representative SKU pages are not selected. Conversely,
   a `/product-category/...` URL containing a Hebrew product-related word is
   classified as a product. Actual product prices, variants and benefits were
   not produced as structured findings.
2. **Duplicate encoded URLs consume coverage.** Upper/lowercase hexadecimal
   escapes in the same Hebrew category path produce two records and identical
   content hashes. They occupy two of three category slots. Canonicalization
   should normalize equivalent percent escapes, NOT lowercase arbitrary paths.
3. **Relevant pages are misclassified.** `/introduction-questionnaire/` is a
   questionnaire, but is labeled reviews. Its title is not testimonial evidence.
4. **Slow-site redirects/discovery need persisted continuation.** Temporary
   chunk-budget exhaustion currently consumes retries or abandons discovery,
   instead of saving the next safe redirect/discovery step. The 120-second
   robots delay must remain respected in any fix; SSRF/DNS protection must not
   be weakened.
5. **Returns and support coverage is incomplete.** No dedicated returns or
   contact source was selected, and the FAQ was lost. It would be unsafe to
   infer missing operational policies from this scan.
6. **Finding count overstates semantic richness.** Twelve of thirteen findings
   are page-title metadata. Brand story, explicitly described audiences, product
   claims and commercial themes exist in retained source text, but did not
   become structured AI observations in this unconfigured run.

The site was checked independently for comparison, without injecting that
comparison text into the scan or manufacturing additional findings:

- [Brand story](https://ayeletspices.co.il/about/)
- [FAQ, with its canonical trailing slash](https://ayeletspices.co.il/faq/)
- [An actual SKU under the custom shop path](https://ayeletspices.co.il/shop/%D7%94%D7%A4%D7%9C%D7%90%D7%A4%D7%9C-%D7%A9%D7%9C-%D7%A0%D7%99%D7%A1%D7%99%D7%9D/)

## Usefulness for a future questionnaire

**Useful raw evidence, but not yet a sufficient structured-intelligence result.**
The retained story and policy text provide material for later client confirmation
of brand narrative, audience priorities and service promises. Shipping text is
already directly usable with its source. Titles mostly help locate evidence;
they are not adequate substitutes for positioning, benefits or commercial scope.

The current findings alone would not support a reliably tailored questionnaire
across products, audience, differentiation, voice and operations. Actual AI
quality remains untested here, and discovery gaps would remain even with a key.
Never interpret an absent finding as proof that the website/business lacks it.
No questionnaire, Brand Brain, strategy or client-verified truth was generated.

## Integrity and recommendation

Read-only full-row comparison against the restored Production-state baseline
confirmed zero missing or changed original records across all 26 legacy tables,
including the original Ayelet client, users, contacts, reports and connections.
Only new synthetic client/user/scan/audit records were added in rehearsal.

**Not a complete product-quality GO for Production rollout.** The earlier
migration/recovery/regression results remain valid, but the representative
client quality gate should stay open until:

1. Slow robots-delay redirects and sitemap steps resume without dropping coverage.
2. WooCommerce/custom product paths and equivalent URL deduplication are corrected.
3. Accepted/rejected real AI findings are reviewed for actual usefulness. The
   temporary Preview follow-up now exercises the existing Preview credential;
   it also identifies semantic/provenance weaknesses requiring refinement.

No application fixes or infrastructure changes were implemented in the initial
local task. The separately authorized Preview follow-up used deployment-only
overrides and removed its temporary deployments afterward.
Private sanitized metrics and public evidence are preserved under
`.tmp/epic2-rehearsal-20261005/addz-*`; no secret values were printed or stored.
