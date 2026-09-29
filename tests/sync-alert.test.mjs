import assert from "node:assert/strict";
import test from "node:test";
import { buildSyncAlertEmail } from "../src/lib/sync-alert.ts";

test("sync alert contains only actionable account details and a dashboard link", () => {
  const alert = buildSyncAlertEmail([
    { accountName: "Valeo", status: "failed", message: "Flashy returned 500", warnings: [] },
    { accountName: "Ayelet", status: "warning", message: "הסנכרון הסתיים עם חריגה", warnings: ["SMS: התקבלו 2 רשומות, ירידה חריגה לעומת 20"] },
  ], "https://dashboard.example");

  assert.match(alert.subject, /1 חשבונות נכשלו/);
  assert.match(alert.subject, /1 חשבונות דורשים בדיקה/);
  assert.match(alert.text, /Valeo/);
  assert.match(alert.text, /Ayelet/);
  assert.match(alert.text, /https:\/\/dashboard\.example/);
  assert.match(alert.html, /פתחו את המערכת לבדיקה/);
});

test("sync alert escapes account and provider text before rendering HTML", () => {
  const alert = buildSyncAlertEmail([
    { accountName: "<Client>", status: "failed", message: "bad <script>", warnings: [] },
  ], "https://dashboard.example/?a=1&b=2");

  assert.doesNotMatch(alert.html, /<Client>|<script>/);
  assert.match(alert.html, /&lt;Client&gt;/);
  assert.match(alert.html, /a=1&amp;b=2/);
});
