import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const source = await readFile(new URL("../src/lib/sync-policy.ts", import.meta.url), "utf8");
const {
  deriveSyncHealth,
  getRetryDelayMs,
  isTransientSyncStatus,
  validateSyncCompleteness,
} = await import(moduleUrl(source));

test("sync health reports active, failed, stale and healthy runs", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(
    deriveSyncHealth("2026-09-14T10:00:00Z", {
      status: "running",
      startedAt: "2026-09-14T11:55:00Z",
      finishedAt: null,
      errorMessage: null,
    }, now).status,
    "syncing",
  );
  assert.equal(
    deriveSyncHealth("2026-09-14T10:00:00Z", {
      status: "failed",
      startedAt: "2026-09-14T11:00:00Z",
      finishedAt: "2026-09-14T11:01:00Z",
      errorMessage: "rate limited",
    }, now).status,
    "failed",
  );
  assert.equal(deriveSyncHealth("2026-09-12T12:00:00Z", null, now).status, "stale");
  assert.equal(deriveSyncHealth("2026-09-14T10:00:00Z", null, now).status, "healthy");
  assert.equal(deriveSyncHealth(null, null, now).status, "never");
});

test("retry policy retries network, rate-limit and server failures with bounded backoff", () => {
  assert.equal(isTransientSyncStatus(null), true);
  assert.equal(isTransientSyncStatus(429), true);
  assert.equal(isTransientSyncStatus(503), true);
  assert.equal(isTransientSyncStatus(401), false);
  assert.deepEqual([1, 2, 3, 4].map(getRetryDelayMs), [500, 1500, 4500, 4500]);
});

test("completeness rejects failed endpoints and normalization loss", () => {
  const complete = validateSyncCompleteness({
    checks: [{ label: "אימייל", ok: true, count: 2 }],
    raw: { emails: 2, sms: 1, automations: 3 },
    normalized: { emails: 2, sms: 1, automations: 3 },
  });
  assert.equal(complete.complete, true);

  const incomplete = validateSyncCompleteness({
    checks: [{ label: "SMS", ok: false, message: "Unavailable" }],
    raw: { emails: 2, sms: 1, automations: 3 },
    normalized: { emails: 2, sms: 0, automations: 3 },
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.issues.length, 2);
});
