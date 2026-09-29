# Product Backlog

## Monthly summaries - production validation

The release-hardening workflow is implemented: required inputs block approval, drafts stay private,
approved reports are available to assigned clients, email subject and opening copy are editable, and
generation, approval, WhatsApp sharing, email delivery, permissions, list-health data, and mobile RTL
rendering are covered by end-to-end tests.

Completed production checks:

- August 2026 was validated against Flashy for revenue, purchases, campaigns, automations, and leaders. The remaining Sales Overview difference is the documented Flashy attribution-window behavior.
- A production summary email was delivered through the verified Resend domain and its interactive report link opened successfully.
- Daily cron sync and metric snapshots were verified for every active account on September 29, 2026.

Remaining operational check:

- Complete one login and report review with an actual client user on their own device.

## Agency monthly close

- Staff-only monthly close center is implemented with per-client summary status, missing manual inputs, source counts, sync health, metric snapshot status, and cost configuration QA.
- Client users cannot access the cross-account close center.
- Desktop and mobile behavior are covered by the critical E2E journey.

## Planner - campaign creation workflow

- Allow creating a campaign brief without a send date or send time; both can be scheduled later.
- Keep undated briefs in a visible "Unscheduled" queue outside the calendar grid.
- Support Email, SMS, and Email + SMS as channels.
- Treat every planner item as a campaign; remove the type selector.
- Remove owner and Flashy URL from the creation flow.
- Replace the single asset URL with multiple links and secure file attachments.
- Keep the initial form short: title, brief, and channel. Put schedule, audience, offer, coupon, and assets in optional sections.
- Support dragging an unscheduled brief onto a calendar day, duplicating a campaign, and saving while immediately adding another.
- Model Email + SMS so one planned item can later match both an email campaign and an SMS campaign in Flashy.
