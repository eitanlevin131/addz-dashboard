import assert from "node:assert/strict";
import test from "node:test";
import {
  createLoginCode,
  hashLoginCode,
  hashLoginIdentity,
  isValidLoginEmail,
  loginCodeMatches,
  normalizeLoginEmail,
} from "../src/lib/auth/email-code-core.ts";

test("login codes are always six numeric digits", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(createLoginCode(), /^\d{6}$/);
  }
});

test("login code hashes are scoped to the challenge and compared safely", () => {
  const secret = "test-secret";
  const email = "person@example.com";
  const expected = hashLoginCode("challenge-a", email, "123456", secret);
  assert.equal(loginCodeMatches(expected, hashLoginCode("challenge-a", email, "123456", secret)), true);
  assert.equal(loginCodeMatches(expected, hashLoginCode("challenge-b", email, "123456", secret)), false);
  assert.equal(loginCodeMatches(expected, hashLoginCode("challenge-a", email, "654321", secret)), false);
  assert.equal(loginCodeMatches(expected, "invalid"), false);
});

test("login identities are normalized and stored as keyed hashes", () => {
  const normalized = normalizeLoginEmail("  Person@Example.COM ");
  assert.equal(normalized, "person@example.com");
  assert.equal(isValidLoginEmail(normalized), true);
  assert.equal(isValidLoginEmail("not-an-email"), false);
  assert.notEqual(hashLoginIdentity(normalized, "secret"), normalized);
  assert.notEqual(hashLoginIdentity(normalized, "secret"), hashLoginIdentity(normalized, "other-secret"));
});
