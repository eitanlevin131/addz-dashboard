import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const metricsUrl = moduleUrl(await readFile(new URL("../src/lib/metrics.ts", import.meta.url), "utf8"));
const flashySource = (await readFile(new URL("../src/lib/flashy.ts", import.meta.url), "utf8")).replace('"./metrics"', JSON.stringify(metricsUrl));
const { monthWindows, getFlashyReports } = await import(moduleUrl(flashySource));
const normalizeSource = (await readFile(new URL("../src/lib/flashy-normalize.ts", import.meta.url), "utf8")).replace('"@/lib/metrics"', JSON.stringify(metricsUrl));
const { normalizeAutomationReports } = await import(moduleUrl(normalizeSource));

test("90-day windows cover every second once and no more than 30 calendar days", () => {
  const from = new Date("2026-06-09T12:45:00Z"), to = new Date("2026-09-07T12:45:00Z");
  const windows = monthWindows(from, to);
  assert.equal(windows[0].from, from.getTime() / 1000);
  assert.equal(windows.at(-1).to, to.getTime() / 1000);
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    assert.ok(Math.floor(w.to / 86400) - Math.floor(w.from / 86400) < 30);
    if (i) assert.equal(w.from, windows[i - 1].to + 1);
  }
  assert.throws(() => monthWindows(to, from));
  assert.equal(monthWindows(from, from).length, 1);
});

test("automation pages combine; one failed page is not reported as empty success", async (t) => {
  let fail = false;
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(url);
    if (u.pathname === "/reports/automations") {
      const from = Number(u.searchParams.get("from")), to = Number(u.searchParams.get("to"));
      assert.ok(to - from < 30 * 86400);
      calls.push({ from, to });
      if (fail && calls.length === 2) return Response.json({ success: false, message: "Unavailable" }, { status: 503 });
      return Response.json({ success: true, data: [{ date: new Date(from * 1000).toISOString().slice(0, 10), revenues: "100" }] });
    }
    return Response.json({ success: true, data: [] });
  });
  const from = Date.parse("2026-06-09T00:00:00Z") / 1000, to = from + 90 * 86400 - 1;
  const result = await getFlashyReports("test-key", from, to);
  assert.equal(result.automations.length, 3);
  assert.equal(result.checks[2].ok, true);
  calls.length = 0;
  fail = true;
  const failed = await getFlashyReports("test-key", from, to);
  assert.equal(failed.checks[2].ok, false);
  assert.deepEqual(failed.automations, []);
});

test("automation date and revenues survive normalization in Israel timezone", () => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Jerusalem";
  try {
    const [row] = normalizeAutomationReports([{ automation_id: 1, date: "2026-08-30", revenues: "₪1,234.50" }], "account");
    assert.equal(row.date, "2026-08-30");
    assert.equal(row.revenueGenerated, 1234.5);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
