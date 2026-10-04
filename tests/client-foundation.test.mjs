import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLIENT_SERVICES,
  parseClientProfile,
  parseContact,
  parseIncludedServices,
  requireUuid,
} from "../src/lib/client-foundation.ts";

test("service registry defines stable unique codes and Hebrew labels", () => {
  assert.equal(
    new Set(CLIENT_SERVICES.map((service) => service.code)).size,
    CLIENT_SERVICES.length,
  );
  assert.ok(CLIENT_SERVICES.every((service) => service.label));
  assert.deepEqual(
    parseIncludedServices(CLIENT_SERVICES.map(({ code }) => ({ code }))),
    CLIENT_SERVICES.map(({ code }) => ({ code })),
  );
  assert.throws(() => parseIncludedServices("newsletter"));
  assert.throws(() =>
    parseIncludedServices([{ code: "newsletter" }, { code: "newsletter" }]),
  );
  assert.throws(() => parseIncludedServices([{ code: "invented" }]));
});
test("contract amount is nullable, bounded, precise and not website revenue", () => {
  assert.equal(parseClientProfile({ name: "עסק" }).monthlyRetainerAmount, null);
  assert.equal(
    parseClientProfile({ name: "עסק", monthlyRetainerAmount: 0 })
      .monthlyRetainerAmount,
    "0.00",
  );
  assert.equal(
    parseClientProfile({ name: "עסק", monthlyRetainerAmount: "1530.25" })
      .monthlyRetainerAmount,
    "1530.25",
  );
  for (const value of [-1, true, "NaN", "1.234", "1e5", "10000000000"])
    assert.throws(() =>
      parseClientProfile({ name: "עסק", monthlyRetainerAmount: value }),
    );
  assert.equal(
    parseClientProfile({ name: "עסק", monthlyRevenue: 500 }).monthlyRevenue,
    undefined,
  );
});
test("profile dates and websites are validated and patch does not erase absent fields", () => {
  assert.throws(() => parseClientProfile({ name: " " }));
  assert.throws(() =>
    parseClientProfile({ name: "עסק", website: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    parseClientProfile({ name: "עסק", startDate: "2026-02-30" }),
  );
  assert.deepEqual(
    parseClientProfile({ packageName: "Growth", role: "owner" }, true),
    { packageName: "Growth" },
  );
  assert.throws(() => parseClientProfile({ role: "owner" }, true));
});
test("contacts are separate from login users and normalize optional data", () => {
  assert.deepEqual(
    parseContact({
      name: " לירון ",
      email: "LIRON@example.com",
      role: "owner",
    }),
    {
      name: "לירון",
      email: "liron@example.com",
      jobTitle: null,
      phone: null,
      isPrimary: false,
    },
  );
  assert.throws(() => parseContact({ name: "לירון", email: "wrong" }));
  assert.throws(() => parseContact({ name: "לירון", isPrimary: "true" }));
  assert.throws(() => requireUuid("not-a-uuid"));
});
test("foundation writes use transactions and APIs enforce staff access", async () => {
  const service = await readFile(
    new URL("../src/lib/clients.ts", import.meta.url),
    "utf8",
  );
  const api = await readFile(
    new URL("../src/lib/client-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /db\.batch\(\[\s*insert,.*event/s);
  assert.match(service, /for update/);
  assert.match(api, /requireAdmin\(\)/);
});
