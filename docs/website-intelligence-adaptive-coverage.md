# Website Intelligence: Adaptive Coverage Validation

Date: 2026-10-06. Local candidate on `codex/addz-os-epic-4`, based on
`25d1f44`. No Production deployment, data change, migration or provider
configuration change was performed. This work does not continue Epic 4.

## Decision

**NO-GO for the requested product-quality gate.** Catalog coverage and the
relevant regression suite improved/passed, but the real-AI pilot produced no
published AI interpretation. More source coverage alone has not yet delivered
the requested richer strategic understanding or sufficiently smart questionnaire.
No evidence gates were weakened to improve the finding count.

## Root Cause and Changes

The previous coverage selector imposed a five-product limit within a small
source budget, without first learning the catalog structure. Product URL
discovery was not separated from catalog metadata or deep product research.

The persisted worker now has bounded discovery and deep-research phases:

1. Discover URL candidates from robots-approved sitemaps and internal links.
2. Reserve discovery slots for home/about/policies/FAQ/contact and read listings.
3. Extract source-linked catalog records from JSON-LD and Shopify/WooCommerce
   HTML product cards, including names, URLs, exposed prices and collection labels.
4. Choose a stable deep-product sample by collection coverage, featured signals,
   price quartiles and bundle/subscription URL signals.
5. Feed the stored catalog records into evidence-preserving research chunks.
6. Retain the existing Research Intelligence, candidate-generation and strict
   publication pipeline unchanged.

Product identity collapses query variants, tracking parameters, encoded Hebrew
aliases and Shopify collection/product aliases. Pagination retains its fetch
identity even when the declared canonical points to the collection root.
Catalog discovery counts are explicitly not asserted to be the complete inventory.

No schema changes: catalog metadata uses existing source `extracted` JSON,
phase/checkpoints use existing scan state, and questionnaire catalog context
uses the existing snapshot JSON. Older checkpoints/snapshots remain supported.
SSRF pinning, redirect validation, robots/Disallow, crawl-delay cap, Retry-After,
lease fencing, resume/cancel, source evidence and team-only access are retained.

## Configurable Bounds

Central constants: `src/lib/website-intelligence/config.ts`.

| Bound | Value |
| --- | --- |
| Total selected source pages | 60 |
| URL candidates / sitemaps / HTTP requests / depth | 2,000 / 12 / 140 / 4 |
| Discovery pages / collections / listing pages | 28 / 12 / 20 |
| Pages per collection | 3 |
| Deep product minimum / maximum | 8 / 32, limited by actual candidates and remaining slots |
| Catalog records per source / unique catalog records | 100 / 1,000 |
| Response / stored source text | 2 MiB / 20,000 characters |
| Fetch / chunk / lease timeout | 10s / 45s / 90s |
| Existing generation-attempt cap | 6, unchanged |

Deep budget is the minimum of the product population and 32, bounded below by
8 or approximately twice its square root or twice the known group count.
Small catalogs can therefore be read in full; larger catalogs are sampled for
coverage, not maximum page count.

## Real Studio365 Pilot

Website: `https://studio365.co.il/`. A new synthetic client was created in the
isolated `addz_epic2_validation` database, endpoint `ep-summer-waterfall-aprx73rb`.
The existing user-created Studio365 client/questionnaire was not changed.

- Synthetic client: `f4339d26-8935-40f8-a2e5-36cf8ab23425`.
- Scan: `1cad2580-08f7-46df-bc36-8fe08e33f416`.
- Actual worker and real Preview-only OpenAI credential; no seeded findings.
- Flashy, email, Blob and scheduled customer work remained disabled/mocked.
- Final status: `completed_with_warnings`.

| Metric | Previous test | New pilot |
| --- | --- | --- |
| Discovered product URL candidates | 174 | 174 |
| All unique URL candidates | Not compared | 228 |
| Selected / successfully processed sources | 15 / 13 | 46 / 43 |
| Deep product pages | 5 | 27 |
| Unique products with catalog metadata | 5 | 79 |
| Products with exposed price | 5 | 78 |
| Listing groups represented by deep products | Not measured | 11 / 11 |
| Published deterministic findings | 34 | 128 |
| Published AI findings / inferred findings | Mocked AI baseline | 0 / 0 with real AI |
| End-to-end wall duration | About 2m 2s | 8m 7s |

Listing groups include aggregate Shop All and Best Sellers, not eleven mutually
exclusive taxonomic categories. The final coverage helper was revalidated on
the persisted pilot sources after tightening this metric to listing groups only;
an earlier draft metric incorrectly included product-level category strings.
Final helper/UI changes were not used to justify any additional AI publication.

Home, FAQ, shipping and returns were read. Email/WhatsApp support information
was extracted from other sources, but no dedicated contact source completed.
No dedicated about source was covered. Three selected sources were skipped
because useful content required JavaScript. Broader listing pagination did not
expose enough fetchable links to fill all 174 discovered products with metadata.
The system does not guess unbounded pagination or add a browser renderer.

### Real AI and Manual Review

Twenty provider calls: twelve research generation/review calls, six candidate
generation calls, two candidate evidence-review calls.

- Usage: 243,978 input tokens and 13,878 output tokens.
- Approximate uncached upper estimate: USD 0.089, not an invoice. Actual cost
  may be lower with cached input. Pricing reference:
  https://developers.openai.com/api/docs/models/gpt-5-mini
- Research context contained 17 items, including known low-quality internal
  items: `נסו שוב.` as a product group, literal quotations as inferred tone,
  and social proof hypothesized from a product adjective.
- 24 candidate attempts: 18 deterministic rejections, four subsequent semantic
  review rejections, two not reviewed before the generation budget ended.
- Reasons included product-as-category, unsupported explicit audience,
  unsupported semantic type/hypothesis and incomplete commercial conditions.
- Two pending candidates were not published. No unsupported AI finding reached
  the public questionnaire because no AI candidate was published.

An existing worker ordering problem was exposed: the global generation-attempt
exit runs before draining pending evidence review. It was not changed in this
coverage task. Another example needing separate bounded investigation is an
explicit ergonomic-support benefit rejected by the current semantic rule.
Neither a blanket cap increase nor weaker evidence validation is recommended.

Warnings retained: JavaScript-required content; rejected/invalid AI evidence in
brand, product, audience and differentiation tasks; exhausted product attempts;
exhausted global AI attempt budget.

## Questionnaire Consequences

The normal isolated creation flow produced an unapproved, unanswered draft with
eight sections, eight confirmations and twelve ASK questions for the email
package. It uses observed source findings only; Research Intelligence is context,
never an authority or automatically confirmed fact.

New snapshots distinguish 174 discovered product URLs, 79 catalogued products
and 27 deeply read pages. Catalog confirmations show readable names/prices and
sampling context, not an unformatted full JSON catalog. Deep product confirmations
are capped at two; catalog confirmations at four, within the existing balanced
known-information selection. The questionnaire does not ask the client to
approve all 79 individual products or imply they are the entire catalog.

Operational/catalog context is materially better. Strategic confirmations about
audience, voice, positioning and pains remain missing because real AI publication
did not pass. No link was issued, answers filled, or customer message sent.

## Validation

Node 22.23.3; isolated database and provider guards.

- Full unit suite: 366 passed, zero failures/skips, including ten new catalog tests.
- ESLint: zero errors; three existing unused-variable warnings in unchanged AI files.
- TypeScript and production build: passed.
- Relevant E2E: ten unique scenarios passed. Initial run was nine pass/one test
  fixture failure; explicit UUID/text parameter casts corrected that fixture and
  the affected questionnaire scenario then passed on rerun.
- Regression covered clients/packages/contacts/activity/Flashy linking, reports,
  Gantt, summaries, AI history, real mocked login boundaries, client restrictions,
  scan consent/summary/questionnaire handoff, leases/concurrency/expiry, resume,
  cancel/history, sparse/challenge/partial/retry behavior, questionnaire autosave,
  submission and mobile RTL.
- Visual review of the real isolated scan summary found and corrected numeric
  pair RTL direction; scan coverage is readable on mobile.
- No migrations, Production writes, Production deploy, push or customer messages.

## Remaining Limitations / Next Bounded Gate

1. Real AI publication quality is the blocker, not the five-product cap anymore.
2. Listing metadata is partial; JS-only listings/contact/content remain unavailable.
3. Diversity uses category/price/featured/URL signals, not a learned template
   fingerprint; different SKU/color paths can still consume separate slots.
4. Broader catalog availability is not asserted as a definitive fact; existing
   deep-source inventory-conflict handling remains authoritative.
5. This real pilot validates Studio365; platform fixture tests are not real-site
   validation of every ecommerce platform.
6. Larger source coverage adds wall time, stored evidence and AI input cost.

Recommended next task: separately address pending evidence-review exhaustion
and the demonstrated false-positive/false-negative semantic boundaries using
the saved sources/responses. Preserve strict source evidence and rerun only the
necessary AI/publication stages before any further customer-facing quality gate.
Do not continue Epic 4 or deploy Production from this result.
