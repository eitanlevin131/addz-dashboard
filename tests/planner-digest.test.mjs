import assert from "node:assert/strict";
import test from "node:test";
import { digestClock, plannerDigestGroups, buildPlannerDigest } from "../src/lib/planner-digest.ts";

const plan = (id, date, extra = {}) => ({ id, date, clientId: "client", clientName: "Client", time: null, title: "Campaign", channel: "email", status: "planned", sent: false, ...extra });

test("digest excludes today, tomorrow and sent plans, and separates work from ready sends", () => {
  const groups = plannerDigestGroups([
    plan("today", "2026-10-01"), plan("tomorrow", "2026-10-02"),
    plan("urgent", "2026-10-03"), plan("next", "2026-10-08"), plan("far", "2026-10-09"),
    plan("ready", "2026-10-04", { status: "ready" }), plan("sent", "2026-10-03", { sent: true }),
    plan("brief", null), plan("idea", null, { status: "idea" }),
  ], "2026-10-01");
  assert.deepEqual(groups.map((g) => g.rows.map((p) => p.id)), [["urgent"], ["next"], ["ready"], ["brief"]]);
});

test("Israeli morning follows both summer and winter time", () => {
  assert.equal(digestClock(new Date("2026-10-01T05:00:00Z")).hour, 8);
  assert.equal(digestClock(new Date("2026-12-01T06:00:00Z")).hour, 8);
  assert.equal(digestClock(new Date("2026-12-01T05:00:00Z")).hour, 7);
});

test("email escapes client content and links to the exact brief", () => {
  const content = buildPlannerDigest([plan("brief", null, { title: "<script>" })], "2026-10-01", "https://app.example");
  assert.ok(content.html.includes("&lt;script&gt;"));
  assert.ok(content.text.includes("planId=brief"));
  assert.equal(content.count, 1);
});
