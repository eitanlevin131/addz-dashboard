import test from "node:test";
import assert from "node:assert/strict";
import { campaignTiming, measuredRate } from "../src/lib/report-chart-data.ts";

test("campaigns are grouped by account timezone, not the viewer clock", () => {
  const rows = [{ sentAt: "2026-09-06T22:30:00Z", revenue: 200, purchases: 2 }, { sentAt: "2026-09-06T23:30:00Z", revenue: 0, purchases: 0 }];
  const israel = campaignTiming(rows, "Asia/Jerusalem");
  const usa = campaignTiming(rows, "America/New_York");
  assert.equal(israel.days[1].revenue, 200);
  assert.equal(israel.days[1].count, 2);
  assert.equal(usa.days[0].count, 2);
  assert.equal(israel.days.reduce((s,r)=>s+r.revenue,0), 200);
  assert.equal(israel.hours.reduce((s,r)=>s+r.purchases,0), 2);
});

test("missing observations remain distinct from a real zero", () => {
  const result = campaignTiming([{ sentAt: "2026-09-06T10:00:00Z", revenue: 0, purchases: 0 }, { sentAt: "invalid", revenue: 999, purchases: 1 }], "UTC");
  assert.equal(result.days[0].count, 1);
  assert.equal(result.days[0].revenue, 0);
  assert.equal(result.days[1].count, 0);
  assert.equal(measuredRate(0, 100), 0);
  assert.equal(measuredRate(10, 0), null);
  assert.equal(measuredRate(NaN, 100), null);
  assert.equal(measuredRate(150, 100), 1.5);
  assert.equal(campaignTiming([], "invalid zone").timezone, "UTC");
});
