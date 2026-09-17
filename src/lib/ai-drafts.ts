export type AiDraftKind = "sms" | "subject";
export type AiDraftStatus = "draft" | "approved";

export type AiDraftInput = {
  kind: AiDraftKind;
  title: string;
  content: string;
  preheader: string | null;
  status: AiDraftStatus;
  metadata: Record<string, unknown>;
};

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeAiDraftInput(value: Record<string, unknown>, partial = false): Partial<AiDraftInput> {
  const result: Partial<AiDraftInput> = {};
  if (!partial || "kind" in value) result.kind = value.kind === "subject" ? "subject" : "sms";
  if (!partial || "title" in value) result.title = cleanText(value.title, 180);
  if (!partial || "content" in value) result.content = cleanText(value.content, 4_000);
  if (!partial || "preheader" in value) result.preheader = cleanText(value.preheader, 500) || null;
  if (!partial || "status" in value) result.status = value.status === "approved" ? "approved" : "draft";
  if (!partial || "metadata" in value) {
    result.metadata = value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? value.metadata as Record<string, unknown>
      : {};
  }
  return result;
}

export function validateAiDraftInput(value: Partial<AiDraftInput>) {
  if (!value.title?.trim()) return "צריך לתת לטיוטה כותרת.";
  if (!value.content?.trim()) return "אי אפשר לשמור טיוטה ריקה.";
  return null;
}
