import assert from "node:assert/strict";
import test from "node:test";
import {
  parseManagedRole,
  resolveEffectiveRole,
  roleCanAccessAllClients,
  roleCanManageUsers,
} from "../src/lib/auth/access-policy.ts";

test("only the configured owner identity receives owner privileges", () => {
  assert.equal(resolveEffectiveRole("client", true), "owner");
  assert.equal(resolveEffectiveRole("owner", false), "admin");
  assert.equal(roleCanManageUsers(resolveEffectiveRole("owner", false)), false);
  assert.equal(roleCanManageUsers(resolveEffectiveRole("client", true)), true);
});

test("managers see all clients while client users remain restricted", () => {
  assert.equal(roleCanAccessAllClients("owner"), true);
  assert.equal(roleCanAccessAllClients("admin"), true);
  assert.equal(roleCanAccessAllClients("client"), false);
});

test("user management accepts only manager and client roles", () => {
  assert.equal(parseManagedRole("admin"), "admin");
  assert.equal(parseManagedRole("client"), "client");
  assert.equal(parseManagedRole("owner"), null);
  assert.equal(parseManagedRole("anything"), null);
});
