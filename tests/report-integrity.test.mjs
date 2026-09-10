import test from "node:test";
import assert from "node:assert/strict";
import { latestCampaignReports, latestAutomationReports } from "../src/lib/report-identity.ts";
import { accountLocalTimestamp, accountDate, reportRange } from "../src/lib/report-time.ts";

const campaign = (overrides = {}) => ({ id: "old", flashyAccountId: "a", campaignId: 272573, sentAt: new Date("2026-08-11T10:30:00Z"), revenue: 13206, raw: { sent_date: "2026-08-11", sent_time: "10:30:00" }, ...overrides });

test("timezone duplicates count one authoritative snapshot, not the highest revenue", () => {
  const old = campaign();
  const updated = campaign({ id: "new", sentAt: new Date("2026-08-11T07:30:00Z"), revenue: 12000, raw: { ...old.raw, _syncStartedAt: 100 } });
  assert.deepEqual(latestCampaignReports([old, updated]), [updated]);
  assert.deepEqual(latestCampaignReports([updated, old]), [updated]);
  assert.throws(() => latestCampaignReports([old, campaign({ id: "ambiguous" })]));
});

test("distinct sends and different accounts are not merged", () => {
  const rows = [campaign(), campaign({ id: "other-time", raw: { sent_date: "2026-08-11", sent_time: "16:00:00" } }), campaign({ id: "other-account", flashyAccountId: "b" })];
  assert.equal(latestCampaignReports(rows).length, 3);
});

test("an automation changing inferred channel replaces its daily snapshot", () => {
  const rows = [{ id: "old", flashyAccountId: "a", automationId: 60685, reportDate: "2026-09-07", channel: "email", revenue: 819, raw: {} }, { id: "new", flashyAccountId: "a", automationId: 60685, reportDate: "2026-09-07", channel: "sms", revenue: 1170, raw: { _syncStartedAt: 100 } }];
  assert.equal(latestAutomationReports(rows).reduce((s,r)=>s+r.revenue,0),1170);
});

test("account dates and 30-day boundaries do not depend on server TZ", () => {
  const before = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Jerusalem", "America/New_York"]) {
      process.env.TZ = zone;
      assert.equal(accountLocalTimestamp("2026-08-11", "10:30:00", "Asia/Jerusalem"), "2026-08-11T07:30:00.000Z");
      const range = reportRange(30,"Asia/Jerusalem",new Date("2026-09-09T10:00:00Z"));
      assert.equal(accountDate(new Date(range.start),"Asia/Jerusalem"),"2026-08-11");
      assert.equal(accountDate(new Date(range.end),"Asia/Jerusalem"),"2026-09-09");
    }
    assert.equal(accountLocalTimestamp("2026-01-11", "10:30:00", "Asia/Jerusalem"), "2026-01-11T08:30:00.000Z");
    assert.equal(accountLocalTimestamp("2026-08-11", "10:30:00", "America/New_York"), "2026-08-11T14:30:00.000Z");
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});
