# Product Backlog

## Monthly summaries - production validation

The release-hardening workflow is implemented: required inputs block approval, drafts stay private,
approved reports are available to assigned clients, email subject and opening copy are editable, and
generation, approval, WhatsApp sharing, email delivery, permissions, list-health data, and mobile RTL
rendering are covered by end-to-end tests.

Remaining operational checks:

- Validate one complete production month against Flashy for revenue, purchases, campaigns, automations, and leaders.
- Send one production email through the verified Resend domain and open its interactive report link as the assigned client.

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
