import test from "node:test";
import assert from "node:assert/strict";
import { combineMetricSummaries } from "../src/lib/metrics.ts";
import { canonicalPortfolioAccounts } from "../src/lib/portfolio.ts";

const summary = (overrides = {}) => ({
  revenue: 0,
  smsCost: 0,
  smsCostUsd: 0,
  fixedCosts: 0,
  subscriptionCostIls: 0,
  profit: 0,
  roas: null,
  recipients: 0,
  delivered: 0,
  opens: 0,
  clicks: 0,
  purchases: 0,
  conversionRate: 0,
  revenuePerMessage: 0,
  ...overrides,
});

test("portfolio totals sum accounts and calculate weighted ratios", () => {
  const result = combineMetricSummaries([
    summary({ revenue: 1_000, smsCost: 100, fixedCosts: 100, profit: 800, recipients: 1_000, delivered: 900, purchases: 9 }),
    summary({ revenue: 3_000, smsCost: 200, fixedCosts: 300, profit: 2_500, recipients: 2_000, delivered: 1_500, purchases: 30 }),
  ]);

  assert.equal(result.revenue, 4_000);
  assert.equal(result.profit, 3_300);
  assert.equal(result.roas, 4_000 / 700);
  assert.equal(result.conversionRate, 39 / 2_400);
  assert.equal(result.revenuePerMessage, 4_000 / 3_000);
});

test("portfolio without costs keeps ROAS unavailable", () => {
  const result = combineMetricSummaries([summary({ revenue: 1_000, profit: 1_000 })]);
  assert.equal(result.roas, null);
});

test("portfolio counts the newest connection once when a Flashy account was added twice", () => {
  const result = canonicalPortfolioAccounts([
    { id: "old", flashyAccountId: 11868, lastSyncAt: "2026-05-19T12:34:00.000Z" },
    { id: "current", flashyAccountId: 11868, lastSyncAt: "2026-09-14T09:24:14.000Z" },
    { id: "other", flashyAccountId: 13588, lastSyncAt: "2026-09-14T12:59:10.000Z" },
  ]);

  assert.deepEqual(result.map((account) => account.id).sort(), ["current", "other"]);
});
