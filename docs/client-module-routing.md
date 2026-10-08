# Client and Module Routing

Local implementation; not deployed to Production.

The existing dashboard is reused at client/module paths. No separate application,
authentication system or navigation shell is introduced.

## Routes

| Path | Existing View |
| --- | --- |
| `/<client>/reports` | Email/report overview |
| `/<client>/gantt` | Planner |
| `/<client>/sms` | SMS reports |
| `/<client>/automations` | Automation reports |
| `/<client>/campaigns` | Campaigns |
| `/<client>/summaries` | Monthly summaries |
| `/<client>/ai` | AI/history |
| `/<client>/settings` | Team account settings |
| `/<client>/changes` | Team changes view |
| `/<client>/workspace` | Team Client Workspace overview |
| `/<client>/contacts` | Team contacts |
| `/<client>/activity` | Team activity |
| `/<client>/website` | Team Website Intelligence |
| `/<client>/questionnaire` | Team questionnaire review |
| `/<client>/kickoff` | Team characterization |
| `/clients` | Team clients list |

`/<client>` defaults to reports. `<client>` is either the permanent UUID or an
optional unique lowercase ASCII alias entered in the client profile, e.g.
`celesta`. UUID links remain valid after an alias is assigned. Existing records
are not backfilled and no alias is inferred from a mutable display name.

Aliases use letters, digits and single internal hyphens, up to 80 characters.
Reserved application routes and UUID-shaped aliases are rejected. An assigned
alias cannot be changed through the client API/form; this avoids silently
invalidating shared links. Renaming/alias history is intentionally deferred.
The DB unique index arbitrates concurrent claims to the same alias. Concurrent
first assignments on one client preserve the first stored alias.

## Compatibility and Permissions

Legacy `/?view=...&clientId=...&tab=...` links remain supported, including website
scan resume parameters. `/questionnaire#<token>` and `/summaries/<id>` retain
their existing meanings. Login returns to the original path and query.
Sidebar, client selection and Workspace tabs update history; refresh and browser
back/forward resolve the authorized client and module again.
For compatibility, an old internal Workspace query link opened by a client with
report access still opens that same authorized client's reports, never internal
Workspace data. New team-only module paths fail closed.

Direct client routes validate authorization server-side before querying/rendering
client data. Unknown clients/modules and unauthorized routes return the same
404 behavior. Existing APIs retain their 401/403 gates. A client alias is an
address, never a grant of access.

Clients without Flashy use a separate team-only routing index in dashboard data.
The report client list and portfolio remain restricted to active report accounts.
There is no fallback from an unknown URL to another client's report data.

## Database and Rollout

`0022_client_url_routing.sql` adds only nullable `clients.url_slug`, a unique
index and a format check. It changes no existing records and has no backfill.
It has been applied only to the isolated development/test database.

Before any future deployment, explicitly approve and rehearse `0022` against the
target schema, preserve recovery protection, migrate before deploying the code,
and verify legacy data and role boundaries. Production currently does not have
these routes. No Production migration, environment change, push or deployment
is part of this implementation task.

## Validation

Node 22.23.3: all 432 unit tests passed; lint passed without warnings and the
isolated Next.js/TypeScript production build passed. The broad browser run
passed 12 of 14 scenarios, identifying two compatibility regressions (legacy
client Workspace links and navigating away from a monthly summary). Both were
fixed. The final focused routing/dashboard run passed 7/7, including both
previously failing scenarios. The other browser scenarios cover questionnaire,
characterization and website scan/history/resume/cancel/retry behavior.

Tests verify direct-link login return, alias uniqueness/stability, UUID fallback,
refresh/back/forward, unknown clients, team-only modules, cross-client isolation,
module visibility and mobile RTL. Only synthetic isolated test clients were
created; customer integrations were mocked. No commit or deployment was made.
