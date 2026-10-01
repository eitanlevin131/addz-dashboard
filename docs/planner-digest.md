# Daily planner email

The production cron sends a daily planning email to `OWNER_EMAIL` (or the first
`ADMIN_EMAILS` address when OWNER_EMAIL is absent). It uses the existing
`RESEND_API_KEY`, `EMAIL_FROM`, and `CRON_SECRET` configuration.

Two daily triggers at 05:00 and 06:00 UTC call the same implementation. The
handler only sends during hour 08 in `Asia/Jerusalem`, covering Israeli summer
and winter time. Vercel Hobby may execute within that hour rather than exactly
at 08:00. Resend's daily idempotency key prevents duplicate deliveries on retries.

The email includes scheduled campaigns two through seven calendar days ahead,
grouped into preparation (days 2-3), planning (days 4-7), and ready-to-send items.
Undated briefs are listed separately. Ideas and fully matched/sent plans are
excluded. Mixed plans are excluded only when both email and SMS are matched.
Active account connections only are included. The email is sent even when empty,
so the owner can distinguish an empty schedule from a missing delivery.

Brief links load authorized dashboard data before selecting the client and
opening the plan. A login is still required. Data is read directly from the
planner; generating this factual digest does not require an AI model call.

After deployment, verify that the production environment contains the four
variables above and that a digest reaches the owner during the next 08:00 hour.
The two endpoints are `/api/cron/planner-digest` and
`/api/cron/planner-digest/winter`, both protected by the cron bearer secret.
# Test Delivery

The owner can send a tomorrow-preview from Admin using the planner email test button.
The authenticated same-origin POST `/api/admin/planner-digest-test` sends only to
the configured owner address. It uses live current plans, tomorrow's date, a test
subject prefix and a separate daily idempotency key; scheduled delivery is unaffected.
Repeated tests in the same day are deduplicated by Resend.
