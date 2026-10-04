import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DIAGNOSTIC_EXPIRES_AT,
  handleDatabaseIdentityDiagnostic,
  inspectDatabase,
  normalizeNeonIdentity,
} from "../src/lib/database-identity-diagnostic.ts";

const connectionString = "postgresql://secret-user:secret-password@ep-test-example-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&token=secret-token";
const now = DIAGNOSTIC_EXPIRES_AT - 60_000;
function fixture(overrides = {}) {
  const calls = [];
  const session = { user: { email: "owner@example.test" }, userId: "owner-id", sessionVersion: 3, expires: new Date(now + 30_000).toISOString() };
  return {
    calls,
    dependencies: {
      now: () => now,
      environment: "production",
      requestHostname: "addz-dashboard.vercel.app",
      deploymentUrl: "addz-dashboard-test.vercel.app",
      commitSha: "a".repeat(40),
      getSession: async () => session,
      isOwnerEmail: (email) => email === "owner@example.test",
      getDatabaseUrl: () => connectionString,
      inspect: async (...args) => {
        calls.push(args);
        return { user: { id: "owner-id", role: "owner", status: "active", session_version: 3 }, databaseName: "neondb" };
      },
      ...overrides,
    },
  };
}

test("owner receives only allowlisted identity and never credentials or session data", async () => {
  const { dependencies, calls } = fixture();
  const response = await handleDatabaseIdentityDiagnostic(dependencies);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["hostname", "endpointId", "databaseName", "environment", "deploymentUrl", "commitSha", "fingerprint"].sort());
  assert.equal(body.hostname, "ep-test-example.c-7.us-east-1.aws.neon.tech");
  assert.equal(body.endpointId, "ep-test-example");
  assert.equal(body.databaseName, "neondb");
  assert.match(body.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(calls.length, 1);
  for (const secret of ["secret-user", "secret-password", "secret-token", "owner-id", "owner@example.test", connectionString]) {
    assert.ok(!JSON.stringify(body).includes(secret));
  }
});

for (const role of ["admin", "agency", "manager", "client"]) {
  test(`${role} is denied before database inspection`, async () => {
    const { dependencies, calls } = fixture({ getSession: async () => ({ user: { email: `${role}@example.test` }, userId: role, sessionVersion: 3, expires: new Date(now + 30_000).toISOString() }) });
    const response = await handleDatabaseIdentityDiagnostic(dependencies);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(calls.length, 0);
  });
  test(`configured owner with stored ${role} role is denied without promotion`, async () => {
    const { dependencies } = fixture({ inspect: async () => ({ user: { id: "owner-id", role, status: "active", session_version: 3 }, databaseName: "neondb" }) });
    assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, 403);
  });
}

for (const session of [null, {}, { user: { email: "owner@example.test" } }, { user: { email: "owner@example.test" }, userId: "owner-id", sessionVersion: 3, expires: new Date(now).toISOString() }]) {
  test("missing or expired authentication is denied without a query", async () => {
    const { dependencies, calls } = fixture({ getSession: async () => session });
    assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, 401);
    assert.equal(calls.length, 0);
  });
}

for (const [name, user, expected] of [
  ["suspended", { id: "owner-id", role: "owner", status: "suspended", session_version: 3 }, 403],
  ["inactive", { id: "owner-id", role: "owner", status: "invited", session_version: 3 }, 403],
  ["stale version", { id: "owner-id", role: "owner", status: "active", session_version: 4 }, 401],
  ["stale user ID", { id: "different-id", role: "owner", status: "active", session_version: 3 }, 401],
  ["deleted", null, 401],
]) {
  test(`${name} user is denied`, async () => {
    const { dependencies } = fixture({ inspect: async () => ({ user, databaseName: "neondb" }) });
    assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, expected);
  });
}

test("pooled and direct hostnames yield the same identity", () => {
  assert.deepEqual(normalizeNeonIdentity(connectionString), normalizeNeonIdentity(connectionString.replace("-pooler.", ".")));
  for (const invalid of ["not a URL", "postgresql://user:password@localhost/neondb", "postgresql://user:password@ep-test.neon.tech.attacker.test/neondb", "https://ep-test.neon.tech/neondb"]) {
    assert.throws(() => normalizeNeonIdentity(invalid));
  }
});

test("fixed expiry denies requests before reading authentication or connecting", async () => {
  for (const time of [DIAGNOSTIC_EXPIRES_AT, DIAGNOSTIC_EXPIRES_AT + 1]) {
    const { dependencies, calls } = fixture({ now: () => time, getSession: async () => { throw new Error("Must not read authentication"); } });
    const response = await handleDatabaseIdentityDiagnostic(dependencies);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(calls.length, 0);
  }
});

test("expiry during inspection does not disclose identity", async () => {
  let reads = 0;
  const { dependencies } = fixture({ now: () => ++reads === 1 ? now : DIAGNOSTIC_EXPIRES_AT });
  assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, 410);
});

test("Preview and local environments cannot use the diagnostic", async () => {
  for (const environment of [undefined, "preview", "development"]) {
    const { dependencies, calls } = fixture({ environment });
    assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, 404);
    assert.equal(calls.length, 0);
  }
});

test("immutable deployment aliases cannot expose the diagnostic after rollback", async () => {
  for (const requestHostname of ["addz-dashboard-test.vercel.app", "addz-dashboard-git-main.vercel.app", "localhost"]) {
    const { dependencies, calls } = fixture({ requestHostname, getSession: async () => { throw new Error("Must not read authentication"); } });
    assert.equal((await handleDatabaseIdentityDiagnostic(dependencies)).status, 404);
    assert.equal(calls.length, 0);
  }
});

test("database and session failures produce a generic response with no logging", async () => {
  for (const failingDependency of ["inspect", "getSession", "getDatabaseUrl"]) {
    const { dependencies } = fixture({ [failingDependency]: () => { throw new Error(`failure ${connectionString} cookie=secret-cookie auth=secret-auth-token`); } });
    const response = await handleDatabaseIdentityDiagnostic(dependencies);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Diagnostic unavailable" });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("database adapter uses a bounded read-only transaction and parameterized SELECTs", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    throw new Error("Mock failure: never contact a database");
  };
  try {
    await assert.rejects(inspectDatabase(connectionString, "owner@example.test"));
    assert.equal(request.options.headers["Neon-Batch-Read-Only"], "true");
    assert.equal(request.options.headers["Neon-Batch-Isolation-Level"], "RepeatableRead");
    assert.equal(request.options.cache, "no-store");
    assert.ok(request.options.signal instanceof AbortSignal);
    const body = JSON.parse(request.options.body);
    assert.equal(body.queries.length, 3);
    assert.ok(body.queries.every((query) => /^SELECT\b/.test(query.query)));
    assert.match(body.queries[0].query, /statement_timeout.*2000/);
    assert.deepEqual(body.queries[1].params, ["owner@example.test"]);
    assert.ok(!body.queries[1].query.includes("owner@example.test"));
    assert.match(body.queries[2].query, /current_database\(\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("route does not import mutating authorization helpers or emit raw logs", async () => {
  const route = await readFile(new URL("../src/app/api/system/database-identity/route.ts", import.meta.url), "utf8");
  const implementation = await readFile(new URL("../src/lib/database-identity-diagnostic.ts", import.meta.url), "utf8");
  assert.ok(!/requireOwner|requireAdmin|getAccessContext|auth\/access/.test(route));
  assert.ok(!/console\.|(?:db|sql)\.update\(|\.insert\(|\.delete\(/.test(route + implementation));
  assert.match(route, /maxDuration = 10/);
  assert.match(route, /getServerSession\(authOptions\)/);
});
