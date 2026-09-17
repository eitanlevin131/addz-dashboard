import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiDraftInput, validateAiDraftInput } from "../src/lib/ai-drafts.ts";

test("AI drafts normalize kind, status and bounded text", () => {
  const input = normalizeAiDraftInput({
    kind: "subject",
    status: "approved",
    title: "  ניסוי A/B  ",
    content: "  שורת נושא  ",
    preheader: "  טקסט מקדים  ",
    metadata: { sourceIds: [1, 2] },
  });
  assert.deepEqual(input, {
    kind: "subject",
    status: "approved",
    title: "ניסוי A/B",
    content: "שורת נושא",
    preheader: "טקסט מקדים",
    metadata: { sourceIds: [1, 2] },
  });
});

test("AI drafts reject empty titles and content", () => {
  assert.equal(validateAiDraftInput({ title: "", content: "SMS" }), "צריך לתת לטיוטה כותרת.");
  assert.equal(validateAiDraftInput({ title: "SMS", content: "" }), "אי אפשר לשמור טיוטה ריקה.");
  assert.equal(validateAiDraftInput({ title: "SMS", content: "תוכן" }), null);
});
