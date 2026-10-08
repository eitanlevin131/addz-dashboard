# Client and Module Routing: Scoped Release

This release adds only client/module URLs on the Epic 3 Production baseline.
Epic 4, questionnaire UX, custom-price UI and crawl/AI changes are excluded.

Clients may receive a unique optional immutable ASCII alias in the existing
client profile ("שם בקישור"). UUID links remain valid and old query links
remain supported. No automatic alias backfill is performed.

Routes: reports, gantt, sms, automations, campaigns, summaries, ai, settings,
changes, workspace, contacts, activity, website and questionnaire.
The bare client route defaults to reports. Kickoff is not included.

Aliases are addresses, not access grants. Existing authentication, assigned-client
permissions and module visibility apply; internal modules remain team-only.
Unknown or unauthorized authenticated paths fail closed with 404.

Only additive migration 0022 is required: nullable clients.url_slug, a unique
index and a format/length check. It is independent of 0021 and does not modify
existing records. Deployment must follow a fresh recovery point, consistent
backup, transaction rehearsal and legacy integrity verification.

Validation covers alias/UUID/legacy links, login return, refresh/back/forward,
alias assignment races, reserved paths, cross-client restrictions and mobile RTL.
Application rollback retains the additive column, index and check.
