import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_PACKAGES,
  derivePackageScope,
  packagePrices,
  servicesFromPackage,
} from "../src/lib/client-packages.ts";
import { parseClientProfile } from "../src/lib/client-foundation.ts";

test("ADDZ package registry defines the five commercial offers with exact prices", () => {
  const expected = {
    email_5: [3500, 0, 5],
    email_8: [5000, 0, 8],
    automation_setup_3: [0, 5000, null],
    automation_setup_6: [0, 9000, null],
    whatsapp_standalone: [0, 2000, null],
  };
  assert.equal(CLIENT_PACKAGES.length, Object.keys(expected).length);
  for (const [code, [monthly, oneTime, campaigns]] of Object.entries(
    expected,
  )) {
    const scope = derivePackageScope(code);
    const prices = packagePrices(code, scope);
    assert.equal(prices.monthlyAmount, monthly);
    assert.equal(prices.oneTimeAmount, oneTime);
    assert.equal(scope.campaignLimit, campaigns);
  }
});
test("three month email commitment includes three flows and Popup; six flow upgrade uses package pricing", () => {
  for (const [code, upgrade] of [
    ["email_5", 3000],
    ["email_8", 2000],
  ]) {
    const bundled = derivePackageScope(code, { initialCommitmentMonths: 3 });
    assert.equal(bundled.automationSetupTier, 3);
    assert.equal(bundled.includesPopup, true);
    assert.deepEqual(bundled.automationCodes, [
      "welcome",
      "checkout_abandonment",
      "post_purchase_reviews",
    ]);
    assert.equal(bundled.deliverables.length, 7);
    assert.equal(packagePrices(code, bundled).oneTimeAmount, 0);
    const expanded = derivePackageScope(code, {
      initialCommitmentMonths: 3,
      automationSetupTier: 6,
    });
    assert.equal(expanded.automationCodes.length, 6);
    assert.equal(packagePrices(code, expanded).oneTimeAmount, upgrade);
  }
  assert.equal(derivePackageScope("email_5").automationSetupTier, 0);
});
test("WhatsApp addons and standalone setups derive service scope without arbitrary checkboxes", () => {
  for (const code of [
    "email_5",
    "email_8",
    "automation_setup_3",
    "automation_setup_6",
  ]) {
    const scope = derivePackageScope(code, { whatsappAddon: true });
    assert.equal(
      packagePrices(code, scope).oneTimeAmount,
      packagePrices(code, derivePackageScope(code)).oneTimeAmount + 1000,
    );
    assert.ok(
      servicesFromPackage(code, scope).some((item) => item.code === "whatsapp"),
    );
    assert.ok(scope.deliverables.includes("whatsapp_setup"));
  }
  assert.deepEqual(
    servicesFromPackage(
      "whatsapp_standalone",
      derivePackageScope("whatsapp_standalone"),
    ),
    [{ code: "whatsapp" }],
  );
  assert.deepEqual(
    derivePackageScope("automation_setup_6").automationCodes.slice(3),
    ["browse_abandonment", "winback", "birthday"],
  );
});
test("commercial validation rejects incompatible or invented configuration and invalid one-time fees", () => {
  for (const [code, input] of [
    ["unknown", {}],
    ["email_5", { campaignLimit: 9 }],
    ["email_8", { initialCommitmentMonths: 6 }],
    ["email_5", { automationSetupTier: 6 }],
    ["automation_setup_3", { automationSetupTier: 6 }],
    ["automation_setup_6", { initialCommitmentMonths: 3 }],
    ["whatsapp_standalone", { whatsappAddon: true }],
    ["email_5", { whatsappAddon: "true" }],
    ["email_5", { initialCommitmentMonths: null }],
    ["email_5", { automationSetupTier: null }],
    ["email_5", { whatsappAddon: null }],
  ])
    assert.throws(() => derivePackageScope(code, input));
  for (const oneTimeAmount of [-1, "1.234", true, "1e3", "10000000000"])
    assert.throws(() =>
      parseClientProfile({
        name: "לקוח",
        packageCode: "email_5",
        oneTimeAmount,
      }),
    );
  assert.throws(() =>
    parseClientProfile({
      name: "לקוח",
      packageCode: "email_5",
      includedServices: [{ code: "sms" }],
    }),
  );
});
test("stored negotiated fees and scope snapshots survive unrelated edits and package changes", () => {
  const saved = parseClientProfile({
    name: "לקוח",
    packageCode: "email_5",
    commercialScope: {
      initialCommitmentMonths: 3,
      automationSetupTier: 6,
      whatsappAddon: true,
    },
    monthlyRetainerAmount: "3100.25",
    oneTimeAmount: "2200.50",
  });
  assert.equal(saved.monthlyRetainerAmount, "3100.25");
  assert.equal(saved.oneTimeAmount, "2200.50");
  const patch = parseClientProfile({ industry: "סחר" }, true, saved);
  assert.equal(patch.monthlyRetainerAmount, undefined);
  assert.equal(patch.oneTimeAmount, undefined);
  assert.deepEqual(patch.commercialScope, saved.commercialScope);
  const changed = parseClientProfile(
    {
      packageCode: "email_8",
      commercialScope: {
        initialCommitmentMonths: 3,
        automationSetupTier: 6,
        whatsappAddon: true,
      },
    },
    true,
    saved,
  );
  assert.equal(changed.commercialScope.campaignLimit, 8);
  assert.equal(changed.monthlyRetainerAmount, undefined);
  assert.equal(changed.oneTimeAmount, undefined);
  const addon = parseClientProfile(
    { commercialScope: { whatsappAddon: false } },
    true,
    saved,
  );
  assert.equal(addon.commercialScope.initialCommitmentMonths, 3);
  assert.equal(addon.commercialScope.automationSetupTier, 6);
  assert.throws(() =>
    parseClientProfile({ commercialScope: { version: 2 } }, true, saved),
  );
  assert.throws(() => parseClientProfile({ packageCode: null }, true, saved));
});
test("legacy profiles retain their free-text label, services and prices until explicit conversion", () => {
  const legacy = {
    name: "ישן",
    packageName: "Legacy Growth",
    includedServices: [{ code: "sms" }],
    monthlyRetainerAmount: "1800.00",
    packageCode: null,
    commercialScope: null,
    oneTimeAmount: null,
  };
  const patch = parseClientProfile({ internalNotes: "הערה" }, true, legacy);
  assert.deepEqual(patch, { internalNotes: "הערה" });
  assert.throws(() =>
    parseClientProfile({ packageCode: "email_5" }, true, legacy),
  );
  const converted = parseClientProfile(
    {
      packageCode: "email_5",
      monthlyRetainerAmount: "1800",
      oneTimeAmount: "0",
    },
    true,
    legacy,
  );
  assert.equal(converted.monthlyRetainerAmount, "1800.00");
  assert.deepEqual(converted.includedServices, [{ code: "newsletter" }]);
});
