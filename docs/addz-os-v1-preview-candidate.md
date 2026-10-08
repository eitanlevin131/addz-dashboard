# ADDZ OS V1 Integrated Preview Candidate

Candidate branch: `codex/addz-os-epic-4`. This is not a Production release.
Production remains Epic 3 at
`ad4947f635a19657261bfe75c65ea81a43a1611d`, schema through `0020`.

## Included Behavior

- Normal client creation, website URL and explicit scan consent; persisted
  resumable scan progress, completion feedback and questionnaire handoff.
- Adaptive catalog discovery and bounded deep product research. Seven strategic
  domains use source-grounded synthesis and independent review, with explicit
  observed, inferred and hypothesis classifications. Research is not evidence
  or verified client truth.
- Structured packages/scope and custom/historical commercial pricing.
- Questionnaire review/approval and unique public links, readable RTL source
  presentation, autosave/resume, explicit uncertainty choices, business-story
  and strategic questions, four ranked categories and eight ranked products.
- A ten-section internal characterization document built from submitted answers,
  with direct editing, additional content, saved revisions and original evidence.
  It is not an Approved Brand Brain or an AI-generated final document.
- Authorized client/module routes using stable UUIDs and optional unique aliases.
  Legacy query links, report visibility and team-only module boundaries remain.
- Optional private brand attachments in existing answer JSON. Without a dedicated
  private store, uploads are disabled and folder links remain usable.

## Schema Requirements

`0019` and `0020` must already exist. `0021` creates
`client_characterizations` (12 columns, 8 constraints, 3 indexes).
`0022_client_url_routing.sql` additionally adds nullable `clients.url_slug`, its
unique index and format check. The integrated routes require `0022`; deploying
this candidate onto a `0021`-only database is not safe.

The existing Epic 4 isolated Preview database is `neondb` on branch
`br-floral-truth-apgxit0n`, endpoint `ep-summer-shape-apwj44zq` in Neon project
`icy-dawn-73041521`. `0019`/`0020`/`0021` are present; `0022` requires explicit
isolated-Preview approval. Production migrations are not authorized by this task.

## Validation Boundaries

Node 22.23.3: complete unit suite 432/432, no skipped tests in this workspace;
complete lint has zero errors and three pre-existing unused-variable warnings;
isolated production build and explicit TypeScript check passed.
The complete isolated browser suite passed **14/14 in one clean run**, including
dashboard regressions, routing, questionnaire submission/security, editable
characterization and scan resume/leases/cancellation/retries/partial outcomes.

Local browser tests use only the guarded synthetic validation database and mock
customer providers. They do not prove deployed real-AI operation. A fresh Preview
scan and complete deployed product journey remain separate acceptance gates.
Some historical model-response replay tests depend on retained local validation
files and are skipped when those files are absent in a clean checkout.

## Preview Safety And Product Test

- Preview must use an isolated database and synthetic authentication identities;
  copied real user identities and old public questionnaire tokens are inaccessible.
- Database, authentication and provider overrides must be deployment- or
  branch-scoped. Do not change Production bindings or generic Preview secrets.
- Use only the dedicated Preview OpenAI credential. Flashy, email, Blob and Cron
  must remain disabled. Private brand uploads are deferred unless a dedicated
  isolated private store is configured and its authorization lifecycle is tested.
- Automated validation uses separate synthetic records. The Product Owner chooses
  their own website and personally reviews, approves and fills their questionnaire.
- Do not merge `main`, deploy Production, send customer messages, build Brand Brain,
  export documents or start another Epic.
- Pending Planner/Cron delivery verification is an independent operational
  follow-up, not a blocker to this isolated Preview task.

Release readiness must be based on actual deployed results, not local screenshots
or old Preview deployments. Stop for Product Owner feedback before proposing any
Production release.
