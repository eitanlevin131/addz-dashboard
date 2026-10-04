# Epic 1 - Approved implementation decisions

Product scope comes from [Master Spec](addz-os-master-spec.md) and [Roadmap](addz-os-roadmap.md). Implement only Epic 1.

- Reuse the existing database, clients, users, authentication, permissions and dashboard shell.
- The workspace is staff-only. Contacts do not grant login access; only the owner manages login users.
- `clients` represents both the client engagement and business for Epic 1. This is a deliberate simplification, not a permanent architectural restriction. A later CRM epic may introduce an Organization layer for companies with several brands/clients.
- The ILS contract fee is `monthlyRetainerAmount`, never `monthlyRevenue`. It is independent of website/Flashy revenue and account-level reporting costs.
- Included services are structured JSON with stable codes. Service codes, Hebrew labels, packages and addons have one source in `src/lib/client-packages.ts`; `client-foundation.ts` re-exports the service definitions for existing consumers. They are not module permissions.
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

- `npm run test:unit`: 111 passed, including six commercial-package tests. Node reports the existing MODULE_TYPELESS_PACKAGE_JSON warning; no module-system change was made.
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
- The new server code requires migrations 0017 and 0018. This is an intentional schema-before-code deployment order, not compatibility with an unmigrated database.
- Contract fees are stored independently of existing account reporting costs. There is no automatic backfill or synchronization between those values in Epic 1.

## Commercial and UI refinement

- Central package definitions: `email_5` (ILS 3,500/month), `email_8` (ILS 5,000/month), `automation_setup_3` (ILS 5,000 once), `automation_setup_6` (ILS 9,000 once), `whatsapp_standalone` (ILS 2,000 once). WhatsApp addons cost ILS 1,000 once.
- Email packages include the seven management deliverables. A three-month commitment includes Popup plus Welcome, Checkout Abandonment and Post Purchase/Reviews. Six-flow upgrades add Browse Abandonment, Winback and Birthday, for ILS 3,000 or 2,000 according to the email package.
- Interpretation: the discounted six-flow upgrade belongs to the three-month initial setup. Month-to-month email management has no bundled setup; standalone automation packages remain available. No billing, invoicing, scope enforcement or future lifecycle workflow was added.
- Additive nullable fields on the existing `clients` table: `package_code`, `commercial_scope` (versioned JSON snapshot), `one_time_amount` (numeric ILS). `monthly_retainer_amount` remains the actual monthly fee, independent of site revenue.
- `commercial_scope` stores campaign limit, initial commitment, setup tier, WhatsApp addon, Popup, deliverable codes and automation codes. Services are derived, not independently selected for structured packages.
- Actual agreed monthly/one-time fees are stored separately. Creation supplies defaults only when fees are omitted. Editing or changing packages never reprices existing fees; the form provides an explicit reset-to-price-list action. Ordinary edits also retain the stored scope snapshot, even if future definitions change.
- Legacy labels, services and fees are not guessed or backfilled. Existing clients remain in legacy mode until an explicit package selection; legacy service API behavior is retained for compatibility.
- Applied additive `0018_worried_spitfire.sql` to the isolated E2E database only. The read-only preflight verifies all three columns on that target and confirms they remain absent from the application target. No production changes, schema-history reconstruction or deploy were performed.
- The catalog has compact filters and desktop rows, and a mobile list without horizontal scrolling. The constrained form has five sections, conditional package controls, a persistent bottom save/cancel bar and separate actual-price inputs. Workspace headers show the engagement, actual prices and services; overview/contacts/activity tabs are unchanged.
- Extended E2E coverage exercises every package's prices, incompatible services, email commitment/upgrade/addon selection, negotiated-price preservation after package change, legacy preservation, client isolation, mobile overflow and save-button visibility.
- Updated desktop/mobile artifacts: `output/playwright/epic1-clients-{desktop,mobile}.png`, `epic1-new-client-{desktop,mobile}.png`, `epic1-workspace-{desktop,mobile}.png`. All contain isolated test fixtures.

### Commercial UX clarification

- Engagement names distinguish monthly Email Marketing, a standalone automation project and WhatsApp-only automations. Email package selectors show only the monthly campaign count; persisted package names/codes, pricing and configuration remain unchanged.
- Existing commitment value `1` is presented as "ללא התחייבות ראשונית"; value `3` as "התחייבות ראשונית ל-3 חודשים". No data-model conversion is required. The bundled setup has explicit helper text, with an optional six-automation upgrade and its package-specific price beside it.
- The form's commercial summary shows the selected package, actual monthly and one-time fees, commitment, setup tier, WhatsApp status and operational deliverables. It updates from form state, never reprices negotiated fees, and uses the existing ADDZ colors with tighter field/section spacing.
- No API, permission, pricing-rule or migration changes were made in this clarification. Summary screenshots are `output/playwright/epic1-commercial-summary-{desktop,mobile}.png`.
