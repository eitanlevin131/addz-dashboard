# Epic 1 - Approved implementation decisions

Product scope comes from [Master Spec](addz-os-master-spec.md) and [Roadmap](addz-os-roadmap.md). Implement only Epic 1.

- Reuse the existing database, clients, users, authentication, permissions and dashboard shell.
- The workspace is staff-only. Contacts do not grant login access; only the owner manages login users.
- `clients` represents both the client engagement and business for Epic 1. This is a deliberate simplification, not a permanent architectural restriction. A later CRM epic may introduce an Organization layer for companies with several brands/clients.
- The ILS contract fee is `monthlyRetainerAmount`, never `monthlyRevenue`. It is independent of website/Flashy revenue and account-level reporting costs.
- Included services are structured JSON with stable codes. Code definitions and Hebrew labels have one source in `src/lib/client-foundation.ts`. They are not module permissions.
- Reuse `audit_logs` for client activity; new writes and their activity records are atomic.
- Preserve legacy `owner` (contact email) and `onboardingStatus` (integration sync). New internal owner and onboarding stage have separate fields.
- Legacy clients receive no guessed retainer, contacts, owner or completed onboarding stage.
- No Organization, Deals, AI, questionnaire, scan, Brand Brain, kickoff or project management implementation in this epic.

## Migration safety

Read the actual target schema and migration history before any production migration. The journal references `0001_dear_hellion`, but its SQL file is absent. Do not replay migration history or use unrestricted `db:push` to repair it. Test the new additive migration on the isolated E2E database first. Production application requires a verified backup and a rollout decision; do not infer either from successful test execution.

## Implemented foundation

- Clients navigation uses the existing shell, Hebrew/RTL, light/dark theme and mobile menu. URLs use `/?view=clients` and `/?view=client-workspace&clientId=...`; they survive reload and browser history.
- The catalog includes clients without a Flashy connection, search, internal-owner and connection filters.
- Creation/editing includes business name, website, industry, package, ILS contract fee, structured services, start date, internal owner and notes.
- Contacts are separate from authentication users, support one primary contact, and serialize concurrent primary changes per client.
- The workspace has overview, contacts and paginated activity tabs; existing clients can connect Flashy without creating another client or erasing AI memory. Concurrent duplicate connections roll back atomically.
- Clients cannot call foundation APIs or access the workspace. Managers can manage client profiles and integrations, but only the existing system owner can provision login users.
- New clients begin at `client_created`. Later lifecycle stages are reserved for subsequent epics, not inferred from a successful integration sync.
- No Deal conversion was added because there is no existing Deal entity. No future-epic features were added.

## Verification - 2026-10-04

- `npm run test:unit`: 105 passed.
- `npm run lint`: passed without warnings.
- `npm run build`: passed, including TypeScript and route generation.
- `npx playwright test`: five journeys passed against isolated E2E storage and mocked Flashy/OpenAI/Resend. Coverage includes creation/editing, primary-contact concurrency, duplicate-connection concurrency, denied cross-client contact updates, internal-field isolation, empty-account navigation, dashboard sync/reports/Gantt/AI, monthly summaries and login/session permissions.
- Desktop and mobile screenshots are local artifacts under `output/playwright/epic1-*.png`; they contain test fixtures only.
- The two source documents were copied byte-for-byte into `docs/` before implementation.

## Database and deployment gate

- Applied missing **existing** baseline `0016_ambitious_silver_surfer.sql` to the isolated E2E database only; it was required by existing dashboard flows.
- Applied new additive `0017_public_jazinda.sql` to the isolated E2E database only. It extends `clients` and `audit_logs` and creates `client_contacts` with foreign keys and a partial unique-primary index.
- Read-only preflight confirmed all new test columns, related contact/activity columns, indexes and foreign keys exist. Test migration-history tables are absent.
- The configured application database still has the old schema, no Drizzle migration-history table and one group of duplicate external Flashy IDs. No application-data or production-schema mutation was made, and no legacy records were merged/backfilled.
- The actual Vercel database target and a restorable backup are not verified. Before deployment: verify that target and backup, reconcile migration history without replaying it, apply the reviewed additive SQL transaction, verify constraints, then deploy and smoke-test owner/manager/client access. Do not push an auto-deploying branch ahead of the schema.
- The new server code requires migration 0017. This is an intentional schema-before-code deployment order, not compatibility with an unmigrated database.
- Contract fees are stored independently of existing account reporting costs. There is no automatic backfill or synchronization between those values in Epic 1.
