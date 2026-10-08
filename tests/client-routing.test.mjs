import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_MODULES, dashboardPath, readDashboardRoute, resolveDashboardRoute, validClientSlug } from "../src/lib/client-routing.ts";
import { parseClientProfile } from "../src/lib/client-foundation.ts";
const id = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const client = { id, urlSlug: "celesta", visibleModules: ["reports", "planner", "ai"] };
const url = path => new URL(path, "https://dashboard.example");
test("every module round-trips through a stable client URL", () => {
  for (const [module, definition] of Object.entries(CLIENT_MODULES)) {
    const tab = definition.tab ?? "overview";
    assert.equal(dashboardPath(definition.view, client, tab), `/celesta/${module}`);
    const resolved = resolveDashboardRoute(readDashboardRoute(url(`/celesta/${module}`)), [client], true);
    assert.equal(resolved.clientId, id);
    assert.equal(resolved.view, definition.view);
    assert.equal(resolved.tab, definition.tab);
  }
});
test("UUID fallback remains valid after alias assignment and bare client defaults to reports", () => {
  assert.equal(dashboardPath("planner", { id }), `/${id}/gantt`);
  for (const path of [`/${id}/gantt`, "/celesta/gantt"]) assert.equal(resolveDashboardRoute(readDashboardRoute(url(path)), [client], false).clientId, id);
  assert.equal(readDashboardRoute(url("/celesta")).view, "overview");
});
test("legacy query URLs preserve module, client and all workspace tabs", () => {
  for (const tab of ["overview", "contacts", "activity", "website", "questionnaire", "kickoff"]) {
    const result = resolveDashboardRoute(readDashboardRoute(url(`/?view=client-workspace&clientId=${id}&tab=${tab}`)), [client], true);
    assert.equal(result.tab, tab);
    assert.equal(result.clientId, id);
  }
  assert.equal(readDashboardRoute(url("/")), null);
  assert.equal(dashboardPath("clients"), "/clients");
  assert.equal(dashboardPath("portfolio", client), "/?view=portfolio");
});
test("unknown client or module cannot fall back to another client", () => {
  for (const path of ["/unknown/gantt", `/celesta/no-module`, `/celesta/gantt/extra`, `/?view=overview&clientId=${second}`, "/celesta/__proto__"]) {
    assert.equal(resolveDashboardRoute(readDashboardRoute(url(path)), [client], true), null);
  }
});
test("client routes enforce team-only modules and assigned-client module visibility", () => {
  for (const [module, definition] of Object.entries(CLIENT_MODULES)) {
    const result = resolveDashboardRoute(readDashboardRoute(url(`/celesta/${module}`)), [client], false);
    assert.equal(result === null, definition.permission === "team");
  }
  assert.equal(resolveDashboardRoute(readDashboardRoute(url("/celesta/gantt")), [{ ...client, visibleModules: ["reports"] }], true), null);
  assert.equal(resolveDashboardRoute(readDashboardRoute(url("/celesta/reports")), [], false), null);
  assert.equal(resolveDashboardRoute(readDashboardRoute(url("/clients")), [client], false), null);
});
test("aliases are normalized, optional, unique-safe shaped and reserved paths are unavailable", () => {
  assert.equal(parseClientProfile({ name: "עסק", urlSlug: " CeLesTa " }).urlSlug, "celesta");
  assert.equal(parseClientProfile({ name: "עסק" }).urlSlug, null);
  for (const slug of ["api", "questionnaire", "summaries", "clients", "admin", "_next", "../celesta", "סלסטה", "-foo", "foo--bar", "a".repeat(81), id]) {
    assert.equal(validClientSlug(slug), false);
    assert.throws(() => parseClientProfile({ name: "עסק", urlSlug: slug }));
  }
  assert.equal(validClientSlug("brand-365"), true);
});
test("setting an alias once cannot invalidate shared links and unrelated edits preserve it", () => {
  assert.equal(parseClientProfile({ urlSlug: "celesta" }, true, client).urlSlug, "celesta");
  for (const urlSlug of [null, "", "another"]) assert.throws(() => parseClientProfile({ urlSlug }, true, client));
  assert.deepEqual(parseClientProfile({ name: "שם חדש" }, true, client), { name: "שם חדש" });
});
test("legacy internal query links retain only the authorized own-report fallback", () => {
  const route = readDashboardRoute(url(`/?view=client-workspace&clientId=${id}&tab=website`));
  assert.equal(resolveDashboardRoute(route, [client], false).view, "overview");
  assert.equal(resolveDashboardRoute(route, [client], false).clientId, id);
  assert.equal(resolveDashboardRoute(route, [], false), null);
  assert.equal(resolveDashboardRoute(route, [{ ...client, visibleModules: ["planner"] }], false), null);
  assert.equal(resolveDashboardRoute(readDashboardRoute(url("/celesta/website")), [client], false), null);
});
