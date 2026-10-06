# Epic 2: Ayelet Real AI Preview Validation

Date: 2026-10-05. Scope: real AI interpretation of previously collected public
website evidence, using a synthetic client in the isolated rehearsal database.
This is not a new crawl, Production deployment, migration, or questionnaire.

## Runtime and isolation

- Website: https://ayeletspices.co.il/.
- Canonical Vercel project: `addz-dashboard`; temporary target: Preview.
- Application commit: `186e8196f8e50c302a6f19e19bc855e110ebeaed`, clean Git archive.
- Successful deployment: `dpl_DPfNji5v7iqP4QS5a2VCXmNLcQk3`.
- Runtime URL: `https://addz-dashboard-hty5qmseb-eitans-projects-5ee0b2bf.vercel.app`.
  Removed after validation; now returns 404.
- Node runtime: `22.x`; Vercel remote build passed.
- Database: `neondb`, rehearsal branch `br-long-star-apv42mqb`, endpoint
  `ep-floral-morning-apttpdqw.c-7.us-east-1.aws.neon.tech`.
- Synthetic client: `fb65b237-b2e4-4411-9a81-7494420fb846`.
- Original scan: `5ca2b1e6-0106-48cb-8cfb-be017cc4363e`; immutable and preserved.
- AI validation scan: `61c27674-c60c-4ece-9335-649d057ef33c`.
- New scan explicitly records `validationReplay.sourceScanId` and
  `recrawled: false`. Sources retain their original fetched timestamps,
  content/evidence and status. Source IDs and finding hashes are remapped to
  the new scan; original failed local AI runs are not deleted or reinterpreted.
- Existing sensitive Preview-only OpenAI key inherited inside Vercel;
  never retrieved locally, printed, or changed. Model: `gpt-5-mini`.
- Deployment-only database/auth/provider overrides; general Preview and
  Production environment-variable metadata remained exactly unchanged.
- Unique limited database login existed only in the rehearsal branch. Runtime
  client-table permissions were SELECT-only; write permissions were limited to
  scan/auth/audit work. New synthetic authentication identity and secret;
  no real user impersonation, email, or auth bypass.
- Flashy base disabled and encryption secret unusable; Resend/email and Blob
  credentials blank; scan notification explicitly disabled; no Preview Cron
  scheduling or manual Cron invocation.
- Unauthenticated scan access returned 401. Authenticated runtime returned the
  unique replay ID and original-source reference, proving rehearsal binding.

## Input coverage

The original real crawl discovered 317 candidates, selected 14 sources and
processed 12 records representing 11 unique useful bodies. Its 120-second
robots delay and all collection limitations remain unchanged. No page was
recrawled, and no hand-selected comparison text was injected into this replay.

Minimum evidence threshold passed: 11 distinct bodies, 29,051 characters.
Each task uses at most eight relevant distinct bodies, truncated to 2,400
characters each by the approved application. Input hashes for all five provider
calls were independently reconstructed from recorded source IDs and verified.

## Real AI results

| Measure | Result |
| --- | --- |
| Terminal state | `completed_with_warnings` |
| Tasks completed | 4/4 |
| Provider calls | 5: one rejected audience attempt, then successful retry |
| Raw candidate findings across attempts | 29 |
| Published AI findings | 11 |
| AI observed / inferred | 9 / 2 |
| Preserved deterministic findings in replay | 13 |
| Combined observed / inferred | 22 / 2 |
| Rejected candidate findings | 18 |
| Rejected because of evidence/source | 13: 12 unmatched snippets, 1 unavailable source ID |
| Rejected because of category/key classification | 5 |
| Invalid published snippets or duplicate findings | 0 / 0 |
| AI runtime wall time | 105,172 ms, about 1 minute 45 seconds |
| Individual provider-call duration | 13.6-18.0 seconds |
| Input / output tokens | 27,672 / 7,433; usage available for all five calls |
| Notification | `disabled`; no email sent |

Estimated uncached token cost: **$0.021784**, using $0.25 / million input and
$2.00 / million output tokens. This is a calculation, not an account billing
receipt; caching/credits could change the actual charge.
[Official GPT-5 mini pricing](https://developers.openai.com/api/docs/models/gpt-5-mini).

Rejected counts cover candidates across attempts, not 18 unique business facts.
All accepted snippets exist in the submitted source text, but substring
validation alone does NOT establish that the complete value is supported.
`observed` means a claimed observation from the website, not verified client truth.

## Findings and human quality review

| Published area | Usefulness / limitation |
| --- | --- |
| Likely audience | Clean/additive-free spice buyers and easy home cooking; correctly inferred/medium, not explicit audience truth. Some details contain editorial noise. |
| Use cases | Different meals and preparation methods; useful, but largely navigation/category evidence rather than SKU benefit detail. |
| Gift offers | Ready-made/customizable gift bundles and budget bands; useful commercial context, not proof of an active discount campaign. |
| Product-page commercial metadata | Prices/weights, variants and ratings mentioned in category text; NOT a reliable SKU-to-price catalog. |
| Best sellers | Correctly describes the site's best-seller claim, not independently measured sales ranking. |
| Differentiation | Clean spices, own production, freshness and exclusions; useful, but summary includes handmade/kosher claims not covered by its single cited excerpt. Handmade is present in another supplied page, illustrating missing multi-source attribution rather than proof of fabrication. |
| Shipping | Dispatch days, timing, methods and thresholds; useful, but distinct shipping-method conditions remain flattened into summary/details. |
| Support | Pickup notices/collection handling; NOT full support/contact-channel coverage. |
| Desired outcomes | Site promises easy meal improvement; summary says what customers want and is marked observed/high. That crosses from a site benefit promise to an inferred customer desire and needs review. |
| Tone | Friendly, instructional and approachable; correctly inferred/medium. |
| Vocabulary | Culinary guidance/content language; useful for later confirmation, not exhaustive brand voice. |

No substantive structured brand-name, brand-description or brand-story finding
was published; the relevant candidates failed validation. Raw story evidence is
retained, but page-title metadata must not be substituted for those observations.

The existing review dispositions were not changed automatically. The concerns
above are human audit notes, not claims that `needs_review` was persisted.

## Warnings and remaining gaps

- Preserved collection warnings: `sitemap_chunk_budget`, `chunk_budget`, `http_404`.
- Each successful task retained its `*_invalid_findings_rejected` warning.
- `audience_problems_invalid_ai_evidence` records the first failed attempt;
  the retry completed. Its warning remains as historical evidence.
- WooCommerce `/shop/` SKU classification, equivalent percent-encoded URL
  duplication and false product/review classifications still limit coverage.
- FAQ/redirect and sitemap continuation under the 120-second robots delay
  remain unresolved; dedicated returns/contact pages were not collected.
- Representative SKU names, mapped prices, variants and specific benefits are
  missing. Aggregate category-price text is not a substitute.
- AI rejected about 62% of candidates. The global key/category schema permits
  invalid pairings that are rejected later; evidence copying/source references
  are also unreliable. Guards work, but this output efficiency is not yet good.
- Confidence/classification is not enough: complete summaries/details need
  stronger semantic grounding and potentially multiple source references.

## Questionnaire-readiness recommendation

**Partially useful, not a complete autonomous intelligence pass.** Accepted
observations can inform later human/client confirmation of cooking use cases,
gift offers, voice and shipping practices. Likely audience remains an inference.
Missing findings should become gaps to investigate, never assumed negatives.

Before default automated downstream use, address crawl coverage, category/key
output alignment, and whole-value grounding/observed-versus-inferred accuracy.
Do not loosen evidence checks to make the acceptance count look better.
No Smart Questionnaire, Brand Brain, strategy or client-verified data was created.

## Integrity, deviation and cleanup

- Full-row comparison across all 26 original legacy tables: zero missing or
  changed source records, including the real copied Ayelet client and users.
- Original scan/sources/findings/AI-run snapshot hash remained unchanged.
- Canonical Production deployment remained `dpl_2PknjjSeRxTZdZsWwTcUt92nwJW5`;
  all project environment-variable metadata remained unchanged.
- First temporary build failed because the test harness overrode auth URLs
  with empty strings. Removed those overrides; Vercel auto-derived its Preview
  URL and the same unmodified application built successfully. No app fix.
- Successful and failed temporary deployments were removed; successful URL
  confirmed 404. Temporary rehearsal role changed to NOLOGIN; local temporary
  database/auth credentials removed from the private harness state.
- Synthetic replay evidence/results remain in the isolated database and private
  ignored artifacts. No application source change, push, main merge, migration,
  Production write, Production secret change, or Production deployment.
- Prior unit/lint/E2E results were not rerun: this task changed no application
  code. Its new checks were the remote build, genuine runtime AI flow, evidence
  validation, recorded input hashes, full legacy integrity and cleanup guards.

Recommendation remains **No-Go for an unconditional product-quality rollout**
until the identified quality gaps are addressed. Migration/recovery validation
from the earlier rehearsal is unaffected; this task authorizes no release.
