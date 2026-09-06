import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword, validatePassword } from "../src/lib/auth/password.ts";
import { isOwnerEmail } from "../src/lib/auth/owner.ts";

test("salted hashes validate only the exact password", async () => {
  const password = "correct horse battery staple";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword(password + " ", first), false);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(await verifyPassword(password, first + "garbage"), false);
  assert.equal(await verifyPassword(password, "scrypt$00$00"), false);
  assert.equal(await verifyPassword("x".repeat(129), first), false);
});

test("password policy preserves spaces and supports long phrases", () => {
  assert.ok(validatePassword("short"));
  assert.ok(validatePassword("x".repeat(129)));
  assert.equal(validatePassword("a long memorable passphrase"), null);
});

test("only the configured owner can manage users", () => {
  const saved = { owner: process.env.OWNER_EMAIL, admins: process.env.ADMIN_EMAILS };
  try {
    delete process.env.OWNER_EMAIL;
    process.env.ADMIN_EMAILS = "owner@example.test,agency@example.test";
    assert.ok(isOwnerEmail(" OWNER@example.test "));
    assert.equal(isOwnerEmail("agency@example.test"), false);
    process.env.OWNER_EMAIL = "new-owner@example.test";
    assert.equal(isOwnerEmail("owner@example.test"), false);
    assert.ok(isOwnerEmail("new-owner@example.test"));
  } finally {
    for (const [key, value] of [["OWNER_EMAIL", saved.owner], ["ADMIN_EMAILS", saved.admins]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
